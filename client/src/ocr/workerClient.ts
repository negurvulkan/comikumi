import type { DetectedRegion, RunRequest, WorkerMessage, WorkerProgressStage } from "./types";
import { ensureDetectorLoaded, ensureOcrOnnxLoaded } from "./modelLoader";

/** Wraps worker.ts's raw postMessage/onmessage protocol in a Promise, matching
 * useExportRun.ts's plain async-function call shape so the busy/progress hook
 * (useAutoBubblesRun.ts) can just `await` it like any other async operation. A fresh
 * Worker is created per run and terminated afterward — this is a rarely-triggered,
 * one-shot operation (not a hot path), so paying worker-startup cost each time is
 * simpler and safer than keeping one alive across the whole editor session (no
 * leaked GPU/WASM memory to reason about between runs). */
export async function runAutoBubbles(
  imageBitmap: ImageBitmap,
  onProgress?: (stage: WorkerProgressStage, current: number, total: number) => void
): Promise<DetectedRegion[]> {
  const [{ detector }, { encoder, decoder }] = await Promise.all([ensureDetectorLoaded(), ensureOcrOnnxLoaded()]);

  const worker = new Worker(new URL("./worker.ts", import.meta.url), { type: "module" });
  try {
    return await new Promise<DetectedRegion[]>((resolve, reject) => {
      worker.onmessage = (event: MessageEvent<WorkerMessage>) => {
        const msg = event.data;
        if (msg.type === "progress") onProgress?.(msg.stage, msg.current, msg.total);
        else if (msg.type === "done") resolve(msg.regions);
        else if (msg.type === "error") reject(new Error(msg.message));
      };
      worker.onerror = (event) => reject(new Error(event.message || "Worker-Fehler bei der automatischen Blasenerkennung"));

      // Each of `detector`/`encoder`/`decoder` is the SAME ArrayBuffer modelLoader.ts
      // memoizes and will return again on the next run — transferring (not cloning)
      // any of them would detach/neuter that shared buffer, breaking every subsequent
      // Auto-Bubbles run in this session. Transfer throwaway copies instead; the
      // memoized originals stay intact. (The bitmap has no such reuse concern — it's
      // freshly created per run by the caller — so it's transferred directly.)
      const detectorModel = detector.slice(0);
      const ocrEncoderModel = encoder.slice(0);
      const ocrDecoderModel = decoder.slice(0);
      const request: RunRequest = { type: "run", imageBitmap, detectorModel, ocrEncoderModel, ocrDecoderModel };
      worker.postMessage(request, [imageBitmap, detectorModel, ocrEncoderModel, ocrDecoderModel]);
    });
  } finally {
    worker.terminate();
  }
}

/** Same detector, same worker, same review-before-commit spirit as runAutoBubbles()
 * above — but `mode: "detect-only"` (see types.ts's RunRequest doc comment) skips
 * fetching/loading the OCR model entirely, since Cleaning/Inpainting (see
 * client/src/editor/CleanPageReviewPanel.tsx) only needs box positions to send to the
 * server's `/pages/:page/clean` route, never recognized text. Returned regions'
 * `recognizedText` is always `""` — never read by Cleaning's own UI, kept only so this
 * shares `DetectedRegion`'s type with Auto-Bubbles instead of needing a parallel one. */
export async function runCleanupDetection(
  imageBitmap: ImageBitmap,
  onProgress?: (stage: WorkerProgressStage, current: number, total: number) => void
): Promise<DetectedRegion[]> {
  const { detector } = await ensureDetectorLoaded();

  const worker = new Worker(new URL("./worker.ts", import.meta.url), { type: "module" });
  try {
    return await new Promise<DetectedRegion[]>((resolve, reject) => {
      worker.onmessage = (event: MessageEvent<WorkerMessage>) => {
        const msg = event.data;
        if (msg.type === "progress") onProgress?.(msg.stage, msg.current, msg.total);
        else if (msg.type === "done") resolve(msg.regions);
        else if (msg.type === "error") reject(new Error(msg.message));
      };
      worker.onerror = (event) => reject(new Error(event.message || "Worker-Fehler bei der Bereinigungs-Erkennung"));

      // See runAutoBubbles()'s identical comment above for why this is a throwaway
      // .slice(0) copy rather than transferring modelLoader.ts's own memoized buffer.
      const detectorModel = detector.slice(0);
      const request: RunRequest = { type: "run", mode: "detect-only", imageBitmap, detectorModel };
      worker.postMessage(request, [imageBitmap, detectorModel]);
    });
  } finally {
    worker.terminate();
  }
}
