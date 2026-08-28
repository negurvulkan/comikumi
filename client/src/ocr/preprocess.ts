import { computePreprocessInfo, type PreprocessInfo } from "./detection";

/** Resizes `bitmap`'s longest side to `targetSize`, pads (top-left aligned, black
 * fill) to a `targetSize`×`targetSize` square, and normalizes to the detector's
 * expected `(px/127.5)-1` range in NCHW float32 layout — the exact preprocessing
 * `detection.ts`'s `PreprocessInfo`/`mapBoxToOriginal()` assume. Runs on
 * `OffscreenCanvas` (available in Workers on every browser this feature already
 * requires for WebGPU/WASM) rather than the DOM canvas, so it works entirely inside
 * worker.ts with no main-thread round-trip. */
export function resizeAndPadToTensor(
  bitmap: ImageBitmap,
  targetSize: number
): { tensorData: Float32Array; info: PreprocessInfo } {
  const info = computePreprocessInfo(bitmap.width, bitmap.height, targetSize);
  const resizedWidth = Math.round(bitmap.width * info.scale);
  const resizedHeight = Math.round(bitmap.height * info.scale);

  const canvas = new OffscreenCanvas(targetSize, targetSize);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("2D-Canvas-Kontext (OffscreenCanvas) konnte im Worker nicht erstellt werden");
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, targetSize, targetSize);
  ctx.drawImage(bitmap, 0, 0, resizedWidth, resizedHeight);

  const { data } = ctx.getImageData(0, 0, targetSize, targetSize); // RGBA, HWC, uint8
  const pixelCount = targetSize * targetSize;
  const tensorData = new Float32Array(3 * pixelCount); // NCHW: [R plane][G plane][B plane]
  for (let i = 0; i < pixelCount; i++) {
    const base = i * 4;
    tensorData[i] = data[base] / 127.5 - 1; // R
    tensorData[pixelCount + i] = data[base + 1] / 127.5 - 1; // G
    tensorData[2 * pixelCount + i] = data[base + 2] / 127.5 - 1; // B
  }
  return { tensorData, info };
}
