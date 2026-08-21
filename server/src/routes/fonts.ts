import path from "node:path";
import { createAssetRouter } from "../lib/assetRouter.js";
import { FONTS_DIR } from "../lib/paths.js";

export const fontsRouter = createAssetRouter({
  kind: "fonts",
  globalDir: FONTS_DIR,
  urlPrefix: "/api/fonts",
  allowedExt: new Set([".ttf", ".otf", ".woff", ".woff2"]),
  uploadFieldName: "font",
  maxFileSizeBytes: 20 * 1024 * 1024,
  enrichEntry: async (fileName) => ({ family: path.basename(fileName, path.extname(fileName)) }),
});
