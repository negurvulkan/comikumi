/**
 * Pure post-processing math for the DBNet-style text detector — deliberately kept free
 * of any ONNX/worker/canvas dependency so it's unit-testable with plain synthetic
 * arrays (see detection.test.ts). worker.ts is the only caller: it runs the actual
 * model forward pass, then hands the raw output tensor to `decodeDetections()` here.
 *
 * Mirrors the DBNet post-processing steps documented for this class of model (resize-
 * longest-side + pad → sigmoid → binarize → connected components → confidence/size
 * filter → "unclip" expansion → map back to original image coordinates) — this is a
 * clean-room reimplementation from the publicly documented algorithm, not copied from
 * any specific project's source (see docs/ocr-model-provenance.md).
 */

export interface ProbMap {
  data: Float32Array;
  width: number;
  height: number;
}

export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
  /** Mean detector confidence (0..1) over the region's pixels. */
  confidence: number;
}

/** How the original image was resized+padded before being fed to the (fixed-size,
 * square) detector input — needed to map detected boxes back to real image pixels. */
export interface PreprocessInfo {
  scale: number;
  targetSize: number;
  origWidth: number;
  origHeight: number;
}

export const TEXT_THRESH = 0.5;
export const BOX_THRESH = 0.7;
export const MIN_BOX_SIZE = 3;
export const UNCLIP_RATIO = 2.3;

export function sigmoid(x: number): number {
  return 1 / (1 + Math.exp(-x));
}

/** Resize-longest-side-to-`targetSize`, top-left-aligned (padding added only on the
 * right/bottom) — so mapping a detection back to original coordinates is a plain
 * division by `scale`, no offset subtraction needed. */
export function computePreprocessInfo(origWidth: number, origHeight: number, targetSize = 2048): PreprocessInfo {
  const scale = targetSize / Math.max(origWidth, origHeight);
  return { scale, targetSize, origWidth, origHeight };
}

export function logitsToProbMap(logits: Float32Array, width: number, height: number): ProbMap {
  const data = new Float32Array(logits.length);
  for (let i = 0; i < logits.length; i++) data[i] = sigmoid(logits[i]);
  return { data, width, height };
}

export function binarize(probMap: ProbMap, threshold = TEXT_THRESH): Uint8Array {
  const mask = new Uint8Array(probMap.data.length);
  for (let i = 0; i < probMap.data.length; i++) mask[i] = probMap.data[i] >= threshold ? 1 : 0;
  return mask;
}

/** 4-connectivity flood fill, iterative (BFS via a reused index buffer) — 2048×2048
 * masks are ~4M pixels, a recursive flood fill would blow the call stack. Returns one
 * pixel-index array per connected component. */
export function connectedComponents(mask: Uint8Array, width: number, height: number): number[][] {
  const labeled = new Uint8Array(mask.length);
  const components: number[][] = [];
  const queue = new Int32Array(mask.length);

  for (let start = 0; start < mask.length; start++) {
    if (mask[start] !== 1 || labeled[start] === 1) continue;

    let head = 0;
    let tail = 0;
    queue[tail++] = start;
    labeled[start] = 1;
    const pixels: number[] = [];

    while (head < tail) {
      const idx = queue[head++];
      pixels.push(idx);
      const x = idx % width;
      const y = (idx / width) | 0;
      if (x > 0 && mask[idx - 1] === 1 && labeled[idx - 1] === 0) {
        labeled[idx - 1] = 1;
        queue[tail++] = idx - 1;
      }
      if (x < width - 1 && mask[idx + 1] === 1 && labeled[idx + 1] === 0) {
        labeled[idx + 1] = 1;
        queue[tail++] = idx + 1;
      }
      if (y > 0 && mask[idx - width] === 1 && labeled[idx - width] === 0) {
        labeled[idx - width] = 1;
        queue[tail++] = idx - width;
      }
      if (y < height - 1 && mask[idx + width] === 1 && labeled[idx + width] === 0) {
        labeled[idx + width] = 1;
        queue[tail++] = idx + width;
      }
    }
    components.push(pixels);
  }
  return components;
}

/** Axis-aligned bounding box + mean confidence over one component's pixels — `null`
 * if it fails the size or confidence filter (dropped, not a detection). */
export function boxFromComponent(pixels: number[], width: number, probMap: ProbMap): Box | null {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let sum = 0;
  for (const idx of pixels) {
    const x = idx % width;
    const y = (idx / width) | 0;
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
    sum += probMap.data[idx];
  }
  const w = maxX - minX + 1;
  const h = maxY - minY + 1;
  if (Math.min(w, h) < MIN_BOX_SIZE) return null;
  const confidence = sum / pixels.length;
  if (confidence < BOX_THRESH) return null;
  return { x: minX, y: minY, width: w, height: h, confidence };
}

/** DBNet's "unclip" step — the raw binarized region tends to be a shrunk core of the
 * real text area, so it's expanded outward by an area/perimeter-derived offset
 * (standard Vatti-clipping distance formula for this model family) before use. Applied
 * as a symmetric box expansion here (not a polygon offset) since the result only ever
 * needs to become a plain rect Bubble. */
export function unclipBox(box: Box, ratio = UNCLIP_RATIO): Box {
  const area = box.width * box.height;
  const perimeter = 2 * (box.width + box.height);
  const distance = perimeter > 0 ? (area * ratio) / perimeter : 0;
  return {
    x: box.x - distance,
    y: box.y - distance,
    width: box.width + 2 * distance,
    height: box.height + 2 * distance,
    confidence: box.confidence,
  };
}

export function mapBoxToOriginal(box: Box, info: PreprocessInfo): Box {
  return {
    x: box.x / info.scale,
    y: box.y / info.scale,
    width: box.width / info.scale,
    height: box.height / info.scale,
    confidence: box.confidence,
  };
}

/** Clamps a box (which `unclipBox`/scaling can push slightly outside the image) to
 * the actual image bounds — never returns negative width/height. */
export function clampBoxToImage(box: Box, imageWidth: number, imageHeight: number): Box {
  const x = Math.max(0, box.x);
  const y = Math.max(0, box.y);
  const right = Math.min(imageWidth, box.x + box.width);
  const bottom = Math.min(imageHeight, box.y + box.height);
  return { x, y, width: Math.max(0, right - x), height: Math.max(0, bottom - y), confidence: box.confidence };
}

/** Full pipeline: raw detector output logits → final boxes in original-image pixel
 * space, ready to become Bubbles. `mapWidth`/`mapHeight` are the detector's own output
 * tensor dimensions (the padded square, e.g. 2048×2048), which may differ from the
 * model's nominal input size if the model itself downsamples internally — kept as
 * explicit parameters rather than assumed, so this stays correct regardless. */
export function decodeDetections(logits: Float32Array, mapWidth: number, mapHeight: number, info: PreprocessInfo): Box[] {
  const probMap = logitsToProbMap(logits, mapWidth, mapHeight);
  const mask = binarize(probMap);
  const components = connectedComponents(mask, mapWidth, mapHeight);

  const boxes: Box[] = [];
  for (const pixels of components) {
    const box = boxFromComponent(pixels, mapWidth, probMap);
    if (!box) continue;
    const unclipped = unclipBox(box);
    const mapped = mapBoxToOriginal(unclipped, info);
    boxes.push(clampBoxToImage(mapped, info.origWidth, info.origHeight));
  }
  return boxes;
}
