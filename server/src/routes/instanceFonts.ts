import path from "node:path";
import { createAssetRouter } from "../lib/assetRouter.js";
import { FONTS_DIR } from "../lib/paths.js";

/** Instance-scope counterpart of fonts.ts — always the true, project-independent
 * FONTS_DIR (see assetRouter.ts's `instanceOnly` doc comment). Mounted behind
 * requireSystemAdmin in app.ts, at the router-mount level, not inside this file. */
export const instanceFontsRouter = createAssetRouter({
  kind: "fonts",
  globalDir: FONTS_DIR,
  urlPrefix: "/api/instance/fonts",
  allowedExt: new Set([".ttf", ".otf", ".woff", ".woff2"]),
  uploadFieldName: "font",
  maxFileSizeBytes: 20 * 1024 * 1024,
  enrichEntry: async (fileName) => ({ family: path.basename(fileName, path.extname(fileName)) }),
  instanceOnly: true,
});
