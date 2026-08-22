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
import { readSettings } from "../lib/projectStore.js";
import { asyncHandler } from "../lib/asyncHandler.js";
import { requireProjectRole, resolveCallerProjectRole } from "../lib/auth.js";

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

async function layoutPathFor(volumeId: string, page: string) {
  const volume = await findVolume(volumeId);
  if (!volume) return undefined;
  const settings = await readSettings();
  const dir = path.join(volume.parentDir, letteringFolderName(volume.bookFolderName, settings.letteringSuffix));
  return { volume, dir, file: path.join(dir, `${page}.json`) };
}

layoutRouter.get(
  "/:id/pages/:page/layout",
  asyncHandler(async (req, res) => {
    const resolved = await layoutPathFor(req.params.id, req.params.page);
    if (!resolved) {
      res.status(404).json({ error: "volume_not_found" });
      return;
    }
    const { volume, file } = resolved;
    try {
      const raw = await fs.readFile(file, "utf-8");
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
      res.json(createEmptyLayout(pageInfo.page, pageInfo.fileName, dims.width ?? 0, dims.height ?? 0));
    }
  })
);

layoutRouter.put(
  "/:id/pages/:page/layout",
  requireTranslator,
  asyncHandler(async (req, res) => {
    const resolved = await layoutPathFor(req.params.id, req.params.page);
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
    // Translators get this same route (no granular text-only endpoint exists), but are
    // restricted to bubble/curved-text .text changes — see isTextOnlyChange()'s doc
    // comment. Letterer/admin/system-admin skip this check entirely.
    const role = await resolveCallerProjectRole(req);
    if (role === "translator") {
      let previous: PageLayout | null = null;
      try {
        previous = PageLayoutSchema.parse(JSON.parse(await fs.readFile(file, "utf-8")));
      } catch {
        // No existing saved layout — nothing to diff against yet; only allow if the
        // incoming layout has no non-text content that a translator shouldn't be
        // able to introduce from scratch (an empty page has no bubbles to compare).
        previous = { ...parsed.data, bubbles: [], curvedTexts: [] };
      }
      if (!isTextOnlyChange(previous, parsed.data)) {
        res.status(403).json({ error: "forbidden" });
        return;
      }
    }
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(file, JSON.stringify(parsed.data, null, 2), "utf-8");
    res.json({ ok: true });
  })
);

// Bundles every saved page-layout JSON of a volume into a single .zip download.
layoutRouter.get(
  "/:id/layouts/export-zip",
  asyncHandler(async (req, res) => {
    const volume = await findVolume(req.params.id);
    if (!volume) {
      res.status(404).json({ error: "volume_not_found" });
      return;
    }
    const settings = await readSettings();
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
    const volume = await findVolume(req.params.id);
    if (!volume) {
      res.status(404).json({ error: "volume_not_found" });
      return;
    }
    const settings = await readSettings();
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
    const volume = await findVolume(req.params.id);
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

    const settings = await readSettings();
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
