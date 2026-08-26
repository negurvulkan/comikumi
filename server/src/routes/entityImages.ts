import fs from "node:fs/promises";
import { imageSize } from "image-size";
import { createAssetRouter } from "../lib/assetRouter.js";
import { ENTITY_IMAGES_DIR } from "../lib/paths.js";

// Same extension/mime set as images.ts — reference art and sketches are ordinary
// raster images, no reason for a narrower or different allow-list here.
const MIME_BY_EXT: Record<string, string> = {
  ".png": "image/png",
  ".webp": "image/webp",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
};

/** Every entity's image gallery lives under its own subfolder, named by the entity's
 * id (e.g. `GET /api/entity-images?folder=<entityId>`) — reuses the asset router's
 * existing folder browsing wholesale instead of inventing per-entity storage, and the
 * folder appears automatically on first upload (mkdir recursive), so entity creation
 * doesn't need to also provision a folder. */
export const entityImagesRouter = createAssetRouter({
  kind: "entity-images",
  globalDir: ENTITY_IMAGES_DIR,
  urlPrefix: "/api/entity-images",
  allowedExt: new Set([".png", ".webp", ".jpg", ".jpeg", ".gif"]),
  uploadFieldName: "image",
  maxFileSizeBytes: 30 * 1024 * 1024,
  mimeByExt: MIME_BY_EXT,
  foldersEnabled: true,
  enrichEntry: async (_fileName, absPath) => {
    let width = 0;
    let height = 0;
    try {
      const buf = await fs.readFile(absPath);
      const dims = imageSize(buf);
      width = dims.width ?? 0;
      height = dims.height ?? 0;
    } catch {
      // Skip dims if the file can't be read/decoded — the gallery just won't show a size.
    }
    return { width, height };
  },
});
