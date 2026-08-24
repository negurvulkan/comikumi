import { Router } from "express";
import fs from "node:fs/promises";
import path from "node:path";
import multer from "multer";
import sharp from "sharp";
import { findVolume, listPages } from "../lib/projectScanner.js";
import { languageFolderName, isSafeFileName, isSafeFolderPath } from "../lib/paths.js";
import { readPresets, readSettings } from "../lib/projectStore.js";
import { ZipArchive } from "archiver";
import { asyncHandler } from "../lib/asyncHandler.js";
import { requireProjectRole } from "../lib/auth.js";
import { PageLayoutSchema } from "../../../shared/src/layoutSchema.js";
import { buildVectorPdfPage } from "../lib/vectorPdf/buildPdfPage.js";
import { buildLayeredPsd } from "../lib/psdExport.js";
import { resolveImageFilePath } from "../lib/imageResolver.js";

export const exportRouter = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });
const requireLetterer = requireProjectRole("letterer");

/** Fixed print resolution tag (metadata only — see export-print route doc comment for
 * why this never resamples pixels). 300dpi is the standard comic/manga print convention. */
const PRINT_DPI = 300;

exportRouter.post(
  "/:id/export",
  requireLetterer,
  upload.single("png"),
  asyncHandler(async (req, res) => {
    const volume = await findVolume(req.params.id);
    if (!volume) {
      res.status(404).json({ error: "volume_not_found" });
      return;
    }
    const { folderSuffix, page } = req.body as { folderSuffix?: string; page?: string };
    if (!folderSuffix || !page || !req.file) {
      res.status(400).json({ error: "export_fields_required" });
      return;
    }
    const settings = await readSettings();
    const dir = path.join(volume.parentDir, languageFolderName(volume.bookFolderName, folderSuffix, settings.exportFolderTemplate));
    await fs.mkdir(dir, { recursive: true });
    const file = path.join(dir, `${page}.png`);
    await fs.writeFile(file, req.file.buffer);
    res.json({ ok: true, path: path.relative(volume.parentDir, file) });
  })
);

/** Print-ready sibling of /export — converts the already-rendered RGB PNG (same pixels,
 * no rendering-pipeline change) into a CMYK TIFF with a 300dpi resolution tag. Pixel
 * dimensions are left untouched: this only tags the file's physical-size metadata, it
 * never resamples/upscales, since that would misrepresent a low-resolution scan as
 * print-sharp. CMYK conversion uses sharp's generic built-in profile (no FOGRA/SWOP ICC
 * profile) — good enough for a first cut, a known quality limitation until a real
 * profile is wired in (see docs/Professional-Workflow-Gaps.md). */
exportRouter.post(
  "/:id/export-print",
  requireLetterer,
  upload.single("png"),
  asyncHandler(async (req, res) => {
    const volume = await findVolume(req.params.id);
    if (!volume) {
      res.status(404).json({ error: "volume_not_found" });
      return;
    }
    const { folderSuffix, page } = req.body as { folderSuffix?: string; page?: string };
    if (!folderSuffix || !page || !req.file) {
      res.status(400).json({ error: "export_fields_required" });
      return;
    }
    let tiff: Buffer;
    try {
      // xres/yres (not withMetadata({density})) — withMetadata's ICC-profile handling
      // was overriding the cmyk colourspace conversion back to sRGB on read-back; the
      // tiff-specific resolution options avoid touching metadata/profile handling at all.
      // flatten() drops the rendered PNG's alpha channel against a white background
      // first — a printed page is opaque, and an alpha-carrying 5-channel CMYK+A TIFF
      // is non-standard prepress input that can confuse RIPs/print software.
      const pixelsPerMm = PRINT_DPI / 25.4;
      tiff = await sharp(req.file.buffer)
        .flatten({ background: "#ffffff" })
        .toColourspace("cmyk")
        .tiff({ compression: "lzw", xres: pixelsPerMm, yres: pixelsPerMm })
        .toBuffer();
    } catch (err) {
      res.status(400).json({ error: "print_export_failed", params: { reason: (err as Error).message } });
      return;
    }
    const settings = await readSettings();
    const dir = path.join(volume.parentDir, languageFolderName(volume.bookFolderName, folderSuffix, settings.exportFolderTemplate));
    await fs.mkdir(dir, { recursive: true });
    const file = path.join(dir, `${page}.tiff`);
    await fs.writeFile(file, tiff);
    res.json({ ok: true, path: path.relative(volume.parentDir, file) });
  })
);

/**
 * Vector print PDF — unlike /export and /export-print, the client sends the raw
 * PageLayout JSON (not an already-rendered raster blob): rendering happens HERE, on the
 * server, via server/src/lib/vectorPdf/buildPdfPage.ts, so that bubble/curved text can
 * become genuine PDF vector text instead of rasterized pixels (see that module's own
 * doc comment for what's covered — rect/oval exact, curved-path per-glyph exact,
 * quad-shape an affine approximation — and pdfXMetadata.ts for why `pdfxStamped` in the
 * response can legitimately come back false).
 */
exportRouter.post(
  "/:id/export-vector-pdf",
  requireLetterer,
  asyncHandler(async (req, res) => {
    const volume = await findVolume(req.params.id);
    if (!volume) {
      res.status(404).json({ error: "volume_not_found" });
      return;
    }
    const { folderSuffix, page, languageCode, pdfxVersion } = req.body as {
      folderSuffix?: string;
      page?: string;
      languageCode?: string;
      pdfxVersion?: string;
    };
    if (!folderSuffix || !page || !languageCode || (pdfxVersion !== "x1a" && pdfxVersion !== "x4")) {
      res.status(400).json({ error: "export_fields_required" });
      return;
    }
    const parsed = PageLayoutSchema.safeParse(req.body.layout);
    if (!parsed.success) {
      res.status(400).json({ error: "invalid_layout", details: parsed.error.flatten() });
      return;
    }
    const pages = await listPages(volume);
    const pageInfo = pages.find((p) => p.page === page);
    if (!pageInfo) {
      res.status(404).json({ error: "page_not_found" });
      return;
    }

    const presets = await readPresets();
    let result: { bytes: Buffer; pdfxStamped: boolean };
    try {
      result = await buildVectorPdfPage({
        baseImagePath: pageInfo.absolutePath,
        layout: parsed.data,
        languageCode,
        presets,
        resolveImagePath: resolveImageFilePath,
        pdfxVersion,
      });
    } catch (err) {
      res.status(500).json({ error: "vector_pdf_export_failed", params: { reason: (err as Error).message } });
      return;
    }

    const settings = await readSettings();
    const dir = path.join(volume.parentDir, languageFolderName(volume.bookFolderName, folderSuffix, settings.exportFolderTemplate));
    await fs.mkdir(dir, { recursive: true });
    const file = path.join(dir, `${page}.pdf`);
    await fs.writeFile(file, result.bytes);
    res.json({ ok: true, path: path.relative(volume.parentDir, file), pdfxStamped: result.pdfxStamped });
  })
);

/**
 * Layered PSD export — same "client sends the raw PageLayout JSON, server renders"
 * pattern as /export-vector-pdf (see that route's doc comment). Layers are plain
 * raster PNG-with-alpha (see psdExport.ts's own doc comment for why), not editable
 * PSD text objects — Photoshop can hide/show/move/mask each layer independently.
 */
exportRouter.post(
  "/:id/export-psd",
  requireLetterer,
  asyncHandler(async (req, res) => {
    const volume = await findVolume(req.params.id);
    if (!volume) {
      res.status(404).json({ error: "volume_not_found" });
      return;
    }
    const { folderSuffix, page, languageCode } = req.body as {
      folderSuffix?: string;
      page?: string;
      languageCode?: string;
    };
    if (!folderSuffix || !page || !languageCode) {
      res.status(400).json({ error: "export_fields_required" });
      return;
    }
    const parsed = PageLayoutSchema.safeParse(req.body.layout);
    if (!parsed.success) {
      res.status(400).json({ error: "invalid_layout", details: parsed.error.flatten() });
      return;
    }
    const pages = await listPages(volume);
    const pageInfo = pages.find((p) => p.page === page);
    if (!pageInfo) {
      res.status(404).json({ error: "page_not_found" });
      return;
    }

    const presets = await readPresets();
    let bytes: Buffer;
    try {
      bytes = await buildLayeredPsd({
        baseImagePath: pageInfo.absolutePath,
        layout: parsed.data,
        languageCode,
        presets,
        resolveImagePath: resolveImageFilePath,
      });
    } catch (err) {
      res.status(500).json({ error: "psd_export_failed", params: { reason: (err as Error).message } });
      return;
    }

    const settings = await readSettings();
    const dir = path.join(volume.parentDir, languageFolderName(volume.bookFolderName, folderSuffix, settings.exportFolderTemplate));
    await fs.mkdir(dir, { recursive: true });
    const file = path.join(dir, `${page}.psd`);
    await fs.writeFile(file, bytes);
    res.json({ ok: true, path: path.relative(volume.parentDir, file) });
  })
);

exportRouter.get(
  "/:id/exports",
  asyncHandler(async (req, res) => {
    const volume = await findVolume(req.params.id);
    if (!volume) {
      res.status(404).json({ error: "volume_not_found" });
      return;
    }
    const settings = await readSettings();
    const parentDir = volume.parentDir;
    const bookFolderName = volume.bookFolderName;

    let siblingEntries: import("node:fs").Dirent[] = [];
    try {
      siblingEntries = await fs.readdir(parentDir, { withFileTypes: true });
    } catch {
      // ignore
    }

    const exportFolders = siblingEntries.filter(
      (e) =>
        e.isDirectory() &&
        e.name.startsWith(`${bookFolderName}_`) &&
        !e.name.endsWith(settings.emptySuffix) &&
        !e.name.endsWith(settings.letteringSuffix)
    );

    const result: any[] = [];
    for (const folder of exportFolders) {
      const folderSuffix = folder.name.slice(bookFolderName.length + 1);
      const dirPath = path.join(parentDir, folder.name);
      let fileEntries: import("node:fs").Dirent[] = [];
      try {
        fileEntries = await fs.readdir(dirPath, { withFileTypes: true });
      } catch {
        // ignore
      }

      const files: any[] = [];
      for (const fe of fileEntries) {
        if (!fe.isFile()) continue;
        const filePath = path.join(dirPath, fe.name);
        let stat: import("node:fs").Stats;
        try {
          stat = await fs.stat(filePath);
        } catch {
          continue;
        }
        const ext = path.extname(fe.name).toLowerCase();
        const page = path.basename(fe.name, ext);
        files.push({
          name: fe.name,
          page,
          extension: ext,
          size: stat.size,
          mtime: stat.mtime.toISOString(),
          url: `/api/volumes/${encodeURIComponent(volume.id)}/exports/${encodeURIComponent(folderSuffix)}/${encodeURIComponent(fe.name)}`
        });
      }

      result.push({
        folderSuffix,
        folderName: folder.name,
        files
      });
    }

    res.json({
      exportFolderTemplate: settings.exportFolderTemplate,
      exports: result
    });
  })
);

exportRouter.get(
  "/:id/exports/:folderSuffix/zip",
  asyncHandler(async (req, res) => {
    const volume = await findVolume(req.params.id);
    if (!volume) {
      res.status(404).json({ error: "volume_not_found" });
      return;
    }
    const folderSuffix = req.params.folderSuffix;
    if (!isSafeFolderPath(folderSuffix)) {
      res.status(400).json({ error: "invalid_folder_suffix" });
      return;
    }
    const settings = await readSettings();
    const dir = path.join(volume.parentDir, languageFolderName(volume.bookFolderName, folderSuffix, settings.exportFolderTemplate));

    let entries: import("node:fs").Dirent[] = [];
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      res.status(404).json({ error: "export_directory_not_found" });
      return;
    }
    const files = entries.filter((e) => e.isFile());
    if (files.length === 0) {
      res.status(404).json({ error: "no_exported_files_found" });
      return;
    }

    res.setHeader("Content-Type", "application/zip");
    res.setHeader("Content-Disposition", `attachment; filename="${volume.bookFolderName}_${folderSuffix}_exports.zip"`);

    const archive = new ZipArchive({ zlib: { level: 9 } });
    archive.on("error", (err: Error) => {
      if (!res.headersSent) {
        res.status(500).end(String(err));
      }
    });
    archive.pipe(res);
    for (const file of files) {
      archive.file(path.join(dir, file.name), { name: file.name });
    }
    await archive.finalize();
  })
);

exportRouter.get(
  "/:id/exports/:folderSuffix/:fileName",
  asyncHandler(async (req, res) => {
    const volume = await findVolume(req.params.id);
    if (!volume) {
      res.status(404).json({ error: "volume_not_found" });
      return;
    }
    const { folderSuffix, fileName } = req.params;
    if (!isSafeFolderPath(folderSuffix) || !isSafeFileName(fileName)) {
      res.status(400).json({ error: "invalid_path_parameters" });
      return;
    }
    const settings = await readSettings();
    const file = path.join(
      volume.parentDir,
      languageFolderName(volume.bookFolderName, folderSuffix, settings.exportFolderTemplate),
      fileName
    );

    try {
      await fs.access(file);
    } catch {
      res.status(404).json({ error: "exported_file_not_found" });
      return;
    }

    if (req.query.download === "true") {
      res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);
    }
    res.sendFile(file);
  })
);

exportRouter.delete(
  "/:id/exports/:folderSuffix/:fileName",
  requireLetterer,
  asyncHandler(async (req, res) => {
    const volume = await findVolume(req.params.id);
    if (!volume) {
      res.status(404).json({ error: "volume_not_found" });
      return;
    }
    const { folderSuffix, fileName } = req.params;
    if (!isSafeFolderPath(folderSuffix) || !isSafeFileName(fileName)) {
      res.status(400).json({ error: "invalid_path_parameters" });
      return;
    }
    const settings = await readSettings();
    const file = path.join(
      volume.parentDir,
      languageFolderName(volume.bookFolderName, folderSuffix, settings.exportFolderTemplate),
      fileName
    );

    try {
      await fs.unlink(file);
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ error: "file_deletion_failed", details: String(err) });
    }
  })
);

exportRouter.delete(
  "/:id/exports/:folderSuffix",
  requireLetterer,
  asyncHandler(async (req, res) => {
    const volume = await findVolume(req.params.id);
    if (!volume) {
      res.status(404).json({ error: "volume_not_found" });
      return;
    }
    const { folderSuffix } = req.params;
    if (!isSafeFolderPath(folderSuffix)) {
      res.status(400).json({ error: "invalid_folder_suffix" });
      return;
    }
    const settings = await readSettings();
    const dir = path.join(
      volume.parentDir,
      languageFolderName(volume.bookFolderName, folderSuffix, settings.exportFolderTemplate)
    );

    try {
      await fs.rm(dir, { recursive: true, force: true });
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ error: "folder_deletion_failed", details: String(err) });
    }
  })
);

