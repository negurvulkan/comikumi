import { Router } from "express";
import fs from "node:fs/promises";
import path from "node:path";
import multer from "multer";
import { isSafeFileName } from "./paths.js";
import { getActiveProjectAssetDir } from "./projectStore.js";
import { asyncHandler } from "./asyncHandler.js";

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
}

async function listDir(dir: string, allowedExt: Set<string>): Promise<string[]> {
  await fs.mkdir(dir, { recursive: true });
  const entries = await fs.readdir(dir);
  return entries.filter((name) => allowedExt.has(path.extname(name).toLowerCase()));
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
  const { kind, globalDir, urlPrefix, allowedExt, uploadFieldName, maxFileSizeBytes, mimeByExt, defaultMimeOnServe, enrichEntry } = opts;
  const router = Router();
  const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: maxFileSizeBytes } });

  router.get(
    "/",
    asyncHandler(async (_req, res) => {
      const merged = new Map<string, { fileName: string; url: string; scope: "global" | "project" }>();

      for (const fileName of await listDir(globalDir, allowedExt)) {
        merged.set(fileName, { fileName, url: `${urlPrefix}/file/${encodeURIComponent(fileName)}`, scope: "global" });
      }

      const projectDir = await getActiveProjectAssetDir(kind);
      if (projectDir) {
        for (const fileName of await listDir(projectDir, allowedExt)) {
          // Project-scoped file wins on a same-named global entry — deliberate, see
          // GET /file/:fileName below for the matching lookup order.
          merged.set(fileName, { fileName, url: `${urlPrefix}/file/${encodeURIComponent(fileName)}`, scope: "project" });
        }
      }

      const results = await Promise.all(
        Array.from(merged.values()).map(async (entry) => {
          if (!enrichEntry) return entry;
          const absPath = path.join(entry.scope === "project" ? (projectDir as string) : globalDir, entry.fileName);
          const extra = await enrichEntry(entry.fileName, absPath);
          return { ...entry, ...extra };
        })
      );
      res.json(results);
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
      const ext = path.extname(fileName).toLowerCase();
      if (!allowedExt.has(ext)) {
        res.status(400).json({ error: "unsupported_file_type", params: { kind } });
        return;
      }
      if (mimeByExt?.[ext]) res.type(mimeByExt[ext]);
      else if (defaultMimeOnServe) res.type(defaultMimeOnServe);

      // Project folder wins on a same-named collision, matching GET / above — try it
      // first (if configured) and only fall back to the global dir on ENOENT.
      const projectDir = await getActiveProjectAssetDir(kind);
      if (projectDir) {
        try {
          await fs.access(path.join(projectDir, fileName));
          res.sendFile(path.join(projectDir, fileName));
          return;
        } catch {
          // not in the project folder — fall through to the global one
        }
      }
      res.sendFile(path.join(globalDir, fileName));
    })
  );

  router.post(
    "/",
    upload.single(uploadFieldName),
    asyncHandler(async (req, res) => {
      if (!req.file) {
        res.status(400).json({ error: "file_required", params: { field: uploadFieldName } });
        return;
      }
      const ext = path.extname(req.file.originalname).toLowerCase();
      if (!allowedExt.has(ext)) {
        res.status(400).json({ error: "unsupported_file_type", params: { kind } });
        return;
      }
      const projectDir = await getActiveProjectAssetDir(kind);
      const targetDir = projectDir ?? globalDir;
      await fs.mkdir(targetDir, { recursive: true });
      const safeName = req.file.originalname.replace(/[^\w.\- ]/g, "_");
      const absPath = path.join(targetDir, safeName);
      await fs.writeFile(absPath, req.file.buffer);

      const extra = enrichEntry ? await enrichEntry(safeName, absPath) : {};
      res.json({ ok: true, fileName: safeName, scope: projectDir ? "project" : "global", ...extra });
    })
  );

  return router;
}
