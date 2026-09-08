import fs from "node:fs/promises";
import { imageSize } from "image-size";
import { createAssetRouter } from "../lib/assetRouter.js";
import { IMAGES_DIR } from "../lib/paths.js";

const MIME_BY_EXT: Record<string, string> = {
  ".png": "image/png",
  ".webp": "image/webp",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
};

/** Instance-scope counterpart of images.ts — always the true, project-independent
 * IMAGES_DIR (see assetRouter.ts's `instanceOnly` doc comment). Mounted behind
 * requireSystemAdmin in app.ts, at the router-mount level, not inside this file. */
export const instanceImagesRouter = createAssetRouter({
  kind: "images",
  globalDir: IMAGES_DIR,
  urlPrefix: "/api/instance/images",
  allowedExt: new Set([".png", ".webp", ".jpg", ".jpeg", ".gif"]),
  uploadFieldName: "image",
  maxFileSizeBytes: 30 * 1024 * 1024,
  mimeByExt: MIME_BY_EXT,
  foldersEnabled: true,
  instanceOnly: true,
  enrichEntry: async (_fileName, absPath) => {
    let width = 0;
    let height = 0;
    try {
      const buf = await fs.readFile(absPath);
      const dims = imageSize(buf);
      width = dims.width ?? 0;
      height = dims.height ?? 0;
    } catch {
      // Skip dims if the file can't be read/decoded; the client just won't have a
      // good default size to seed a newly placed quad with.
    }
    return { width, height };
  },
});
