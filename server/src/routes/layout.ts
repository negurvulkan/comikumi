import { Router } from "express";
import fs from "node:fs/promises";
import path from "node:path";
import multer from "multer";
import { ZipArchive } from "archiver";
import AdmZip from "adm-zip";
import { imageSizeFromFile } from "image-size/fromFile";
import { PageLayoutSchema, createEmptyLayout, type PageLayout } from "../../../shared/src/layoutSchema.js";
import { findVolume, listPages } from "../lib/projectScanner.js";
import { letteringFolderName } from "../lib/paths.js";
import { readSettings, type ActiveProject } from "../lib/projectStore.js";
import { asyncHandler } from "../lib/asyncHandler.js";
import { requireProjectRole, resolveCallerProjectRole } from "../lib/auth.js";
import { computeEtag, NEW_DOCUMENT_ETAG } from "../lib/etag.js";
import { withFileLock } from "../lib/fileLock.js";

export const layoutRouter = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });
const requireTranslator = requireProjectRole("translator");
const requireLetterer = requireProjectRole("letterer");

/** True if `next` differs from `prev` only in bubbles[].text/curvedTexts[].text —
 * server-side defense-in-depth for the "translator" role (see PUT .../layout below):
 * there's no granular text-only endpoint today, so a translator gets the same full-
 * layout PUT route as a letterer, but any geometry/style change outside `.text` is
 * rejected. Compares by zeroing out the `.text` maps on both sides and comparing the
 * rest via JSON.stringify — both objects passed through the exact same zod schema
 * parse, so key ordering is consistent and this is safe (not a general-purpose deep-
 * equal, just enough for this one check). */
function isTextOnlyChange(prev: PageLayout, next: PageLayout): boolean {
  if (prev.bubbles.length !== next.bubbles.length || prev.curvedTexts.length !== next.curvedTexts.length) return false;
  const strip = (layout: PageLayout) => ({
    ...layout,
    bubbles: layout.bubbles.map((b) => ({ ...b, text: {} })),
    curvedTexts: layout.curvedTexts.map((c) => ({ ...c, text: {} })),
  });
  return JSON.stringify(strip(prev)) === JSON.stringify(strip(next));
}

/** Resolves a page's layout JSON path — exported for pages.ts's thumbnail route, which
 * needs to know whether (and where) a saved layout exists to decide whether the
 * thumbnail should reflect it (see thumbnails.ts's doc comment). */
export async function layoutPathFor(volumeId: string, page: string, ctx?: ActiveProject) {
  const volume = await findVolume(volumeId, ctx);
  if (!volume) return undefined;
  const settings = await readSettings(ctx);
  const dir = path.join(volume.parentDir, letteringFolderName(volume.bookFolderName, settings.letteringSuffix));
  return { volume, dir, file: path.join(dir, `${page}.json`) };
}

layoutRouter.get(
  "/:id/pages/:page/layout",
  asyncHandler(async (req, res) => {
    const resolved = await layoutPathFor(req.params.id, req.params.page, req.activeProject);
    if (!resolved) {
      res.status(404).json({ error: "volume_not_found" });
      return;
    }
    const { volume, file } = resolved;
    try {
      const raw = await fs.readFile(file, "utf-8");
      res.setHeader("ETag", computeEtag(raw));
      res.json(PageLayoutSchema.parse(JSON.parse(raw)));
      return;
    } catch {
      // No layout saved yet -> return an empty one derived from the source image.
      const pages = await listPages(volume);
      const pageInfo = pages.find((p) => p.page === req.params.page);
      if (!pageInfo) {
        res.status(404).json({ error: "page_not_found" });
        return;
      }
      const dims = await imageSizeFromFile(pageInfo.absolutePath).catch(() => ({ width: 0, height: 0 }));
      res.setHeader("ETag", NEW_DOCUMENT_ETAG);
      res.json(createEmptyLayout(pageInfo.page, pageInfo.fileName, dims.width ?? 0, dims.height ?? 0));
    }
  })
);

layoutRouter.put(
  "/:id/pages/:page/layout",
  requireTranslator,
  asyncHandler(async (req, res) => {
    const resolved = await layoutPathFor(req.params.id, req.params.page, req.activeProject);
    if (!resolved) {
      res.status(404).json({ error: "volume_not_found" });
      return;
    }
    const parsed = PageLayoutSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "invalid_layout", details: parsed.error.flatten() });
      return;
    }
    const { dir, file } = resolved;
    const role = await resolveCallerProjectRole(req);
    const ifMatch = req.header("If-Match");

    await withFileLock(file, async () => {
      // Single read serves both the optimistic-concurrency check below and the
      // translator diff-guard — used to be two separate reads of the same file.
      let currentRaw: string | null = null;
      try {
        currentRaw = await fs.readFile(file, "utf-8");
      } catch {
        // No existing saved layout yet.
      }
      const currentEtag = currentRaw ? computeEtag(currentRaw) : NEW_DOCUMENT_ETAG;

      // Optimistic concurrency: only enforced when the client sends If-Match at all —
      // callers that never load-then-edit a page through the normal editor flow (JSON
      // import, "insert dialogue from script") don't send it and keep today's
      // last-write-wins behavior, which is correct for them (they're not editing a
      // stale in-memory copy of this exact document).
      if (ifMatch && ifMatch !== currentEtag) {
        const currentLayout = currentRaw ? PageLayoutSchema.parse(JSON.parse(currentRaw)) : null;
        res.status(409).json({ error: "layout_conflict", currentLayout });
        return;
      }

      // Translators get this same route (no granular text-only endpoint exists), but
      // are restricted to bubble/curved-text .text changes — see isTextOnlyChange()'s
      // doc comment. Letterer/admin/system-admin skip this check entirely.
      if (role === "translator") {
        // No existing saved layout — nothing to diff against yet; only allow if the
        // incoming layout has no non-text content a translator shouldn't be able to
        // introduce from scratch (an empty page has no bubbles to compare).
        const previous = currentRaw ? PageLayoutSchema.parse(JSON.parse(currentRaw)) : { ...parsed.data, bubbles: [], curvedTexts: [] };
        if (!isTextOnlyChange(previous, parsed.data)) {
          res.status(403).json({ error: "forbidden" });
          return;
        }
      }

      await fs.mkdir(dir, { recursive: true });
      const nextRaw = JSON.stringify(parsed.data, null, 2);
      await fs.writeFile(file, nextRaw, "utf-8");
      res.setHeader("ETag", computeEtag(nextRaw));
      res.json({ ok: true });
    });
  })
);

// Bundles every saved page-layout JSON of a volume into a single .zip download.
layoutRouter.get(
  "/:id/layouts/export-zip",
  asyncHandler(async (req, res) => {
    const volume = await findVolume(req.params.id, req.activeProject);
    if (!volume) {
      res.status(404).json({ error: "volume_not_found" });
      return;
    }
    const settings = await readSettings(req.activeProject);
    const dir = path.join(volume.parentDir, letteringFolderName(volume.bookFolderName, settings.letteringSuffix));
    let files: string[] = [];
    try {
      files = (await fs.readdir(dir)).filter((f) => f.endsWith(".json"));
    } catch {
      files = [];
    }
    if (files.length === 0) {
      res.status(404).json({ error: "no_saved_layouts_for_volume" });
      return;
    }

    res.setHeader("Content-Type", "application/zip");
    res.setHeader("Content-Disposition", `attachment; filename="${volume.bookFolderName}_lettering.zip"`);
    const archive = new ZipArchive({ zlib: { level: 9 } });
    archive.on("error", (err: Error) => res.status(500).end(String(err)));
    archive.pipe(res);
    for (const file of files) {
      archive.file(path.join(dir, file), { name: file });
    }
    await archive.finalize();
  })
);

// Reads every saved page-layout JSON of a volume (same directory listing as
// export-zip above) so the client can compute volume-wide reports ("wer sagt
// was im ganzen Band") without one request per page. Pages never opened/saved
// yet simply have no file here and are silently omitted — same limitation the
// ZIP export already has.
layoutRouter.get(
  "/:id/reports",
  asyncHandler(async (req, res) => {
    const volume = await findVolume(req.params.id, req.activeProject);
    if (!volume) {
      res.status(404).json({ error: "volume_not_found" });
      return;
    }
    const settings = await readSettings(req.activeProject);
    const dir = path.join(volume.parentDir, letteringFolderName(volume.bookFolderName, settings.letteringSuffix));
    let files: string[] = [];
    try {
      files = (await fs.readdir(dir)).filter((f) => f.endsWith(".json"));
    } catch {
      files = [];
    }
    const pages: { page: string; layout: unknown }[] = [];
    for (const file of files) {
      try {
        const raw = await fs.readFile(path.join(dir, file), "utf-8");
        const layout = PageLayoutSchema.parse(JSON.parse(raw));
        pages.push({ page: path.basename(file, ".json"), layout });
      } catch {
        // Corrupt/foreign JSON in the folder — skip it rather than fail the whole report.
      }
    }
    pages.sort((a, b) => a.page.localeCompare(b.page, undefined, { numeric: true }));
    res.json(pages);
  })
);

// Accepts a .zip of page-layout JSON files and writes the valid ones into the
// volume's "<band>_lettering" folder (existing files are overwritten).
layoutRouter.post(
  "/:id/layouts/import-zip",
  requireLetterer,
  upload.single("zip"),
  asyncHandler(async (req, res) => {
    const volume = await findVolume(req.params.id, req.activeProject);
    if (!volume) {
      res.status(404).json({ error: "volume_not_found" });
      return;
    }
    if (!req.file) {
      res.status(400).json({ error: "zip_file_required" });
      return;
    }

    let zip: AdmZip;
    try {
      zip = new AdmZip(req.file.buffer);
    } catch {
      res.status(400).json({ error: "invalid_zip_file" });
      return;
    }

    const settings = await readSettings(req.activeProject);
    const dir = path.join(volume.parentDir, letteringFolderName(volume.bookFolderName, settings.letteringSuffix));
    await fs.mkdir(dir, { recursive: true });

    const imported: string[] = [];
    const skipped: { file: string; reason: string }[] = [];
    for (const entry of zip.getEntries()) {
      const baseName = path.basename(entry.entryName);
      if (entry.isDirectory || !baseName.endsWith(".json")) continue;
      let parsed: unknown;
      try {
        parsed = JSON.parse(entry.getData().toString("utf-8"));
      } catch {
        skipped.push({ file: baseName, reason: "invalid_json" });
        continue;
      }
      const result = PageLayoutSchema.safeParse(parsed);
      if (!result.success) {
        skipped.push({ file: baseName, reason: "schema_mismatch" });
        continue;
      }
      const safeName = baseName.replace(/[^\w.\-]/g, "_");
      await fs.writeFile(path.join(dir, safeName), JSON.stringify(result.data, null, 2), "utf-8");
      imported.push(safeName);
    }

    res.json({ ok: true, imported, skipped });
  })
);
