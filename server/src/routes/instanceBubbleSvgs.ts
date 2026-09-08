import { createAssetRouter } from "../lib/assetRouter.js";
import { BUBBLE_SVGS_DIR } from "../lib/paths.js";

/** Instance-scope counterpart of bubbleSvgs.ts — always the true, project-independent
 * BUBBLE_SVGS_DIR (see assetRouter.ts's `instanceOnly` doc comment). Mounted behind
 * requireSystemAdmin in app.ts, at the router-mount level, not inside this file. */
export const instanceBubbleSvgsRouter = createAssetRouter({
  kind: "bubble-svgs",
  globalDir: BUBBLE_SVGS_DIR,
  urlPrefix: "/api/instance/bubble-svgs",
  allowedExt: new Set([".svg"]),
  uploadFieldName: "svg",
  maxFileSizeBytes: 5 * 1024 * 1024,
  defaultMimeOnServe: "image/svg+xml",
  foldersEnabled: true,
  instanceOnly: true,
});
