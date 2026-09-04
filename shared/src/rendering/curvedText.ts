import type { Point, TextAlign } from "../layoutSchema.js";
import { MIN_FONT_SIZE } from "./textLayout.js";
import { applyTextFillStyle, drawStyledText, type TextFillStyle } from "./textEffects.js";
import { drawShadowUnderlayPasses } from "./shadowPasses.js";

/**
 * Freestanding "text on a Bézier path" — the geometry/drawing core shared by
 * the live Konva preview (CurvedTextElementShape.tsx), the PNG export
 * (renderPageToPng.ts), and the server-side vector-PDF/PSD exporters
 * (pageRaster.ts), same pattern as bubbleBackground.ts/verticalTypesetting.ts.
 * Single-line only: text is laid out along the curve's arc length, not
 * wrapped — a whole paragraph following a curve is a different, much harder
 * problem this tool doesn't attempt.
 */

function sampleBezier(points: Point[], t: number): Point {
  const [p0, p1, p2, p3] = points;
  const mt = 1 - t;
  const a = mt * mt * mt;
  const b = 3 * mt * mt * t;
  const c = 3 * mt * t * t;
  const d = t * t * t;
  return {
    x: a * p0.x + b * p1.x + c * p2.x + d * p3.x,
    y: a * p0.y + b * p1.y + c * p2.y + d * p3.y,
  };
}

function bezierTangentAngle(points: Point[], t: number): number {
  const [p0, p1, p2, p3] = points;
  const mt = 1 - t;
  const dx = 3 * mt * mt * (p1.x - p0.x) + 6 * mt * t * (p2.x - p1.x) + 3 * t * t * (p3.x - p2.x);
  const dy = 3 * mt * mt * (p1.y - p0.y) + 6 * mt * t * (p2.y - p1.y) + 3 * t * t * (p3.y - p2.y);
  return Math.atan2(dy, dx);
}

export interface ArcLengthEntry {
  t: number;
  dist: number;
}

/**
 * t is not linear with arc length on a Bézier curve, so we sample the curve
 * densely once and build a cumulative-distance table — every other lookup
 * (point-at-distance, total length) works off this table instead of
 * re-integrating the curve each time.
 */
export function buildArcLengthTable(points: Point[], steps = 200): ArcLengthEntry[] {
  const table: ArcLengthEntry[] = [{ t: 0, dist: 0 }];
  let prev = sampleBezier(points, 0);
  let acc = 0;
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const p = sampleBezier(points, t);
    acc += Math.hypot(p.x - prev.x, p.y - prev.y);
    table.push({ t, dist: acc });
    prev = p;
  }
  return table;
}

export function totalArcLength(table: ArcLengthEntry[]): number {
  return table[table.length - 1]?.dist ?? 0;
}

/** Samples the curve at `steps+1` evenly-t points — good enough for a lightweight preview line (not used for text placement, which needs the arc-length table). */
export function sampleCurvePolyline(points: Point[], steps = 48): Point[] {
  const out: Point[] = [];
  for (let i = 0; i <= steps; i++) out.push(sampleBezier(points, i / steps));
  return out;
}

/** Point + tangent angle (radians, canvas/atan2 convention) at a given distance along the
 * curve (clamped to the curve's ends), via linear interpolation between table entries.
 * Exported alongside drawCurvedText — the server-side vector-PDF exporter needs the same
 * per-character point+angle to place real (rotated) PDF text objects, not just to drive
 * `ctx.fillText` calls. */
export function pointAtArcLength(points: Point[], table: ArcLengthEntry[], dist: number): { point: Point; angle: number } {
  const total = totalArcLength(table);
  const clamped = Math.max(0, Math.min(total, dist));
  let lo = 0;
  let hi = table.length - 1;
  while (lo < hi - 1) {
    const mid = (lo + hi) >> 1;
    if (table[mid].dist < clamped) lo = mid;
    else hi = mid;
  }
  const a = table[lo];
  const b = table[hi];
  const segLen = b.dist - a.dist;
  const localT = segLen > 0 ? (clamped - a.dist) / segLen : 0;
  const t = a.t + (b.t - a.t) * localT;
  return { point: sampleBezier(points, t), angle: bezierTangentAngle(points, t) };
}

export interface CurvedFitResult {
  fontSize: number;
  table: ArcLengthEntry[];
  totalTextWidth: number;
}

// Leaves a little breathing room at the curve's ends instead of letting text
// touch the very tip of P0/P3.
const CURVE_PADDING_RATIO = 0.92;

/** Shrinks fontSize (down to MIN_FONT_SIZE) until the flattened (newlines -> spaces) text's rendered width fits the curve's usable arc length. */
export function fitCurvedText(
  ctx: CanvasRenderingContext2D,
  text: string,
  fontFamily: string,
  points: Point[],
  baseFontSize: number
): CurvedFitResult {
  const flat = text.replace(/\n/g, " ");
  const table = buildArcLengthTable(points);
  const available = totalArcLength(table) * CURVE_PADDING_RATIO;
  let size = baseFontSize;
  let totalTextWidth = 0;
  while (size >= MIN_FONT_SIZE) {
    ctx.font = `${size}px "${fontFamily}"`;
    totalTextWidth = ctx.measureText(flat).width;
    if (totalTextWidth <= available || size === MIN_FONT_SIZE) break;
    size -= 1;
  }
  return { fontSize: size, table, totalTextWidth };
}

/** Draws each character along the curve, rotated to match the local tangent — call after fitCurvedText. */
export function drawCurvedText(
  ctx: CanvasRenderingContext2D,
  text: string,
  points: Point[],
  fitted: CurvedFitResult,
  fontFamily: string,
  align: TextAlign,
  style: TextFillStyle,
  scale: number
) {
  const flat = text.replace(/\n/g, " ");
  if (!flat.trim()) return;
  ctx.font = `${fitted.fontSize}px "${fontFamily}"`;
  ctx.textBaseline = "middle";
  ctx.textAlign = "center";

  const total = totalArcLength(fitted.table);
  const startDist =
    align === "left" ? 0 : align === "right" ? total - fitted.totalTextWidth : (total - fitted.totalTextWidth) / 2;

  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  const boxW = Math.max(1, Math.max(...xs) - minX);
  const boxH = Math.max(1, Math.max(...ys) - minY);
  applyTextFillStyle(ctx, style, minX, minY, boxW, boxH, scale);

  // Glow/drop-shadow underlay (see shadowPasses.ts) redraws every character once per
  // enabled effect before the real crisp pass — each character casts its own shadow, so
  // tightly-spaced characters may show overlapping shadow seams; accepted as a known v1
  // limitation (see plan notes), not fixed here.
  const drawAllChars = () => {
    let dist = startDist;
    for (const ch of [...flat]) {
      const chWidth = ctx.measureText(ch).width;
      const { point, angle } = pointAtArcLength(points, fitted.table, dist + chWidth / 2);
      ctx.save();
      ctx.translate(point.x, point.y);
      ctx.rotate(angle);
      drawStyledText(ctx, ch, 0, 0, style);
      ctx.restore();
      dist += chWidth;
    }
  };
  drawShadowUnderlayPasses(ctx, style.glow, style.dropShadow, drawAllChars);
  drawAllChars();
}
