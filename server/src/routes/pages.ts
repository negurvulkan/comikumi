import { Router } from "express";
import fs from "node:fs/promises";
import path from "node:path";
import multer from "multer";
import { z } from "zod";
import { imageSizeFromFile } from "image-size/fromFile";
import { findVolume, listPages, PAGE_IMAGE_EXTENSIONS, type VolumeInfo } from "../lib/projectScanner.js";
import { getOrCreateThumbnail } from "../lib/thumbnails.js";
import { cleanPage, getCleanedImagePath, type InpaintBox } from "../lib/inpainting.js";
import { flattenClipToPng } from "../lib/clipImport.js";
import { asyncHandler } from "../lib/asyncHandler.js";
import { requireProjectRole } from "../lib/auth.js";
import { readSettings, readLanguages } from "../lib/projectStore.js";
import { moveToTrash } from "../lib/trash.js";
import { DEMO_MAX_PAGES, exceedsDemoPageCap } from "../lib/demoMode.js";
import { layoutPathFor } from "./layout.js";

export const pagesRouter = Router();

// Memory storage: files are small enough in practice (scanned manga pages) that
// buffering the whole upload before writing is simpler than a streaming pipeline,
// same trade-off assetRouter.ts already makes for fonts/images/svgs.
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });

/** Reads only the image header (not the whole multi-MB file) via image-size's async file-path API. */
async function readDimsUncached(absolutePath: string): Promise<{ width: number; height: number }> {
  try {
    const dims = await imageSizeFromFile(absolutePath);
    return { width: dims.width ?? 0, height: dims.height ?? 0 };
  } catch {
    return { width: 0, height: 0 };
  }
}

// Dimensions never change unless the source file itself does — caching them
// (keyed by mtime, same invalidation idea as the thumbnail cache) turns every
// visit after the first into a single fast stat() instead of a header parse
// per file, which matters a lot on a network-drive project folder.
const dimsCache = new Map<string, { mtimeMs: number; width: number; height: number }>();

async function readDims(absolutePath: string): Promise<{ width: number; height: number }> {
  const stat = await fs.stat(absolutePath).catch(() => null);
  if (stat) {
    const cached = dimsCache.get(absolutePath);
    if (cached && cached.mtimeMs === stat.mtimeMs) {
      return { width: cached.width, height: cached.height };
    }
  }
  const dims = await readDimsUncached(absolutePath);
  if (stat) dimsCache.set(absolutePath, { mtimeMs: stat.mtimeMs, ...dims });
  return dims;
}

pagesRouter.get(
  "/:id/pages",
  asyncHandler(async (req, res) => {
    const volume = await findVolume(req.params.id, req.activeProject);
    if (!volume) {
      res.status(404).json({ error: "volume_not_found" });
      return;
    }
    const pages = await listPages(volume);
    const withDims = await Promise.all(
      pages.map(async (p) => {
        const dims = await readDims(p.absolutePath);
        return { page: p.page, fileName: p.fileName, width: dims.width, height: dims.height };
      })
    );
    res.json(withDims);
  })
);

pagesRouter.get(
  "/:id/pages/:page/image",
  asyncHandler(async (req, res) => {
    const volume = await findVolume(req.params.id, req.activeProject);
    if (!volume) {
      res.status(404).json({ error: "volume_not_found" });
      return;
    }
    const pages = await listPages(volume);
    const page = pages.find((p) => p.page === req.params.page);
    if (!page) {
      res.status(404).json({ error: "page_not_found" });
      return;
    }
    // The auth token in the URL is stable per session, so identical requests for the
    // same page reuse the browser's HTTP cache — maxAge lets that happen without a
    // revalidation round-trip each time (real gain when scanRoot is a slow network
    // share); ETag/Last-Modified (set by res.sendFile by default) still catch actual
    // edits to the source file.
    res.sendFile(page.absolutePath, { maxAge: "1h" });
  })
);

// Small, cached JPEG for grid overviews — the full-resolution page art
// (several MB each, dozens of pages) is far too slow to load 77-at-a-time.
pagesRouter.get(
  "/:id/pages/:page/thumbnail",
  asyncHandler(async (req, res) => {
    const volume = await findVolume(req.params.id, req.activeProject);
    if (!volume) {
      res.status(404).json({ error: "volume_not_found" });
      return;
    }
    const pages = await listPages(volume);
    const page = pages.find((p) => p.page === req.params.page);
    if (!page) {
      res.status(404).json({ error: "page_not_found" });
      return;
    }
    try {
      const resolved = await layoutPathFor(req.params.id, req.params.page, req.activeProject);
      const languages = await readLanguages(req.activeProject);
      const languageCode = languages[0]?.code ?? "de";
      const thumbPath = await getOrCreateThumbnail(page.absolutePath, resolved?.file, languageCode);
      res.type("image/jpeg");
      res.sendFile(thumbPath, { maxAge: "1h" });
    } catch (err) {
      res.status(500).json({ error: "thumbnail_generation_failed", details: String(err) });
    }
  })
);

const CleanBoxSchema = z.object({ x: z.number(), y: z.number(), width: z.number().positive(), height: z.number().positive() });
const CleanRequestSchema = z.object({ boxes: z.array(CleanBoxSchema) });

// Runs Cleaning/Inpainting (see lib/inpainting.ts, docs/inpainting-model-provenance.md)
// over the given boxes (already detected client-side, same Auto-Bubbles detector — this
// route only reconstructs pixels, it doesn't detect anything itself) and caches the
// result. `requireLetterer`-equivalent (not `translator`): unlike a text edit, this
// permanently alters the page's visual content, the same bar Cut-Panel/placed-image
// mutations already require. Does NOT touch the page's layout JSON or its
// useCleanedBackground flag — the client sets that itself via the normal layout save
// path once it has reviewed the before/after result, same "propose, then an explicit
// separate confirm actually commits it" principle as every other automation this session.
pagesRouter.post(
  "/:id/pages/:page/clean",
  requireProjectRole("letterer"),
  asyncHandler(async (req, res) => {
    const volume = await findVolume(req.params.id, req.activeProject);
    if (!volume) {
      res.status(404).json({ error: "volume_not_found" });
      return;
    }
    const pages = await listPages(volume);
    const page = pages.find((p) => p.page === req.params.page);
    if (!page) {
      res.status(404).json({ error: "page_not_found" });
      return;
    }
    const parsed = CleanRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "invalid_boxes", details: parsed.error.flatten() });
      return;
    }
    await cleanPage(page.absolutePath, parsed.data.boxes as InpaintBox[]);
    res.json({ ok: true });
  })
);

// Serves the cached cleaned image if one exists and is still valid (not older than
// the source scan) — 404 otherwise, so the client can tell "never cleaned" apart from
// "cleaning failed" without a special error shape. No stricter role than the router's
// own viewer baseline — reading it is no different from reading the raw page image.
pagesRouter.get(
  "/:id/pages/:page/cleaned-image",
  asyncHandler(async (req, res) => {
    const volume = await findVolume(req.params.id, req.activeProject);
    if (!volume) {
      res.status(404).json({ error: "volume_not_found" });
      return;
    }
    const pages = await listPages(volume);
    const page = pages.find((p) => p.page === req.params.page);
    if (!page) {
      res.status(404).json({ error: "page_not_found" });
      return;
    }
    const cleanedPath = await getCleanedImagePath(page.absolutePath);
    if (!cleanedPath) {
      res.status(404).json({ error: "not_cleaned" });
      return;
    }
    res.sendFile(cleanedPath, { maxAge: "1h" });
  })
);

/** Returns the target path for `safeName` inside `volume.emptyDir` if it's safe to
 * write to (doesn't already exist, or the caller explicitly allowed overwriting it) —
 * or null if it's an unresolved conflict. Shared by the plain-image upload and the
 * .clip-import routes below, which otherwise duplicate the exact same "don't silently
 * clobber an existing page" check. */
async function resolveWriteTarget(volume: VolumeInfo, safeName: string, overwrite: string[]): Promise<string | null> {
  const absPath = path.join(volume.emptyDir, safeName);
  const alreadyExists = await fs
    .access(absPath)
    .then(() => true)
    .catch(() => false);
  if (alreadyExists && !overwrite.includes(safeName)) return null;
  return absPath;
}

// Lets a client on a different machine than the server add page-scan images without
// filesystem/network-share access to scanRoot — the only prior way to add a page.
// Uploads several files in one request (a whole scan batch); a name that already
// exists in the volume's _empty folder is reported back as a conflict instead of
// silently overwritten, unless the client explicitly allows it via `overwrite`
// (used for the confirmed second request after the user approves a collision).
pagesRouter.post(
  "/:id/pages",
  requireProjectRole("letterer"),
  upload.array("pages", 50),
  asyncHandler(async (req, res) => {
    const volume = await findVolume(req.params.id, req.activeProject);
    if (!volume) {
      res.status(404).json({ error: "volume_not_found" });
      return;
    }
    const files = (req.files as Express.Multer.File[] | undefined) ?? [];
    if (files.length === 0) {
      res.status(400).json({ error: "file_required", params: { field: "pages" } });
      return;
    }
    let overwrite: string[] = [];
    if (typeof req.body.overwrite === "string") {
      try {
        const parsed: unknown = JSON.parse(req.body.overwrite);
        if (Array.isArray(parsed)) overwrite = parsed.filter((v): v is string => typeof v === "string");
      } catch {
        // malformed overwrite field -> treat as "no overwrites requested"
      }
    }

    const existingPages = await listPages(volume);
    if (exceedsDemoPageCap(existingPages.length, files.length)) {
      res.status(400).json({ error: "demo_page_limit_reached", params: { max: String(DEMO_MAX_PAGES), current: String(existingPages.length) } });
      return;
    }

    for (const file of files) {
      const ext = path.extname(file.originalname).toLowerCase();
      if (!PAGE_IMAGE_EXTENSIONS.has(ext)) {
        res.status(400).json({ error: "unsupported_page_file_type", params: { fileName: file.originalname } });
        return;
      }
    }

    await fs.mkdir(volume.emptyDir, { recursive: true });
    const written: string[] = [];
    const conflicts: string[] = [];
    for (const file of files) {
      const safeName = file.originalname.replace(/[^\w.\- ]/g, "_");
      const absPath = await resolveWriteTarget(volume, safeName, overwrite);
      if (!absPath) {
        conflicts.push(safeName);
        continue;
      }
      await fs.writeFile(absPath, file.buffer);
      written.push(safeName);
    }
    res.json({ written, conflicts });
  })
);

// Multer's default 50MB-per-file limit (see `upload` above) is sized for scanned page
// images — .clip project files routinely run much larger (embedded SQLite metadata,
// full mipmap pyramids per layer), hence the separate, more generous limit here.
const CLIP_UPLOAD_MAX_BYTES = 300 * 1024 * 1024;
const clipUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: CLIP_UPLOAD_MAX_BYTES } });

// Imports Clip Studio Paint (.clip) files as new pages — see lib/clipImport.ts for the
// two extraction strategies (full-resolution layer compositing when possible, CSP's own
// embedded preview render otherwise) and exactly when each applies. Same role/conflict-
// handling contract as the plain-image upload above; the response additionally reports
// which written pages only got the reduced-quality preview extraction, so the client
// can surface that instead of it being a silent surprise.
pagesRouter.post(
  "/:id/pages/import-clip",
  requireProjectRole("letterer"),
  clipUpload.array("pages", 50),
  asyncHandler(async (req, res) => {
    const volume = await findVolume(req.params.id, req.activeProject);
    if (!volume) {
      res.status(404).json({ error: "volume_not_found" });
      return;
    }
    const files = (req.files as Express.Multer.File[] | undefined) ?? [];
    if (files.length === 0) {
      res.status(400).json({ error: "file_required", params: { field: "pages" } });
      return;
    }
    let overwrite: string[] = [];
    if (typeof req.body.overwrite === "string") {
      try {
        const parsed: unknown = JSON.parse(req.body.overwrite);
        if (Array.isArray(parsed)) overwrite = parsed.filter((v): v is string => typeof v === "string");
      } catch {
        // malformed overwrite field -> treat as "no overwrites requested"
      }
    }

    for (const file of files) {
      if (path.extname(file.originalname).toLowerCase() !== ".clip") {
        res.status(400).json({ error: "unsupported_page_file_type", params: { fileName: file.originalname } });
        return;
      }
    }

    const existingPages = await listPages(volume);
    if (exceedsDemoPageCap(existingPages.length, files.length)) {
      res.status(400).json({ error: "demo_page_limit_reached", params: { max: String(DEMO_MAX_PAGES), current: String(existingPages.length) } });
      return;
    }

    await fs.mkdir(volume.emptyDir, { recursive: true });
    const written: string[] = [];
    const conflicts: string[] = [];
    const invalid: string[] = [];
    const reducedQuality: string[] = [];
    for (const file of files) {
      const baseName = path.basename(file.originalname, path.extname(file.originalname)).replace(/[^\w.\- ]/g, "_");
      const safeName = `${baseName}.png`;
      const absPath = await resolveWriteTarget(volume, safeName, overwrite);
      if (!absPath) {
        conflicts.push(safeName);
        continue;
      }
      let result: Awaited<ReturnType<typeof flattenClipToPng>>;
      try {
        result = await flattenClipToPng(file.buffer);
      } catch {
        // One malformed .clip in a batch shouldn't abort the rest — reported back so the
        // client can flag exactly that file instead of the whole upload failing opaquely.
        invalid.push(file.originalname);
        continue;
      }
      await fs.writeFile(absPath, result.png);
      written.push(safeName);
      if (result.quality === "preview") reducedQuality.push(safeName);
    }
    res.json({ written, conflicts, invalid, reducedQuality });
  })
);

pagesRouter.delete(
  "/:id/pages/:page",
  requireProjectRole("letterer"),
  asyncHandler(async (req, res) => {
    const volume = await findVolume(req.params.id, req.activeProject);
    if (!volume) {
      res.status(404).json({ error: "volume_not_found" });
      return;
    }
    const pages = await listPages(volume);
    const page = pages.find((p) => p.page === req.params.page);
    if (!page) {
      res.status(404).json({ error: "page_not_found" });
      return;
    }
    // Deliberately does not touch a possibly-existing lettering JSON for this page —
    // it becomes a harmless orphaned file, same "stale reference doesn't need special
    // handling" philosophy already used for deleted characters/panels/presets elsewhere.
    // Never permanently deletes the source image itself either — it moves into
    // scanRoot's trash folder (see lib/trash.ts) so it stays recoverable until an
    // automatic sweep (index.ts) purges it after the configured retention period.
    const settings = await readSettings(req.activeProject);
    await moveToTrash(page.absolutePath, settings.scanRoot);
    res.json({ ok: true });
  })
);
