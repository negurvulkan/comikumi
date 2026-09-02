/** One text region found by the detector, already OCR'd — coordinates are plain
 * rectangles in the page's original (unscaled) image pixel space, already mapped back
 * from whatever padded/resized space the detection model actually ran in (see
 * detection.ts). No mask/polygon is kept: ComiKumi's own Bubble geometry is a plain
 * box (rect/oval), so a detected region only ever needs to become one. */
export interface DetectedRegion {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  recognizedText: string;
  /** 0..1, the detector/OCR pipeline's own confidence — used only to pre-select which
   * regions the review panel defaults to "accepted" (see AutoBubblesReviewPanel.tsx),
   * never written into the resulting Bubble. */
  confidence: number;
  /** PNG data URL of the exact pixels cropped out of the page and fed to OCR (see
   * cropToCanvas() in worker.ts) — lets the review panel show the source image right
   * next to the recognized text, so a wrong/garbled suggestion can be told apart from
   * "OCR misread a real crop" vs. "the crop itself is wrong region/empty/off-page".
   * Omitted (undefined) only if the crop failed (see cropToCanvas's null case). */
  previewDataUrl?: string;
}

/** worker.ts <-> workerClient.ts message protocol. `RunRequest.imageBitmap` is
 * transferred (not cloned) — see workerClient.ts's postMessage() call.
 *
 * `mode: "detect-only"` (Cleaning/Inpainting, see workerClient.ts's
 * runCleanupDetection()) skips OCR entirely — no point loading/running the heavy
 * manga-ocr model just to throw the recognized text away, Cleaning only needs
 * positions. `ocrEncoderModel`/`ocrDecoderModel` are correspondingly optional: omit
 * both for `"detect-only"` (the caller never fetches them in the first place). Default
 * mode is `"detect-and-ocr"` (Auto-Bubbles' existing behavior, unchanged). */
export interface RunRequest {
  type: "run";
  mode?: "detect-and-ocr" | "detect-only";
  imageBitmap: ImageBitmap;
  detectorModel: ArrayBuffer;
  ocrEncoderModel?: ArrayBuffer;
  ocrDecoderModel?: ArrayBuffer;
}

export type WorkerProgressStage = "loading-runtime" | "detecting" | "recognizing";

export type WorkerMessage =
  | { type: "progress"; stage: WorkerProgressStage; current: number; total: number }
  | { type: "done"; regions: DetectedRegion[] }
  | { type: "error"; message: string };
