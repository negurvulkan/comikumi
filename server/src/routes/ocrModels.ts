import { Router } from "express";
import path from "node:path";
import { OCR_MODELS_DIR, isSafeFileName } from "../lib/paths.js";
import { asyncHandler } from "../lib/asyncHandler.js";

export const ocrModelsRouter = Router();

/** Serves a manually-populated model file from OCR_MODELS_DIR — see that constant's
 * doc comment. No upload/list/delete here (unlike assetRouter.ts's fonts/images/
 * bubble-svgs kinds): this is fixed, app-versioned content an operator drops in
 * directly on the filesystem, not something managed through the UI. Also answers HEAD
 * requests for free (Express's res.sendFile respects the request method) — the
 * client's modelLoader.ts HEAD-probes this route before deciding whether to prefer it
 * over the external CDN. */
ocrModelsRouter.get(
  "/:fileName",
  asyncHandler(async (req, res) => {
    const fileName = req.params.fileName;
    if (!isSafeFileName(fileName)) {
      res.status(400).json({ error: "invalid_file_name" });
      return;
    }
    res.sendFile(path.join(OCR_MODELS_DIR, fileName), { maxAge: "30d" }, (err) => {
      if (err && !res.headersSent) res.status(404).json({ error: "model_not_found" });
    });
  })
);
