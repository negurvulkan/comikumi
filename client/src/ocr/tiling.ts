import type { Box } from "./detection";

/** One horizontal, full-width slice of a page to run detection on independently — see
 * computeDetectionBands's own doc comment. Deliberately its own type, not detection.ts's
 * `Box` (which carries a per-detection `confidence` that has no meaning for a band). */
export interface Band {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Batch W — Webtoon support: `resizeAndPadToTensor` (preprocess.ts) squashes the WHOLE
 * page onto a `targetSize`×`targetSize` square before detection — fine for a normally-
 * proportioned page, but for a realistic webtoon strip (e.g. 800×20,000) the effective
 * scale is so small (≈0.05) that text shrinks to 1-2px and detection is effectively dead.
 * Splits the page into horizontal bands instead, each detected independently at full
 * resolution (relative to its own crop) and merged back — see mergeBandBoxes.
 *
 * Band height is chosen so a band is close to SQUARE (minimizing the letterbox padding
 * `resizeAndPadToTensor` would otherwise waste on a very wide-but-short or narrow-but-
 * tall crop) while never going below the detector's own `targetSize` — a narrow page
 * (imageWidth < targetSize) would otherwise produce many more, needlessly short bands
 * than necessary. `overlapRatio` (of the band height) is how much consecutive bands
 * overlap, so text sitting on a band boundary still appears complete in at least one
 * band — see mergeBandBoxes for how the resulting duplicate detection is resolved.
 *
 * A page shorter than one band's height returns a single band covering the whole page —
 * this degenerates to exactly today's single-pass behavior for any normally-proportioned
 * page, not just webtoons. */
export function computeDetectionBands(imageWidth: number, imageHeight: number, targetSize = 1024, overlapRatio = 0.15): Band[] {
  if (imageWidth <= 0 || imageHeight <= 0) return [];
  const bandHeight = Math.min(imageHeight, Math.max(imageWidth, targetSize));
  if (bandHeight >= imageHeight) {
    return [{ x: 0, y: 0, width: imageWidth, height: imageHeight }];
  }

  const overlap = Math.round(bandHeight * overlapRatio);
  const step = Math.max(1, bandHeight - overlap);
  const bands: Band[] = [];
  let y = 0;
  // The last band is pinned to end exactly at imageHeight (not `y + bandHeight`, which
  // would usually overshoot) so every band stays within the page and no band is a tiny
  // sliver shorter than the others.
  while (y < imageHeight) {
    const height = Math.min(bandHeight, imageHeight - y);
    bands.push({ x: 0, y, width: imageWidth, height });
    if (y + height >= imageHeight) break;
    y += step;
  }
  return bands;
}

function boxIoU(a: Box, b: Box): number {
  const x1 = Math.max(a.x, b.x);
  const y1 = Math.max(a.y, b.y);
  const x2 = Math.min(a.x + a.width, b.x + b.width);
  const y2 = Math.min(a.y + a.height, b.y + b.height);
  const interArea = Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
  if (interArea <= 0) return 0;
  const union = a.width * a.height + b.width * b.height - interArea;
  return union <= 0 ? 0 : interArea / union;
}

/** Merges each band's own detections (in that band's own crop-local coordinates) back
 * into one list of boxes in full-page coordinates, deduplicating detections that appear
 * in more than one band's overlap region. `boxesPerBand[i]` must correspond to
 * `bands[i]` (same index, same band geometry that was actually fed to the detector for
 * that band) — a shorter `boxesPerBand` (e.g. a band that errored) is tolerated, missing
 * entries are simply skipped.
 *
 * Deduplication is a plain greedy IoU suppression (confidence-sorted, matching the same
 * idea non-max-suppression already uses elsewhere in detection.ts) rather than anything
 * band-boundary-aware — text that's split by the overlap so that NEITHER band captures
 * it whole isn't something this function can fix after the fact; that's the overlap
 * ratio's job to prevent in the first place. */
export function mergeBandBoxes(boxesPerBand: Box[][], bands: Band[]): Box[] {
  const IOU_DEDUP_THRESHOLD = 0.5;
  const shifted: Box[] = [];
  for (let i = 0; i < bands.length; i++) {
    for (const box of boxesPerBand[i] ?? []) {
      shifted.push({ ...box, x: box.x + bands[i].x, y: box.y + bands[i].y });
    }
  }
  // Higher-confidence copy of a duplicate wins — process in descending confidence order.
  const sorted = [...shifted].sort((a, b) => b.confidence - a.confidence);
  const kept: Box[] = [];
  for (const box of sorted) {
    if (!kept.some((k) => boxIoU(box, k) > IOU_DEDUP_THRESHOLD)) kept.push(box);
  }
  return kept;
}
