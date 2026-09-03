import fs from "node:fs/promises";
import fsSync from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import sharp from "sharp";
import * as ort from "onnxruntime-node";
import { INPAINT_MODEL_PATH, CLEANED_CACHE_DIR } from "./paths.js";
import type { PageLayout } from "../../../shared/src/layoutSchema.js";

/**
 * Cleaning/Inpainting: removes the original printed text inside a client-painted mask
 * (see client/src/editor/CleanPageMaskEditor.tsx — rectangle/freehand/polygon/brush
 * tools, seeded with Auto-Bubbles' own client-side detector's regions, see
 * client/src/ocr/detection.ts; this module only does the reconstruction, never
 * detects/paints anything itself) and reconstructs the underlying artwork via
 * `Carve/LaMa-ONNX` (Apache-2.0, an ONNX export of advimman/lama's "big-lama"). See
 * docs/inpainting-model-provenance.md for the full license verification and why this
 * runs server-side (onnxruntime-node) rather than client-side like the detector/OCR
 * models — the model is ~198MB with a fixed 512×512 input, meaningfully heavier than
 * the ~90MB detector.
 *
 * The mask itself travels the wire as a full-page-resolution PNG (its ALPHA channel is
 * the actual 0/1 mask — see the client editor's doc comment for why alpha rather than
 * a color channel), not a list of shapes — an arbitrary hand-painted mask has no
 * compact vector form once brush strokes are involved, so a raster is the only
 * representation that covers every tool uniformly. `findMaskRegions()` below re-derives
 * per-region bounding boxes from that raster purely for TILING (each disjoint painted
 * blob still gets its own centered inference window, same idea — and, for a region that
 * fits in one tile, byte-for-byte the same tiling math — as the old box-list design).
 */

const MODEL_URL = "https://huggingface.co/Carve/LaMa-ONNX/resolve/main/lama_fp32.onnx";
// The model's own fixed input/output size (confirmed by reading the model author's
// own demo inference code, not guessed — see docs/inpainting-model-provenance.md).
const TILE_SIZE = 512;
// Extra ring of "definitely erase this too" around every painted mask pixel, in
// ORIGINAL image pixels before the crop is scaled to TILE_SIZE — covers anti-aliased
// text edges a hand-drawn/detected region didn't quite include. Deliberately smaller
// than detection.ts's DILATE_RADIUS (6, at the detector's 1024×1024 map resolution,
// tuned for merging glyphs into one box) — this is a different goal (mask margin, not
// component grouping) at a different resolution. See dilateMask().
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

// Extra breathing room (as a fraction of tileSize) added on every side of a crop
// window that's grown to fit an oversized box/region (see computeInpaintTiles below)
// — without this, a box that's grown to exactly fill the crop would leave the model no
// real surrounding content to blend the reconstruction into at the crop's own edges.
const CROP_CONTEXT_MARGIN_RATIO = 0.25;

/** For each box, a crop window centered on it — normally exactly `tileSize` (generous
 * context around a typical small/detected text region, and the ONLY size the model
 * actually accepts, see TILE_SIZE), but GROWN beyond `tileSize` when the box itself is
 * bigger than that (e.g. a hand-painted mask spanning a wide title banner, or several
 * separate detected regions that merged into one connected blob after dilation — see
 * findMaskRegions()) — the crop is always resized to `tileSize`×`tileSize` before
 * inference and the model's output resized back to the crop's own real size before
 * compositing (see inpaintTile()/cleanPage()), so a crop bigger than tileSize just
 * means the model sees that one region's content at a lower effective resolution, not
 * a hard failure.
 *
 * Grown SQUARE (both dimensions to the SAME size, driven by the box's larger
 * dimension), not independently per axis — an early version grew only the axis the box
 * needed (e.g. width for a wide-but-short banner), producing a heavily non-square crop
 * that then had to be squished into the model's square input, visibly distorting
 * everything in it (confirmed live: reconstructed content around a wide title banner
 * came back discolored/garbled well beyond the banner itself, not just at its edges).
 * A square crop costs some "wasted" context on the box's shorter axis, which is a far
 * smaller quality hit than aspect-ratio distortion.
 *
 * This replaced an even earlier "split an oversized region into a grid of
 * independently-reconstructed overlapping tileSize tiles" approach — each grid tile
 * had no knowledge of its neighbors' reconstructions, producing visible seams at the
 * tile boundaries. A single grown-and-downscaled crop has no seam to produce, at the
 * cost of detail on a genuinely large region — an acceptable trade for a text-removal
 * tool. */
export function computeInpaintTiles(boxes: InpaintBox[], imageWidth: number, imageHeight: number, tileSize = TILE_SIZE): InpaintTile[] {
  return boxes.map((box) => {
    const margin = tileSize * CROP_CONTEXT_MARGIN_RATIO;
    const neededSize = Math.ceil(Math.max(box.width, box.height) + margin * 2);
    const cropSize = Math.max(tileSize, neededSize);
    const cropWidth = Math.min(cropSize, imageWidth);
    const cropHeight = Math.min(cropSize, imageHeight);
    const maxX = Math.max(0, imageWidth - cropWidth);
    const maxY = Math.max(0, imageHeight - cropHeight);
    const centerX = box.x + box.width / 2;
    const centerY = box.y + box.height / 2;
    const cropX = Math.round(Math.max(0, Math.min(centerX - cropWidth / 2, maxX)));
    const cropY = Math.round(Math.max(0, Math.min(centerY - cropHeight / 2, maxY)));
    return { box, cropX, cropY, cropWidth, cropHeight };
  });
}

/** Generalizes computeInpaintTiles() from a client-supplied box list to an arbitrary
 * painted mask raster — finds each disjoint erased region (findMaskRegions) and gives
 * each one its own tile via computeInpaintTiles(), which already grows the crop window
 * to fit a region bigger than one tile (see its own doc comment). One tile per region,
 * always — no grid/multi-tile splitting, so two regions can never produce overlapping,
 * independently-reconstructed tiles that disagree with each other at a seam. */
export function computeInpaintTilesForMask(mask: Uint8Array, imageWidth: number, imageHeight: number, tileSize = TILE_SIZE): InpaintTile[] {
  const regions = findMaskRegions(mask, imageWidth, imageHeight);
  return computeInpaintTiles(regions, imageWidth, imageHeight, tileSize);
}

/** Finds the axis-aligned bounding box of each 4-connected non-zero region in a
 * full-page mask raster — generalizes the old "one client-supplied box per erased
 * region" tiling unit to an arbitrary painted mask (rectangle/freehand/polygon/brush,
 * all flattened to the same raster by the time this runs). Iterative (explicit array
 * as a stack), not recursive — a naive recursive flood fill could blow the call stack
 * on one large connected blob (a manga page mask can be millions of pixels). Pure/
 * deterministic — see inpainting.test.ts. */
export function findMaskRegions(mask: Uint8Array, width: number, height: number): InpaintBox[] {
  const visited = new Uint8Array(width * height);
  const regions: InpaintBox[] = [];
  const stack: number[] = [];
  for (let start = 0; start < mask.length; start++) {
    if (mask[start] === 0 || visited[start]) continue;
    let minX = width;
    let minY = height;
    let maxX = -1;
    let maxY = -1;
    stack.push(start);
    visited[start] = 1;
    while (stack.length > 0) {
      const idx = stack.pop()!;
      const x = idx % width;
      const y = (idx - x) / width;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
      if (x > 0 && mask[idx - 1] && !visited[idx - 1]) {
        visited[idx - 1] = 1;
        stack.push(idx - 1);
      }
      if (x < width - 1 && mask[idx + 1] && !visited[idx + 1]) {
        visited[idx + 1] = 1;
        stack.push(idx + 1);
      }
      if (y > 0 && mask[idx - width] && !visited[idx - width]) {
        visited[idx - width] = 1;
        stack.push(idx - width);
      }
      if (y < height - 1 && mask[idx + width] && !visited[idx + width]) {
        visited[idx + width] = 1;
        stack.push(idx + width);
      }
    }
    regions.push({ x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 });
  }
  return regions;
}

/** Grows every non-zero mask pixel outward by `radius` px — the raster equivalent of
 * the old per-box `padding` (see MASK_PADDING_PX), now applied once to the whole mask
 * up front instead of re-derived per tile. Separable box-dilate (one horizontal pass,
 * then one vertical pass over the horizontal result) rather than a true circular
 * dilate — a small square margin is indistinguishable from a circular one at
 * MASK_PADDING_PX's scale, and the separable approach is O(width×height) total instead
 * of O(radius×width×height) for a naive "grow by 1px, `radius` times" loop. Each pass
 * uses a sliding-window running count so it's a single left-to-right (or top-to-bottom)
 * sweep per row/column, not a nested per-pixel radius scan. Pure/deterministic — see
 * inpainting.test.ts. */
export function dilateMask(mask: Uint8Array, width: number, height: number, radius: number): Uint8Array {
  if (radius <= 0) return mask;
  const horizontal = new Uint8Array(mask.length);
  for (let y = 0; y < height; y++) {
    const rowStart = y * width;
    let count = 0;
    for (let x = 0; x < Math.min(radius, width); x++) count += mask[rowStart + x];
    for (let x = 0; x < width; x++) {
      const enter = x + radius;
      const leave = x - radius - 1;
      if (enter < width) count += mask[rowStart + enter];
      if (leave >= 0) count -= mask[rowStart + leave];
      horizontal[rowStart + x] = count > 0 ? 1 : 0;
    }
  }
  const result = new Uint8Array(mask.length);
  for (let x = 0; x < width; x++) {
    let count = 0;
    for (let y = 0; y < Math.min(radius, height); y++) count += horizontal[y * width + x];
    for (let y = 0; y < height; y++) {
      const enter = y + radius;
      const leave = y - radius - 1;
      if (enter < height) count += horizontal[enter * width + x];
      if (leave >= 0) count -= horizontal[leave * width + x];
      result[y * width + x] = count > 0 ? 1 : 0;
    }
  }
  return result;
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

/** Single-channel (1 byte/pixel) `size×size` buffer -> NCHW float32, binary (0 or 1)
 * — the `"mask"` input's real contract is `(1, 1, 512, 512)`, confirmed via a live
 * smoke test against the actual model file (`onnxruntime-node` rejected a 3-channel
 * mask with "Got: 3 Expected: 1" for this input) — the model author's own demo
 * *description* said "(1, 3, 512, 512)" for both inputs, which turned out to be an
 * inaccurate summary, not the real contract; see docs/inpainting-model-provenance.md's
 * Result section for the corrected write-up. Any non-zero byte counts as mask=1 (the
 * source is already binarized by dilateMask()/the route handler, but a resize step in
 * between — see inpaintTile() — can introduce intermediate values at edges). */
function maskBufferToMaskTensor(buf: Buffer | Uint8Array, size: number): Float32Array {
  const pixelCount = size * size;
  const tensor = new Float32Array(pixelCount);
  for (let i = 0; i < pixelCount; i++) {
    tensor[i] = buf[i] > 0 ? 1 : 0;
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

/** Crops+resizes ONE tile's window out of the full-page mask pipeline, as a strictly
 * single-channel (1 byte/pixel) buffer of exactly `tileSize*tileSize` bytes — the
 * shape maskBufferToMaskTensor() requires. `.toColourspace("b-w")` after the resize is
 * NOT redundant: confirmed via a live smoke test (not guessed) that sharp's `.resize()`
 * on a single-channel raw-input pipeline silently comes back 3-CHANNEL (RGB) even
 * though both the input and the requested output are single-channel — without forcing
 * back to greyscale, the buffer handed to maskBufferToMaskTensor() was actually 3x too
 * long, so every pixel read after the first third was reading the WRONG byte entirely,
 * producing a diagonally-sheared, near-garbage mask. This was THE root cause of a live
 * regression (masked regions weren't being erased at all; the one region that showed
 * visible change came back garbled instead of cleanly reconstructed). `kernel:
 * "nearest"` keeps the mask strictly binary rather than picking up anti-aliased
 * intermediate values from a smoother resize kernel. Exported for its own direct test
 * — see inpainting.test.ts — since inpaintTile() itself needs a real ONNX session and
 * isn't unit-testable. */
export async function cropMaskForTile(maskPipeline: ReturnType<typeof sharp>, tile: InpaintTile, tileSize = TILE_SIZE): Promise<Buffer> {
  return maskPipeline
    .clone()
    .extract({ left: tile.cropX, top: tile.cropY, width: tile.cropWidth, height: tile.cropHeight })
    .resize(tileSize, tileSize, { fit: "fill", kernel: "nearest" })
    .toColourspace("b-w")
    .raw()
    .toBuffer();
}

/** Runs one tile's inpainting end-to-end: crop the source image -> resize to
 * TILE_SIZE -> model inference against the SAME crop window of the real mask (see
 * cropMaskForTile()) -> resize the result back to the tile's own crop size. Returns a
 * PNG buffer at `tile.cropWidth`×`tile.cropHeight`, ready to composite back into the
 * full page at `(tile.cropX, tile.cropY)`. `maskPipeline` is a sharp() pipeline over
 * the full-page (already dilated/binarized) mask raster — cloned per tile since a
 * sharp pipeline is consumed once its output is read. */
async function inpaintTile(session: ort.InferenceSession, sourcePath: string, maskPipeline: ReturnType<typeof sharp>, tile: InpaintTile): Promise<Buffer> {
  // fit: "fill" — sharp's DEFAULT fit is "cover", which for a non-square crop (see
  // computeInpaintTiles()'s grown-crop doc comment: cropWidth and cropHeight can now
  // differ) center-CROPS away the excess instead of stretching, silently cutting off
  // exactly the extra width/height the crop was grown to include. A square crop (the
  // common case) is unaffected either way — "fill" and "cover" agree when the source
  // and target already share an aspect ratio.
  const cropRgb = await sharp(sourcePath)
    .extract({ left: tile.cropX, top: tile.cropY, width: tile.cropWidth, height: tile.cropHeight })
    .resize(TILE_SIZE, TILE_SIZE, { fit: "fill" })
    .removeAlpha()
    .raw()
    .toBuffer();

  const cropMask = await cropMaskForTile(maskPipeline, tile);

  const feeds = {
    image: new ort.Tensor("float32", rgbBufferToImageTensor(cropRgb, TILE_SIZE), [1, 3, TILE_SIZE, TILE_SIZE]),
    mask: new ort.Tensor("float32", maskBufferToMaskTensor(cropMask, TILE_SIZE), [1, 1, TILE_SIZE, TILE_SIZE]),
  };
  const outputs = await session.run(feeds);
  const outputTensor = outputs[session.outputNames[0]];
  const outputRgb = outputTensorToRgbBuffer(outputTensor.data as Float32Array, TILE_SIZE);

  return sharp(outputRgb, { raw: { width: TILE_SIZE, height: TILE_SIZE, channels: 3 } })
    .resize(tile.cropWidth, tile.cropHeight, { fit: "fill" })
    .png()
    .toBuffer();
}

/** Cleans `sourcePath` inside `mask` (a full-page, single-channel raster at EXACTLY
 * the source image's own resolution — 0 = keep, non-zero = erase-and-reconstruct; see
 * client/src/editor/CleanPageMaskEditor.tsx for how this is painted) and (over)writes
 * the result to this source's cache slot — always regenerates, even if a cache entry
 * already exists (this is only called from the explicit, user-triggered "clean this
 * page" action, where re-running with an updated mask should never silently reuse a
 * stale result — see getCleanedImagePath() for the separate, non-regenerating read
 * path rendering code uses). No-op-ish (just copies the source through) when the mask
 * is entirely empty, so confirming with nothing painted doesn't error. */
export async function cleanPage(sourcePath: string, mask: Uint8Array, maskWidth: number, maskHeight: number): Promise<string> {
  await fs.mkdir(CLEANED_CACHE_DIR, { recursive: true });
  const cachePath = cacheFileFor(sourcePath);

  if (!mask.some((v) => v !== 0)) {
    await fs.copyFile(sourcePath, cachePath);
    return cachePath;
  }

  const session = await loadInpaintSession();
  const metadata = await sharp(sourcePath).metadata();
  const imageWidth = metadata.width ?? 0;
  const imageHeight = metadata.height ?? 0;
  if (maskWidth !== imageWidth || maskHeight !== imageHeight) {
    throw new Error(`mask_size_mismatch: Maske ${maskWidth}x${maskHeight}, Bild ${imageWidth}x${imageHeight}`);
  }

  const dilated = dilateMask(mask, imageWidth, imageHeight, MASK_PADDING_PX);
  const maskPipeline = sharp(Buffer.from(dilated), { raw: { width: imageWidth, height: imageHeight, channels: 1 } });
  const tiles = computeInpaintTilesForMask(dilated, imageWidth, imageHeight);

  let composite = sharp(sourcePath);
  for (const tile of tiles) {
    const tileBuffer = await inpaintTile(session, sourcePath, maskPipeline, tile);
    composite = sharp(await composite.composite([{ input: tileBuffer, left: tile.cropX, top: tile.cropY }]).png().toBuffer());
  }
  const finalBuffer = await composite.png().toBuffer();
  await fs.writeFile(cachePath, finalBuffer);
  return cachePath;
}
