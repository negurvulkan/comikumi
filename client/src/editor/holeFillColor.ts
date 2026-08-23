export interface Bounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

// Reused across calls purely for reading pixel data off an already-loaded page image —
// never drawn to the visible page, same private lazily-created/reused canvas pattern as
// BubbleShape.tsx's getMeasureCtx().
let sampleCanvas: HTMLCanvasElement | null = null;
let sampleCtx: CanvasRenderingContext2D | null = null;

function toHex(n: number): string {
  return Math.round(Math.max(0, Math.min(255, n)))
    .toString(16)
    .padStart(2, "0");
}

/**
 * Averages the pixel color in a thin ring just OUTSIDE the given bounds (clamped to the
 * image's own dimensions) — the most plausible guess for "what color is the page right
 * next to this panel", used as the initial hole-fill color when a Cut-Panel is created
 * (see PageCanvas.tsx's cut-panel draw-finish handler). Only ever called once, at
 * creation time — not on every render/reshape, see the plan's "deliberate simplification"
 * note in FEATURES.md#cut-panel.
 */
export function sampleAverageColor(image: HTMLImageElement, bounds: Bounds): string {
  const RING = 6;
  if (!sampleCanvas) {
    sampleCanvas = document.createElement("canvas");
    sampleCtx = sampleCanvas.getContext("2d", { willReadFrequently: true });
  }
  const canvas = sampleCanvas;
  const ctx = sampleCtx;
  if (!ctx) return "#ffffff";
  if (canvas.width !== image.naturalWidth || canvas.height !== image.naturalHeight) {
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    ctx.drawImage(image, 0, 0);
  }

  const outerX0 = Math.max(0, Math.floor(bounds.minX - RING));
  const outerY0 = Math.max(0, Math.floor(bounds.minY - RING));
  const outerX1 = Math.min(canvas.width, Math.ceil(bounds.maxX + RING));
  const outerY1 = Math.min(canvas.height, Math.ceil(bounds.maxY + RING));
  const innerX0 = Math.max(0, Math.floor(bounds.minX));
  const innerY0 = Math.max(0, Math.floor(bounds.minY));
  const innerX1 = Math.min(canvas.width, Math.ceil(bounds.maxX));
  const innerY1 = Math.min(canvas.height, Math.ceil(bounds.maxY));
  if (outerX1 <= outerX0 || outerY1 <= outerY0) return "#ffffff";

  const { data } = ctx.getImageData(outerX0, outerY0, outerX1 - outerX0, outerY1 - outerY0);
  const width = outerX1 - outerX0;
  let r = 0,
    g = 0,
    b = 0,
    count = 0;
  for (let y = outerY0; y < outerY1; y++) {
    for (let x = outerX0; x < outerX1; x++) {
      // Skip the inner (panel) area itself — only the surrounding ring counts.
      if (x >= innerX0 && x < innerX1 && y >= innerY0 && y < innerY1) continue;
      const idx = ((y - outerY0) * width + (x - outerX0)) * 4;
      r += data[idx];
      g += data[idx + 1];
      b += data[idx + 2];
      count++;
    }
  }
  if (count === 0) return "#ffffff";
  return `#${toHex(r / count)}${toHex(g / count)}${toHex(b / count)}`;
}
