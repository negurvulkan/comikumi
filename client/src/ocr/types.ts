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
}

/** worker.ts <-> workerClient.ts message protocol. `RunRequest.imageBitmap` is
 * transferred (not cloned) — see workerClient.ts's postMessage() call. */
export interface RunRequest {
  type: "run";
  imageBitmap: ImageBitmap;
  detectorModel: ArrayBuffer;
}

export type WorkerProgressStage = "loading-runtime" | "detecting" | "recognizing";

export type WorkerMessage =
  | { type: "progress"; stage: WorkerProgressStage; current: number; total: number }
  | { type: "done"; regions: DetectedRegion[] }
  | { type: "error"; message: string };
