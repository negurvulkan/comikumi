import { Router } from "express";
import fs from "node:fs/promises";
import path from "node:path";
import multer from "multer";
import sharp from "sharp";
import { findVolume, listPages } from "../lib/projectScanner.js";
import { languageFolderName } from "../lib/paths.js";
import { readPresets, readSettings } from "../lib/projectStore.js";
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
