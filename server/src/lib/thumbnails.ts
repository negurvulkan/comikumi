import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import sharp from "sharp";
import { THUMBNAILS_DIR } from "./paths.js";
import { getThumbnailsDir } from "./projectStore.js";

const THUMBNAIL_WIDTH = 360;
const THUMBNAIL_QUALITY = 72;

/** Hashes the absolute source path so cache files never collide across volumes/scan roots, without mirroring the source's folder structure. */
function cacheFileFor(dir: string, sourcePath: string): string {
  const key = crypto.createHash("sha1").update(sourcePath).digest("hex");
  return path.join(dir, `${key}.jpg`);
}

/**
 * Returns the path to a small JPEG thumbnail for `sourcePath`, generating (or
 * regenerating, if the source has changed since the cached copy was made) it
 * on demand. Cheap after the first request — subsequent calls just stat two
 * files and compare mtimes. Cached in `ProjectSettings.thumbnailsDir` if configured,
 * else a "thumbnails" folder next to the project file, else (no project open) the
 * shared global dir — separately configurable from assetsDir since this is pure
 * cache, not a shared/curated asset library.
 */
export async function getOrCreateThumbnail(sourcePath: string): Promise<string> {
  const dir = await getThumbnailsDir(THUMBNAILS_DIR);
  await fs.mkdir(dir, { recursive: true });
  const cachePath = cacheFileFor(dir, sourcePath);

  const [sourceStat, cacheStat] = await Promise.all([
    fs.stat(sourcePath),
    fs.stat(cachePath).catch(() => null),
  ]);
  if (cacheStat && cacheStat.mtimeMs >= sourceStat.mtimeMs) {
    return cachePath;
  }

  await sharp(sourcePath).resize({ width: THUMBNAIL_WIDTH, withoutEnlargement: true }).jpeg({ quality: THUMBNAIL_QUALITY }).toFile(cachePath);
  return cachePath;
}
