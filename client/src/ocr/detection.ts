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
export function computePreprocessInfo(origWidth: number, origHeight: number, targetSize = 1024): PreprocessInfo {
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

/** Default dilation radius (px, at the detector's own 1024×1024 map resolution) —
 * closes gaps between adjacent glyph strokes in the raw mask (this model's `seg`
 * output traces individual letters, built for pixel-precise text removal, not
 * per-line/bubble boxes — without bridging that gap, connectedComponents() finds one
 * component per character instead of one per text block). Empirically tuned against
 * real manga pages (started from radius 3, the "5x5 kernel" idea in the upstream
 * repo's own mask-merging code, `ctd_utils/textmask.py`'s
 * `cv2.dilate(..., np.ones((5,5)), iterations=1)`) — 6 gave the cleanest result (3
 * correctly-merged bubbles on each of 3 test pages, no fragmentation and no
 * over-merging of distinct bubbles). Revisit if a wider variety of test pages later
 * shows this value merging separate nearby bubbles together. */
export const DILATE_RADIUS = 6;

/** Square-kernel dilation: a pixel becomes 1 if any pixel within `radius` (Chebyshev
 * distance, i.e. a `(2r+1)x(2r+1)` box) is 1 — closes small gaps between nearby glyphs
 * so they merge into one connectedComponents() blob per text line/bubble instead of
 * one per character. Two-pass (horizontal then vertical) box-blur-style dilation
 * instead of a naive O(width*height*radius^2) full-kernel scan — same result, much
 * cheaper for a 1024x1024 mask. */
export function dilateMask(mask: Uint8Array, width: number, height: number, radius = DILATE_RADIUS): Uint8Array {
  if (radius <= 0) return mask;
  const horizontal = new Uint8Array(mask.length);
  for (let y = 0; y < height; y++) {
    const row = y * width;
    for (let x = 0; x < width; x++) {
      let hit = 0;
      for (let dx = -radius; dx <= radius && !hit; dx++) {
        const nx = x + dx;
        if (nx >= 0 && nx < width && mask[row + nx]) hit = 1;
      }
      horizontal[row + x] = hit;
    }
  }
  const dilated = new Uint8Array(mask.length);
  for (let x = 0; x < width; x++) {
    for (let y = 0; y < height; y++) {
      let hit = 0;
      for (let dy = -radius; dy <= radius && !hit; dy++) {
        const ny = y + dy;
        if (ny >= 0 && ny < height && horizontal[ny * width + x]) hit = 1;
      }
      dilated[y * width + x] = hit;
    }
  }
  return dilated;
}

/** 4-connectivity flood fill, iterative (BFS via a reused index buffer) — a 1024×1024
 * mask is ~1M pixels, a recursive flood fill would blow the call stack. Returns one
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

/** Full pipeline: raw detector output → final boxes in original-image pixel space,
 * ready to become Bubbles. `mapWidth`/`mapHeight` are the detector's own output tensor
 * dimensions (the padded square, e.g. 1024×1024), which may differ from the model's
 * nominal input size if the model itself downsamples internally — kept as explicit
 * parameters rather than assumed, so this stays correct regardless.
 *
 * `alreadyActivated` (default `false`, preserving the original "raw logits, apply our
 * own sigmoid" assumption): the `comictextdetector.pt.onnx` model's `seg` output was
 * confirmed via live inference to already be a 0..1 probability map (its own graph
 * applies sigmoid internally — observed raw values exactly in [0,1] with max=1.0), so
 * applying `logitsToProbMap`'s sigmoid a SECOND time compressed every pixel into
 * [0.5, 0.73] — always above TEXT_THRESH regardless of content, turning the whole page
 * into one giant "text" blob that then failed the confidence filter. Pass `true` for
 * this model to skip the redundant sigmoid and use the output as-is.
 *
 * `dilateRadius` (default `DILATE_RADIUS`) overrides dilateMask's gap-bridging
 * radius — mainly for tests exercising a specific radius; worker.ts always uses
 * the default. */
export function decodeDetections(
  values: Float32Array,
  mapWidth: number,
  mapHeight: number,
  info: PreprocessInfo,
  alreadyActivated = false,
  dilateRadius = DILATE_RADIUS
): Box[] {
  const probMap = alreadyActivated ? { data: values, width: mapWidth, height: mapHeight } : logitsToProbMap(values, mapWidth, mapHeight);
  const mask = binarize(probMap);
  // Group via the DILATED mask (bridges small gaps between adjacent glyphs into one
  // component per text line/bubble — see dilateMask's doc comment), but compute each
  // box's bounds/confidence from only the TRUE (undilated) ink pixels within that
  // group — otherwise the dilation's own gap-filler pixels (never actually above
  // TEXT_THRESH) would loosen the box and drag down the mean confidence.
  const dilated = dilateMask(mask, mapWidth, mapHeight, dilateRadius);
  const components = connectedComponents(dilated, mapWidth, mapHeight);

  const boxes: Box[] = [];
  for (const group of components) {
    const pixels = group.filter((idx) => mask[idx] === 1);
    if (pixels.length === 0) continue;
    const box = boxFromComponent(pixels, mapWidth, probMap);
    if (!box) continue;
    const unclipped = unclipBox(box);
    const mapped = mapBoxToOriginal(unclipped, info);
    boxes.push(clampBoxToImage(mapped, info.origWidth, info.origHeight));
  }
  return boxes;
}
