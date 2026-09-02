import fs from "node:fs/promises";
import fsSync from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import sharp from "sharp";
import { createCanvas } from "@napi-rs/canvas";
import * as ort from "onnxruntime-node";
import { INPAINT_MODEL_PATH, CLEANED_CACHE_DIR } from "./paths.js";
import type { PageLayout } from "../../../shared/src/layoutSchema.js";

/**
 * Cleaning/Inpainting: removes the original printed text inside detected regions
 * (reusing Auto-Bubbles' own client-side detector — see client/src/ocr/detection.ts —
 * this module only does the reconstruction, not detection) and reconstructs the
 * underlying artwork via `Carve/LaMa-ONNX` (Apache-2.0, an ONNX export of
 * advimman/lama's "big-lama"). See docs/inpainting-model-provenance.md for the full
 * license verification and why this runs server-side (onnxruntime-node) rather than
 * client-side like the detector/OCR models — the model is ~198MB with a fixed
 * 512×512 input, meaningfully heavier than the ~90MB detector.
 */

const MODEL_URL = "https://huggingface.co/Carve/LaMa-ONNX/resolve/main/lama_fp32.onnx";
// The model's own fixed input/output size (confirmed by reading the model author's
// own demo inference code, not guessed — see docs/inpainting-model-provenance.md).
const TILE_SIZE = 512;
// Extra ring of "definitely erase this too" around each detected box, in ORIGINAL
// image pixels before the crop is scaled to TILE_SIZE — covers anti-aliased text
// edges the detector's own box didn't quite include. Deliberately smaller than
// detection.ts's DILATE_RADIUS (6, at the detector's 1024×1024 map resolution, tuned
// for merging glyphs into one box) — this is a different goal (mask margin, not
// component grouping) at a different resolution.
const MASK_PADDING_PX = 8;

export interface InpaintBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

function cacheFileFor(sourcePath: string): string {
  const key = crypto.createHash("sha1").update(sourcePath).digest("hex");
  return path.join(CLEANED_CACHE_DIR, `${key}.png`);
}

/** Path to the cached cleaned image for `sourcePath`, IF one exists and is still
 * valid (not older than the source scan) — `null` otherwise, so callers (rendering
 * code) can silently fall back to the raw scan rather than erroring. Never triggers
 * generation itself — see `cleanPage()` for that, an explicit user-triggered action,
 * not something rendering should do opportunistically (unlike thumbnails, cleaning is
 * slow/model-driven and shouldn't run as a side effect of just opening a page). */
export async function getCleanedImagePath(sourcePath: string): Promise<string | null> {
  const cachePath = cacheFileFor(sourcePath);
  try {
    const [sourceStat, cacheStat] = await Promise.all([fs.stat(sourcePath), fs.stat(cachePath)]);
    return cacheStat.mtimeMs >= sourceStat.mtimeMs ? cachePath : null;
  } catch {
    return null;
  }
}

/** The single choke point every renderer (thumbnails, PNG/vector-PDF export, layered
 * PSD export) should call instead of using a page's raw `absolutePath` directly —
 * returns the cached cleaned image's path when the layout opts in
 * (`useCleanedBackground: true`) AND a valid cached result actually exists, else the
 * original `sourcePath` unchanged. Never throws; a missing/invalidated cache (e.g. the
 * scan was replaced since cleaning) silently falls back to the raw scan rather than
 * erroring every render. */
export async function resolveBaseImagePath(sourcePath: string, layout: Pick<PageLayout, "useCleanedBackground">): Promise<string> {
  if (!layout.useCleanedBackground) return sourcePath;
  const cleanedPath = await getCleanedImagePath(sourcePath);
  return cleanedPath ?? sourcePath;
}

/** Axis-aligned crop window in ORIGINAL image pixel space for one box's inpainting
 * tile — centered on the box, clamped to the image bounds, sized to exactly
 * TILE_SIZE where the image is large enough (shrunk only if the whole image is
 * smaller than TILE_SIZE in that dimension). Pure geometry, no I/O — see
 * inpainting.test.ts. */
export interface InpaintTile {
  box: InpaintBox;
  cropX: number;
  cropY: number;
  cropWidth: number;
  cropHeight: number;
}

export function computeInpaintTiles(boxes: InpaintBox[], imageWidth: number, imageHeight: number, tileSize = TILE_SIZE): InpaintTile[] {
  return boxes.map((box) => {
    const cropWidth = Math.min(tileSize, imageWidth);
    const cropHeight = Math.min(tileSize, imageHeight);
    const maxX = Math.max(0, imageWidth - cropWidth);
    const maxY = Math.max(0, imageHeight - cropHeight);
    const centerX = box.x + box.width / 2;
    const centerY = box.y + box.height / 2;
    const cropX = Math.round(Math.max(0, Math.min(centerX - cropWidth / 2, maxX)));
    const cropY = Math.round(Math.max(0, Math.min(centerY - cropHeight / 2, maxY)));
    return { box, cropX, cropY, cropWidth, cropHeight };
  });
}

/** Black canvas with white filled rectangles for each box (plus `padding` px margin
 * on every side) — the mask convention `lama_fp32.onnx` expects (white = "erase and
 * reconstruct this"). `width`/`height` and each box's coordinates are all in the SAME
 * space — callers pass either whole-page or single-tile-local coordinates, this
 * function doesn't care which. Pure/deterministic, no model involved — see
 * inpainting.test.ts. */
export function buildMaskCanvas(boxes: InpaintBox[], width: number, height: number, padding = 0) {
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#000000";
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = "#ffffff";
  for (const box of boxes) {
    ctx.fillRect(box.x - padding, box.y - padding, box.width + padding * 2, box.height + padding * 2);
  }
  return canvas;
}

/** RGB (3-channel, alpha already stripped), HWC, uint8 `size×size` buffer -> NCHW
 * float32 in 0..1 — the `"image"` input's exact contract, confirmed via the model
 * author's own demo code (see docs/inpainting-model-provenance.md). */
function rgbBufferToImageTensor(rgb: Buffer, size: number): Float32Array {
  const pixelCount = size * size;
  const tensor = new Float32Array(3 * pixelCount);
  for (let i = 0; i < pixelCount; i++) {
    const base = i * 3;
    tensor[i] = rgb[base] / 255;
    tensor[pixelCount + i] = rgb[base + 1] / 255;
    tensor[2 * pixelCount + i] = rgb[base + 2] / 255;
  }
  return tensor;
}

/** RGBA `size×size` mask canvas data (from buildMaskCanvas, read back via
 * getImageData) -> NCHW float32, binary (0 or 1), SINGLE channel — the `"mask"`
 * input's real contract is `(1, 1, 512, 512)`, confirmed via a live smoke test
 * against the actual model file (`onnxruntime-node` rejected a 3-channel mask with
 * "Got: 3 Expected: 1" for this input) — the model author's own demo *description*
 * said "(1, 3, 512, 512)" for both inputs, which turned out to be an inaccurate
 * summary, not the real contract; see docs/inpainting-model-provenance.md's Result
 * section for the corrected write-up. Reads only the red channel per pixel (mask is
 * pure black/white, any channel carries the same value). */
function maskDataToMaskTensor(maskRgba: Uint8ClampedArray | Uint8Array, size: number): Float32Array {
  const pixelCount = size * size;
  const tensor = new Float32Array(pixelCount);
  for (let i = 0; i < pixelCount; i++) {
    tensor[i] = maskRgba[i * 4] > 0 ? 1 : 0;
  }
  return tensor;
}

/** Model output tensor data (NCHW float32, ALREADY in 0..255 range, (1,3,size,size))
 * -> RGB HWC uint8 buffer. Confirmed via the same live smoke test that caught the
 * mask-channel-count bug above: a mid-gray (127.5) input pixel far outside the mask
 * came back as exactly 127.5 in the output, not ~0.5 — the reference PyTorch
 * pipeline's own `np.clip(cur_res * 255, 0, 255)` post-processing (which this file's
 * doc comments originally, incorrectly, assumed this ONNX export's output still
 * needed too) only applies to that pipeline's own 0..1-range tensor; this export's
 * output tensor is already scaled. Multiplying by 255 again would have driven every
 * value near/at 255 (near-total white-out) — exactly the kind of bug this smoke test
 * exists to catch before a real page ever hits it. */
function outputTensorToRgbBuffer(data: Float32Array, size: number): Buffer {
  const pixelCount = size * size;
  const buffer = Buffer.alloc(pixelCount * 3);
  for (let i = 0; i < pixelCount; i++) {
    const base = i * 3;
    buffer[base] = Math.max(0, Math.min(255, Math.round(data[i])));
    buffer[base + 1] = Math.max(0, Math.min(255, Math.round(data[pixelCount + i])));
    buffer[base + 2] = Math.max(0, Math.min(255, Math.round(data[2 * pixelCount + i])));
  }
  return buffer;
}

async function ensureModelDownloaded(): Promise<void> {
  if (fsSync.existsSync(INPAINT_MODEL_PATH)) return;
  await fs.mkdir(path.dirname(INPAINT_MODEL_PATH), { recursive: true });
  const res = await fetch(MODEL_URL);
  if (!res.ok) throw new Error(`Inpainting-Modell konnte nicht geladen werden (${res.status}): ${MODEL_URL}`);
  const buffer = Buffer.from(await res.arrayBuffer());
  await fs.writeFile(INPAINT_MODEL_PATH, buffer);
}

let sessionPromise: Promise<ort.InferenceSession> | null = null;

/** Loads (or serves from the persistent server-side cache) the LaMa inpainting
 * session — fetched once from its own HuggingFace repo on first use, same "fetch
 * once, cache to disk forever" contract as the client's OCR/detector model loaders,
 * just server-side (see paths.ts's INPAINT_MODEL_PATH doc comment). */
function loadInpaintSession(): Promise<ort.InferenceSession> {
  if (!sessionPromise) {
    sessionPromise = (async () => {
      await ensureModelDownloaded();
      return ort.InferenceSession.create(INPAINT_MODEL_PATH);
    })().catch((err) => {
      sessionPromise = null;
      throw err;
    });
  }
  return sessionPromise;
}

/** Runs one box's inpainting tile end-to-end: crop -> resize to TILE_SIZE -> model
 * inference with a matching local mask -> resize back to the tile's own crop size.
 * Returns a PNG buffer at `tile.cropWidth`×`tile.cropHeight`, ready to composite back
 * into the full page at `(tile.cropX, tile.cropY)`. */
async function inpaintTile(session: ort.InferenceSession, sourcePath: string, tile: InpaintTile): Promise<Buffer> {
  const cropRgb = await sharp(sourcePath)
    .extract({ left: tile.cropX, top: tile.cropY, width: tile.cropWidth, height: tile.cropHeight })
    .resize(TILE_SIZE, TILE_SIZE)
    .removeAlpha()
    .raw()
    .toBuffer();

  // The box, translated into this tile's local (crop-then-resized-to-TILE_SIZE)
  // coordinate space, so the mask lines up with what the model actually sees.
  const scaleX = TILE_SIZE / tile.cropWidth;
  const scaleY = TILE_SIZE / tile.cropHeight;
  const localBox: InpaintBox = {
    x: (tile.box.x - tile.cropX) * scaleX,
    y: (tile.box.y - tile.cropY) * scaleY,
    width: tile.box.width * scaleX,
    height: tile.box.height * scaleY,
  };
  const maskCanvas = buildMaskCanvas([localBox], TILE_SIZE, TILE_SIZE, MASK_PADDING_PX * Math.max(scaleX, scaleY));
  const maskData = maskCanvas.getContext("2d").getImageData(0, 0, TILE_SIZE, TILE_SIZE).data;

  const feeds = {
    image: new ort.Tensor("float32", rgbBufferToImageTensor(cropRgb, TILE_SIZE), [1, 3, TILE_SIZE, TILE_SIZE]),
    mask: new ort.Tensor("float32", maskDataToMaskTensor(maskData, TILE_SIZE), [1, 1, TILE_SIZE, TILE_SIZE]),
  };
  const outputs = await session.run(feeds);
  const outputTensor = outputs[session.outputNames[0]];
  const outputRgb = outputTensorToRgbBuffer(outputTensor.data as Float32Array, TILE_SIZE);

  return sharp(outputRgb, { raw: { width: TILE_SIZE, height: TILE_SIZE, channels: 3 } })
    .resize(tile.cropWidth, tile.cropHeight)
    .png()
    .toBuffer();
}

/** Cleans `sourcePath` inside every box in `boxes` and (over)writes the result to this
 * source's cache slot — always regenerates, even if a cache entry already exists
 * (this is only called from the explicit, user-triggered "clean this page" action,
 * where re-running with different/updated boxes should never silently reuse a stale
 * result — see getCleanedImagePath() for the separate, non-regenerating read path
 * rendering code uses). No-op-ish (just copies the source through) when `boxes` is
 * empty, so calling this with nothing detected doesn't error. */
export async function cleanPage(sourcePath: string, boxes: InpaintBox[]): Promise<string> {
  await fs.mkdir(CLEANED_CACHE_DIR, { recursive: true });
  const cachePath = cacheFileFor(sourcePath);

  if (boxes.length === 0) {
    await fs.copyFile(sourcePath, cachePath);
    return cachePath;
  }

  const session = await loadInpaintSession();
  const metadata = await sharp(sourcePath).metadata();
  const imageWidth = metadata.width ?? 0;
  const imageHeight = metadata.height ?? 0;
  const tiles = computeInpaintTiles(boxes, imageWidth, imageHeight);

  let composite = sharp(sourcePath);
  for (const tile of tiles) {
    const tileBuffer = await inpaintTile(session, sourcePath, tile);
    composite = sharp(await composite.composite([{ input: tileBuffer, left: tile.cropX, top: tile.cropY }]).png().toBuffer());
  }
  const finalBuffer = await composite.png().toBuffer();
  await fs.writeFile(cachePath, finalBuffer);
  return cachePath;
}
