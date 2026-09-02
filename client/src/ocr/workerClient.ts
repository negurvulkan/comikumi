import type { DetectedRegion, RunRequest, WorkerMessage, WorkerProgressStage } from "./types";
import { ensureDetectorLoaded, ensureOcrOnnxLoaded } from "./modelLoader";

/** Combines byte-progress from N concurrent model downloads (detector + OCR encoder,
 * fetched in parallel via Promise.all) into a single "downloading-models" progress
 * report — reporting each download's own onProgress straight through would have the
 * two callbacks race/overwrite each other's current/total in the shared progressMsg
 * state (useAutoBubblesRun.ts). MB, not raw bytes: the existing `ocr.progress.*` i18n
 * strings interpolate `{{current}}/{{total}}` directly, and nobody wants to read
 * "104857600/209715200 downloaded". `total` is 0 (not, say, NaN) whenever ANY tracked
 * download's size is unknown — the rendering side (LoadingIndicator) already treats
 * total<=0 as "unknown", so the bar degrades to an indeterminate spinner instead of a
 * wrong/jumpy percentage rather than needing its own separate "some totals missing"
 * branch here. */
function combinedDownloadProgress(
  count: number,
  onProgress: (stage: WorkerProgressStage, current: number, total: number) => void
): (index: number) => (loadedBytes: number, totalBytes: number | null) => void {
  const loaded = new Array<number>(count).fill(0);
  const total = new Array<number | null>(count).fill(null);
  const toMb = (bytes: number) => Math.round((bytes / (1024 * 1024)) * 10) / 10;
  return (index: number) => (loadedBytes: number, totalBytes: number | null) => {
    loaded[index] = loadedBytes;
    total[index] = totalBytes;
    const sumLoaded = loaded.reduce((a, b) => a + b, 0);
    const sumTotal = total.some((t) => t === null) ? 0 : (total as number[]).reduce((a, b) => a + b, 0);
    onProgress("downloading-models", toMb(sumLoaded), toMb(sumTotal));
  };
}

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
  const trackProgress = onProgress && combinedDownloadProgress(2, onProgress);
  const [{ detector }, { encoder, decoder }] = await Promise.all([
    ensureDetectorLoaded(trackProgress?.(0)),
    ensureOcrOnnxLoaded(trackProgress?.(1)),
  ]);

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
  const trackProgress = onProgress && combinedDownloadProgress(1, onProgress);
  const { detector } = await ensureDetectorLoaded(trackProgress?.(0));

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
