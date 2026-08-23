import { createAssetRouter } from "../lib/assetRouter.js";
import { BUBBLE_SVGS_DIR } from "../lib/paths.js";

export const bubbleSvgsRouter = createAssetRouter({
  kind: "bubble-svgs",
  globalDir: BUBBLE_SVGS_DIR,
  urlPrefix: "/api/bubble-svgs",
  allowedExt: new Set([".svg"]),
  uploadFieldName: "svg",
  maxFileSizeBytes: 5 * 1024 * 1024,
  defaultMimeOnServe: "image/svg+xml",
  foldersEnabled: true,
});
