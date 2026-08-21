import { Router } from "express";
import fs from "node:fs/promises";
import { imageSizeFromFile } from "image-size/fromFile";
import { findVolume, listPages } from "../lib/projectScanner.js";
import { getOrCreateThumbnail } from "../lib/thumbnails.js";
import { asyncHandler } from "../lib/asyncHandler.js";

export const pagesRouter = Router();

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
    res.sendFile(page.absolutePath);
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
      res.sendFile(thumbPath);
    } catch (err) {
      res.status(500).json({ error: "thumbnail_generation_failed", details: String(err) });
    }
  })
);
