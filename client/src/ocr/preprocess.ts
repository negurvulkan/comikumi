import { computePreprocessInfo, type Box, type PreprocessInfo } from "./detection";

/** Crops `region` (already in the bitmap's own unscaled pixel space — a detected
 * region after `mapBoxToOriginal`/`clampBoxToImage`, see detection.ts) out of `bitmap`
 * into its own small `OffscreenCanvas`, for OCR to read just that one text region
 * instead of the whole page. Same OffscreenCanvas approach as resizeAndPadToTensor
 * (Worker-only, no DOM canvas), but a plain 1:1 crop — no resize/pad/normalize, since
 * that's the OCR pipeline's own job (transformers.js's image processor), not this
 * detector-specific preprocessing. Clamps to the bitmap's own bounds defensively (a
 * region's `unclipBox` expansion is already clamped upstream, but a caller-supplied
 * region isn't guaranteed to be). Returns `null` for a degenerate (zero-area) region. */
export function cropToCanvas(bitmap: ImageBitmap, region: Box): OffscreenCanvas | null {
  const x = Math.max(0, Math.round(region.x));
  const y = Math.max(0, Math.round(region.y));
  const width = Math.min(bitmap.width - x, Math.round(region.width));
  const height = Math.min(bitmap.height - y, Math.round(region.height));
  if (width <= 0 || height <= 0) return null;

  const canvas = new OffscreenCanvas(width, height);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("2D-Canvas-Kontext (OffscreenCanvas) konnte im Worker nicht erstellt werden");
  ctx.drawImage(bitmap, x, y, width, height, 0, 0, width, height);
  return canvas;
}

/** Resizes `crop` to a fixed 224×224 (plain squash resize, no aspect-ratio
 * preservation — matches manga-ocr's own `preprocessor_config.json`: fixed
 * `size: {height: 224, width: 224}`, `ViTImageProcessor` type, no
 * "keep_aspect_ratio" flag) and normalizes to -1..1 (`image_mean`/`image_std` both
 * `0.5`, i.e. `(px/255 - 0.5) / 0.5`, algebraically `px/127.5 - 1`) in NCHW float32
 * layout — the OCR encoder's own expected input, verified against the model's own
 * config (distinct from the DETECTOR's `px/255` normalization in
 * resizeAndPadToTensor above — different model, different expected range, do not
 * conflate the two). */
export function preprocessForOcr(crop: OffscreenCanvas): Float32Array {
  const targetSize = 224;
  const canvas = new OffscreenCanvas(targetSize, targetSize);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("2D-Canvas-Kontext (OffscreenCanvas) konnte im Worker nicht erstellt werden");
  ctx.drawImage(crop, 0, 0, targetSize, targetSize);

  const { data } = ctx.getImageData(0, 0, targetSize, targetSize); // RGBA, HWC, uint8
  const pixelCount = targetSize * targetSize;
  const tensorData = new Float32Array(3 * pixelCount); // NCHW: [R plane][G plane][B plane]
  for (let i = 0; i < pixelCount; i++) {
    const base = i * 4;
    tensorData[i] = data[base] / 127.5 - 1; // R
    tensorData[pixelCount + i] = data[base + 1] / 127.5 - 1; // G
    tensorData[2 * pixelCount + i] = data[base + 2] / 127.5 - 1; // B
  }
  return tensorData;
}

/** Resizes `bitmap`'s longest side to `targetSize`, pads (top-left aligned, black
 * fill) to a `targetSize`×`targetSize` square, and normalizes to the detector's
 * expected `px/255` range (0..1) in NCHW float32 layout — matches the upstream
 * `zyddnys/manga-image-translator` reference preprocessing exactly (confirmed from
 * its own `letterbox()`/inference source — plain `/255` normalization, NOT the
 * `(px/127.5)-1` range this file used before, which was an unverified assumption
 * that silently produced near-zero activations, not a crash, so it went unnoticed
 * until real end-to-end testing). Runs on
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
    tensorData[i] = data[base] / 255; // R
    tensorData[pixelCount + i] = data[base + 1] / 255; // G
    tensorData[2 * pixelCount + i] = data[base + 2] / 255; // B
  }
  return { tensorData, info };
}
