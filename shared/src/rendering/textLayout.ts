import type { BubbleShapeKind, BubbleVisualStyle, Point } from "../layoutSchema.js";

export interface Line {
  text: string;
  width: number;
}

/**
 * Single source of truth for bubble padding, shared by the live Konva preview
 * (BubbleShape) and the PNG export (renderPageToPng) so both render identically.
 */
// "quad" bubbles never read this — their padding is handled inside
// perspective.ts — but the key is included so callers can index by any
// Bubble["shape"] without a type-narrowing cast.
export const PADDING_RATIO: Record<"rect" | "oval" | "quad", number> = { rect: 0.12, oval: 0.28, quad: 0 };
export const MIN_FONT_SIZE = 6;

// An arbitrary imported SVG contour has no single "safe" inset ratio the way
// a rect/oval does — a fixed, fairly generous default (confirmed acceptable
// over computing a tight inscribed rectangle, which would need real
// per-shape geometry analysis) keeps text comfortably inside most shapes.
export const SVG_BUBBLE_PADDING_RATIO = 0.3;

/** Text-box inset ratio for a bubble's resolved style/shape — SVG bubbles use a fixed ratio
 * (their shape isn't one of the parametric PADDING_RATIO keys), everything else keeps the
 * existing per-shape lookup. `override` (Bubble/BubbleForm.paddingRatio, resolved through
 * any linked preset) wins over both when set — lets a user dial in exactly how much
 * breathing room text has instead of only the fixed per-shape defaults. */
export function paddingRatioFor(bubbleStyle: BubbleVisualStyle, shape: BubbleShapeKind, override?: number | null): number {
  if (override != null) return override;
  if (bubbleStyle === "svg") return SVG_BUBBLE_PADDING_RATIO;
  return PADDING_RATIO[shape];
}

export interface FitResult {
  fontSize: number;
  lines: Line[];
  lineStep: number;
  blockHeight: number;
}

/**
 * Shrinks fontSize (down to MIN_FONT_SIZE) until the wrapped text fits within
 * boxWidth x boxHeight — the same algorithm used for the PNG export, so the
 * live editor preview can match it exactly.
 */
export function fitHorizontalText(
  ctx: CanvasRenderingContext2D,
  text: string,
  fontFamily: string,
  lineHeight: number,
  boxWidth: number,
  boxHeight: number,
  baseFontSize: number
): FitResult {
  let size = baseFontSize;
  let lines: Line[] = [];
  while (size >= MIN_FONT_SIZE) {
    ctx.font = `${size}px "${fontFamily}"`;
    lines = wrapHorizontal(ctx, text, boxWidth);
    const blockHeight = lines.length * size * lineHeight;
    if (blockHeight <= boxHeight || size === MIN_FONT_SIZE) break;
    size -= 1;
  }
  const lineStep = size * lineHeight;
  return { fontSize: size, lines, lineStep, blockHeight: lines.length * lineStep };
}

/** Greedy word-wrap for horizontal (ltr/rtl) text within maxWidth. */
export function wrapHorizontal(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): Line[] {
  const lines: Line[] = [];
  for (const paragraph of text.split("\n")) {
    const words = paragraph.split(/\s+/).filter(Boolean);
    if (words.length === 0) {
      lines.push({ text: "", width: 0 });
      continue;
    }
    let current = "";
    for (const word of words) {
      const candidate = current ? `${current} ${word}` : word;
      if (ctx.measureText(candidate).width > maxWidth && current) {
        lines.push({ text: current, width: ctx.measureText(current).width });
        current = word;
      } else {
        current = candidate;
      }
    }
    if (current) lines.push({ text: current, width: ctx.measureText(current).width });
  }
  return lines;
}

export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Single-edge Sutherland–Hodgman clip of a convex polygon against the half-plane
 * `{P : dot(P - linePoint, (nx,ny)) >= 0}` — used by clipBoxToLine below. Returns at most
 * 5 points for a 4-point input (one clip edge can add at most one new vertex). */
function clipPolygonToHalfPlane(poly: Point[], linePoint: Point, nx: number, ny: number): Point[] {
  const inside = (p: Point) => (p.x - linePoint.x) * nx + (p.y - linePoint.y) * ny >= 0;
  const intersect = (p1: Point, p2: Point): Point => {
    const d1 = (p1.x - linePoint.x) * nx + (p1.y - linePoint.y) * ny;
    const d2 = (p2.x - linePoint.x) * nx + (p2.y - linePoint.y) * ny;
    const t = d1 / (d1 - d2);
    return { x: p1.x + (p2.x - p1.x) * t, y: p1.y + (p2.y - p1.y) * t };
  };
  const out: Point[] = [];
  for (let i = 0; i < poly.length; i++) {
    const cur = poly[i];
    const prev = poly[(i + poly.length - 1) % poly.length];
    const curIn = inside(cur);
    const prevIn = inside(prev);
    if (curIn) {
      if (!prevIn) out.push(intersect(prev, cur));
      out.push(cur);
    } else if (prevIn) {
      out.push(intersect(prev, cur));
    }
  }
  return out;
}

/**
 * Shrinks an axis-aligned text box to fit within the half-plane defined by a bubble's
 * clip line (Bubble.clipA/clipB/clipFlip — see layoutSchema.ts) so text never overflows
 * into a clipped-away bubble region. `box`, `clipA`, `clipB` must already be in the same
 * LOCAL, unrotated, scaled coordinate space. Clips the box's 4 corners against the half-
 * plane (same convention as bubbleBackground.ts's clipHalfPlanePolygon: keeps the side
 * containing the box's own center unless `flip`), then returns the bounding box of what's
 * left — stays axis-aligned (the text engine only ever wraps into rectangles), a
 * deliberate approximation rather than true per-line-width fitting against the clip line.
 * A no-op when either clip point is missing.
 */
export function clipBoxToLine(box: Box, clipA: Point | null, clipB: Point | null, flip: boolean): Box {
  if (!clipA || !clipB) return box;
  const dx = clipB.x - clipA.x;
  const dy = clipB.y - clipA.y;
  const len = Math.hypot(dx, dy);
  if (len < 1e-6) return box;
  let nx = -dy / len;
  let ny = dx / len;
  const boxCenter = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  const side = (boxCenter.x - clipA.x) * nx + (boxCenter.y - clipA.y) * ny;
  const sign = (side >= 0 ? 1 : -1) * (flip ? -1 : 1);
  nx *= sign;
  ny *= sign;
  const corners: Point[] = [
    { x: box.x, y: box.y },
    { x: box.x + box.width, y: box.y },
    { x: box.x + box.width, y: box.y + box.height },
    { x: box.x, y: box.y + box.height },
  ];
  const kept = clipPolygonToHalfPlane(corners, clipA, nx, ny);
  if (kept.length === 0) return { x: box.x, y: box.y, width: 0, height: 0 };
  const xs = kept.map((p) => p.x);
  const ys = kept.map((p) => p.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

/**
 * The padded, clip-line-aware text box for a bubble — shared by the live Konva preview
 * (BubbleShape.tsx) and the PNG export (renderPageToPng.ts) so both compute identically.
 * `form`/`scale` follow the same convention as drawBubbleBackground() in
 * bubbleBackground.ts: `form`'s own fields stay unscaled, `scale` is applied internally
 * (1 for the export path, the display zoom factor for the editor preview).
 * `mergedBounds`, when given, is already in the SAME scaled space this function returns
 * and replaces the plain 0..width*scale/0..height*scale box the padding ratio normally
 * shrinks from — see the merge handling in both callers (renderPageToPng.ts /
 * BubbleShape.tsx), which pass the merged boundary's own bounding box here.
 */
export function textBoxFor(
  bubbleStyle: BubbleVisualStyle,
  shape: BubbleShapeKind,
  form: { width: number; height: number; clipA: Point | null; clipB: Point | null; clipFlip: boolean; paddingRatio: number | null },
  scale: number,
  mergedBounds?: Box
): Box {
  const ratio = paddingRatioFor(bubbleStyle, shape, form.paddingRatio);
  const bounds = mergedBounds ?? { x: 0, y: 0, width: form.width * scale, height: form.height * scale };
  const insetWidth = bounds.width * (1 - ratio);
  const insetHeight = bounds.height * (1 - ratio);
  const box = {
    x: bounds.x + (bounds.width - insetWidth) / 2,
    y: bounds.y + (bounds.height - insetHeight) / 2,
    width: insetWidth,
    height: insetHeight,
  };
  const clipA = form.clipA ? { x: form.clipA.x * scale, y: form.clipA.y * scale } : null;
  const clipB = form.clipB ? { x: form.clipB.x * scale, y: form.clipB.y * scale } : null;
  return clipBoxToLine(box, clipA, clipB, form.clipFlip);
}

// Vertical (tategaki) text wrapping/fitting/drawing lives in
// verticalTypesetting.ts — it needs tokenization (ruby, tate-chū-yoko, forced
// breaks) that a plain character array can't represent.
