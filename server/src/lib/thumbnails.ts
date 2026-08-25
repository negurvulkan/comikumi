import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import sharp from "sharp";
import { PageLayoutSchema, type PageLayout } from "../../../shared/src/layoutSchema.js";
import { THUMBNAILS_DIR } from "./paths.js";
import { getThumbnailsDir, readPresets } from "./projectStore.js";
import { resolveImageFilePath } from "./imageResolver.js";
import { renderPageBackground } from "./pageRaster.js";

const THUMBNAIL_WIDTH = 360;
const THUMBNAIL_QUALITY = 72;

/** Hashes the absolute source path so cache files never collide across volumes/scan roots, without mirroring the source's folder structure. */
function cacheFileFor(dir: string, sourcePath: string): string {
  const key = crypto.createHash("sha1").update(sourcePath).digest("hex");
  return path.join(dir, `${key}.jpg`);
}

async function readLayoutIfPresent(layoutFile: string): Promise<PageLayout | null> {
  try {
    return PageLayoutSchema.parse(JSON.parse(await fs.readFile(layoutFile, "utf-8")));
  } catch {
    return null;
  }
}

/**
 * Returns the path to a small JPEG thumbnail for a page, generating (or regenerating,
 * if the source scan or its saved layout changed since the cached copy was made) it on
 * demand. Cheap after the first request — subsequent calls just stat a couple of files
 * and compare mtimes. Cached in `ProjectSettings.thumbnailsDir` if configured, else a
 * "thumbnails" folder next to the project file, else (no project open) the shared
 * global dir — separately configurable from assetsDir since this is pure cache, not a
 * shared/curated asset library.
 *
 * When a layout exists, the thumbnail is composited from it (base scan + Cut-Panel
 * content + placed images + bubble background shapes, via renderPageBackground() — the
 * same rendering pageRaster.ts's other callers use for PSD/PDF export) rather than just
 * a resize of the raw source file. This matters most for a page created via "New blank
 * page" (a plain white/blank scan — see NewBlankPageDialog.tsx): all of its actual
 * visible content lives only in the layout (Cut-Panel replacement art, placed images),
 * never in the source file itself, so a raw-resize thumbnail would show it as
 * permanently blank even once it's fully drawn in. No bubble TEXT is rendered (it's
 * per-language and this is one shared thumbnail for the whole page grid — `languageCode`
 * only affects which language's Cut-Panel/placed-image FILES are shown, both of which
 * are themselves per-language assignments), but that matches the existing PSD export's
 * own background-only layer, so it's a consistent, deliberate scope rather than a gap.
 */
export async function getOrCreateThumbnail(sourcePath: string, layoutFile: string | undefined, languageCode: string): Promise<string> {
  const dir = await getThumbnailsDir(THUMBNAILS_DIR);
  await fs.mkdir(dir, { recursive: true });
  const cachePath = cacheFileFor(dir, sourcePath);

  const [sourceStat, layoutStat, cacheStat] = await Promise.all([
    fs.stat(sourcePath),
    layoutFile ? fs.stat(layoutFile).catch(() => null) : Promise.resolve(null),
    fs.stat(cachePath).catch(() => null),
  ]);
  const newestMtime = Math.max(sourceStat.mtimeMs, layoutStat?.mtimeMs ?? 0);
  if (cacheStat && cacheStat.mtimeMs >= newestMtime) {
    return cachePath;
  }

  const layout = layoutStat && layoutFile ? await readLayoutIfPresent(layoutFile) : null;

  if (layout) {
    const canvas = await renderPageBackground({
      baseImagePath: sourcePath,
      layout,
      languageCode,
      presets: await readPresets(),
      resolveImagePath: resolveImageFilePath,
    });
    await sharp(canvas.toBuffer("image/png"))
      .resize({ width: THUMBNAIL_WIDTH, withoutEnlargement: true })
      .jpeg({ quality: THUMBNAIL_QUALITY })
      .toFile(cachePath);
  } else {
    await sharp(sourcePath).resize({ width: THUMBNAIL_WIDTH, withoutEnlargement: true }).jpeg({ quality: THUMBNAIL_QUALITY }).toFile(cachePath);
  }
  return cachePath;
}
