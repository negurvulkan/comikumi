import { Router } from "express";
import fs from "node:fs/promises";
import path from "node:path";
import multer from "multer";
import { isSafeFileName, isSafeFolderPath } from "./paths.js";
import { getActiveProjectAssetDir } from "./projectStore.js";
import { asyncHandler } from "./asyncHandler.js";
import { requireProjectRole } from "./auth.js";

type AssetKind = "fonts" | "images" | "bubble-svgs";

interface AssetRouterOptions {
  kind: AssetKind;
  /** Shared, project-independent storage dir (e.g. FONTS_DIR). */
  globalDir: string;
  /** e.g. "/api/fonts" — used to build each entry's `url`. */
  urlPrefix: string;
  allowedExt: Set<string>;
  /** multer FormData field name, e.g. "font" / "image" / "svg". */
  uploadFieldName: string;
  maxFileSizeBytes: number;
  /** Only images: sets res.type() when serving a file. */
  mimeByExt?: Record<string, string>;
  /** Only bubble-svgs: a fixed content-type for every served file. */
  defaultMimeOnServe?: string;
  /** Per-entry extra fields for the listing response — fonts add `family`, images add
   * `width`/`height` (reading the file from `absPath`), bubble-svgs add nothing. */
  enrichEntry?: (fileName: string, absPath: string) => Promise<Record<string, unknown>>;
  /** Turns on folder browsing/create/delete/move (images, bubble-svgs). Off by default
   * so fonts.ts keeps its exact current behavior (flat array, no folder routes) —
   * fonts are picked by family, not browsed, so there's no organizational need. */
  foldersEnabled?: boolean;
}

async function listDir(dir: string, allowedExt: Set<string>): Promise<string[]> {
  await fs.mkdir(dir, { recursive: true });
  const entries = await fs.readdir(dir);
  return entries.filter((name) => allowedExt.has(path.extname(name).toLowerCase()));
}

async function listSubfolders(dir: string): Promise<string[]> {
  const entries = await fs.readdir(dir, { withFileTypes: true }).catch(() => []);
  return entries.filter((e) => e.isDirectory()).map((e) => e.name);
}

function folderFromQuery(value: unknown): string | null {
  const folder = typeof value === "string" ? value : "";
  return isSafeFolderPath(folder) ? folder : null;
}

/**
 * Builds a CRUD-ish asset router (list/serve/upload) shared by fonts/images/bubble-svgs.
 * Merges the global (server/data) library with the active project's own asset folder,
 * if one is configured (`ProjectSettings.assetsDir`) — project-scoped files win on a
 * filename collision, in both the listing and single-file serving. New uploads go to
 * the project folder once one is configured, else fall back to the global dir, so
 * projects that never set assetsDir behave exactly as before this feature existed.
 */
export function createAssetRouter(opts: AssetRouterOptions): Router {
  const { kind, globalDir, urlPrefix, allowedExt, uploadFieldName, maxFileSizeBytes, mimeByExt, defaultMimeOnServe, enrichEntry, foldersEnabled } =
    opts;
  const router = Router();
  const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: maxFileSizeBytes } });

  router.get(
    "/",
    asyncHandler(async (req, res) => {
      const folder = foldersEnabled ? folderFromQuery(req.query.folder) : "";
      if (folder === null) {
        res.status(400).json({ error: "invalid_folder" });
        return;
      }
      const merged = new Map<string, { fileName: string; url: string; scope: "global" | "project" }>();
      const subfolders = new Set<string>();

      function entryUrl(fileName: string): string {
        const base = `${urlPrefix}/file/${encodeURIComponent(fileName)}`;
        return folder ? `${base}?folder=${encodeURIComponent(folder)}` : base;
      }

      const globalFolderDir = path.join(globalDir, folder);
      for (const fileName of await listDir(globalFolderDir, allowedExt)) {
        merged.set(fileName, { fileName, url: entryUrl(fileName), scope: "global" });
      }
      if (foldersEnabled) for (const name of await listSubfolders(globalFolderDir)) subfolders.add(name);

      const projectDir = await getActiveProjectAssetDir(kind, req.activeProject);
      if (projectDir) {
        const projectFolderDir = path.join(projectDir, folder);
        for (const fileName of await listDir(projectFolderDir, allowedExt)) {
          // Project-scoped file wins on a same-named global entry — deliberate, see
          // GET /file/:fileName below for the matching lookup order.
          merged.set(fileName, { fileName, url: entryUrl(fileName), scope: "project" });
        }
        if (foldersEnabled) for (const name of await listSubfolders(projectFolderDir)) subfolders.add(name);
      }

      const files = await Promise.all(
        Array.from(merged.values()).map(async (entry) => {
          if (!enrichEntry) return entry;
          const absPath = path.join(entry.scope === "project" ? (projectDir as string) : globalDir, folder, entry.fileName);
          const extra = await enrichEntry(entry.fileName, absPath);
          return { ...entry, ...extra };
        })
      );
      res.json(foldersEnabled ? { folder, subfolders: Array.from(subfolders).sort(), files } : files);
    })
  );

  router.get(
    "/file/:fileName",
    asyncHandler(async (req, res) => {
      const fileName = req.params.fileName;
      if (!isSafeFileName(fileName)) {
        res.status(400).json({ error: "invalid_file_name" });
        return;
      }
      const folder = foldersEnabled ? folderFromQuery(req.query.folder) : "";
      if (folder === null) {
        res.status(400).json({ error: "invalid_folder" });
        return;
      }
      const ext = path.extname(fileName).toLowerCase();
      if (!allowedExt.has(ext)) {
        res.status(400).json({ error: "unsupported_file_type", params: { kind } });
        return;
      }
      if (mimeByExt?.[ext]) res.type(mimeByExt[ext]);
      else if (defaultMimeOnServe) res.type(defaultMimeOnServe);

      // Project folder wins on a same-named collision, matching GET / above — try it
      // first (if configured) and only fall back to the global dir on ENOENT.
      const projectDir = await getActiveProjectAssetDir(kind, req.activeProject);
      if (projectDir) {
        try {
          await fs.access(path.join(projectDir, folder, fileName));
          res.sendFile(path.join(projectDir, folder, fileName));
          return;
        } catch {
          // not in the project folder — fall through to the global one
        }
      }
      res.sendFile(path.join(globalDir, folder, fileName));
    })
  );

  router.post(
    "/",
    requireProjectRole("letterer"),
    upload.single(uploadFieldName),
    asyncHandler(async (req, res) => {
      if (!req.file) {
        res.status(400).json({ error: "file_required", params: { field: uploadFieldName } });
        return;
      }
      const folder = foldersEnabled ? folderFromQuery(req.body?.folder) : "";
      if (folder === null) {
        res.status(400).json({ error: "invalid_folder" });
        return;
      }
      const ext = path.extname(req.file.originalname).toLowerCase();
      if (!allowedExt.has(ext)) {
        res.status(400).json({ error: "unsupported_file_type", params: { kind } });
        return;
      }
      const projectDir = await getActiveProjectAssetDir(kind, req.activeProject);
      const targetDir = path.join(projectDir ?? globalDir, folder);
      await fs.mkdir(targetDir, { recursive: true });
      const safeName = req.file.originalname.replace(/[^\w.\- ]/g, "_");
      const absPath = path.join(targetDir, safeName);
      await fs.writeFile(absPath, req.file.buffer);

      const extra = enrichEntry ? await enrichEntry(safeName, absPath) : {};
      res.json({ ok: true, fileName: safeName, folder, scope: projectDir ? "project" : "global", ...extra });
    })
  );

  if (foldersEnabled) {
    router.post(
      "/folders",
      requireProjectRole("letterer"),
      asyncHandler(async (req, res) => {
        const folder = typeof req.body?.folder === "string" ? req.body.folder : "";
        if (!folder || !isSafeFolderPath(folder)) {
          res.status(400).json({ error: "invalid_folder" });
          return;
        }
        const projectDir = await getActiveProjectAssetDir(kind, req.activeProject);
        await fs.mkdir(path.join(projectDir ?? globalDir, folder), { recursive: true });
        res.json({ ok: true, folder });
      })
    );

    router.delete(
      "/folders",
      requireProjectRole("letterer"),
      asyncHandler(async (req, res) => {
        const folder = folderFromQuery(req.query.folder);
        if (!folder) {
          res.status(400).json({ error: "invalid_folder" });
          return;
        }
        const projectDir = await getActiveProjectAssetDir(kind, req.activeProject);
        const bases = [globalDir, ...(projectDir ? [projectDir] : [])];
        const dirs = bases.map((base) => path.join(base, folder));

        let foundAny = false;
        for (const dir of dirs) {
          const entries = await fs.readdir(dir).catch(() => null);
          if (entries === null) continue;
          foundAny = true;
          if (entries.length > 0) {
            res.status(400).json({ error: "folder_not_empty" });
            return;
          }
        }
        if (!foundAny) {
          res.status(404).json({ error: "folder_not_found" });
          return;
        }
        for (const dir of dirs) await fs.rmdir(dir).catch(() => {});
        res.json({ ok: true });
      })
    );

    router.post(
      "/move",
      requireProjectRole("letterer"),
      asyncHandler(async (req, res) => {
        const fileName = typeof req.body?.fileName === "string" ? req.body.fileName : "";
        const fromFolder = typeof req.body?.fromFolder === "string" ? req.body.fromFolder : "";
        const toFolder = typeof req.body?.toFolder === "string" ? req.body.toFolder : "";
        if (!isSafeFileName(fileName)) {
          res.status(400).json({ error: "invalid_file_name" });
          return;
        }
        if (!isSafeFolderPath(fromFolder) || !isSafeFolderPath(toFolder)) {
          res.status(400).json({ error: "invalid_folder" });
          return;
        }
        const projectDir = await getActiveProjectAssetDir(kind, req.activeProject);
        const bases = [...(projectDir ? [projectDir] : []), globalDir]; // project takes priority, matching GET /file lookup order
        for (const base of bases) {
          const src = path.join(base, fromFolder, fileName);
          const exists = await fs
            .access(src)
            .then(() => true)
            .catch(() => false);
          if (!exists) continue;
          const destDir = path.join(base, toFolder);
          const dest = path.join(destDir, fileName);
          const destExists = await fs
            .access(dest)
            .then(() => true)
            .catch(() => false);
          if (destExists) {
            res.status(409).json({ error: "asset_move_conflict" });
            return;
          }
          await fs.mkdir(destDir, { recursive: true });
          await fs.rename(src, dest);
          res.json({ ok: true });
          return;
        }
        res.status(404).json({ error: "file_not_found" });
      })
    );
  }

  return router;
}
