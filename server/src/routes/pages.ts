import { Router } from "express";
import fs from "node:fs/promises";
import path from "node:path";
import multer from "multer";
import { imageSizeFromFile } from "image-size/fromFile";
import { findVolume, listPages, PAGE_IMAGE_EXTENSIONS } from "../lib/projectScanner.js";
import { getOrCreateThumbnail } from "../lib/thumbnails.js";
import { asyncHandler } from "../lib/asyncHandler.js";
import { requireProjectRole } from "../lib/auth.js";
import { readSettings } from "../lib/projectStore.js";
import { moveToTrash } from "../lib/trash.js";

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
    const volume = await findVolume(req.params.id);
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
    const volume = await findVolume(req.params.id);
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
    const volume = await findVolume(req.params.id);
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
      const thumbPath = await getOrCreateThumbnail(page.absolutePath);
      res.type("image/jpeg");
      res.sendFile(thumbPath, { maxAge: "1h" });
    } catch (err) {
      res.status(500).json({ error: "thumbnail_generation_failed", details: String(err) });
    }
  })
);

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
    const volume = await findVolume(req.params.id);
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
      const absPath = path.join(volume.emptyDir, safeName);
      const alreadyExists = await fs
        .access(absPath)
        .then(() => true)
        .catch(() => false);
      if (alreadyExists && !overwrite.includes(safeName)) {
        conflicts.push(safeName);
        continue;
      }
      await fs.writeFile(absPath, file.buffer);
      written.push(safeName);
    }
    res.json({ written, conflicts });
  })
);

pagesRouter.delete(
  "/:id/pages/:page",
  requireProjectRole("letterer"),
  asyncHandler(async (req, res) => {
    const volume = await findVolume(req.params.id);
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
    const settings = await readSettings();
    await moveToTrash(page.absolutePath, settings.scanRoot);
    res.json({ ok: true });
  })
);
