import type { BubbleForm, BubbleShapeKind, Point } from "../layoutSchema.js";
import { resolveEffectiveTailStyle } from "../layoutSchema.js";
import { tracePolygonPath } from "./cutPanel.js";
import { drawShadowUnderlayPasses, resetShadowState } from "./shadowPasses.js";

/**
 * Shared bubble-background geometry: builds a closed boundary point list for
 * each visual style, then a shared path/tail routine draws it — used by both
 * the live Konva preview (BubbleShape.tsx, via a raw sceneFunc), the PNG
 * export (renderPageToPng.ts, canvas 2D), and the server-side vector-PDF/PSD
 * exporters (pageRaster.ts) so they can never visually diverge. Everything
 * here operates in LOCAL box coordinates (0,0 = top-left of the w x h box the
 * caller already translated/rotated into) and an explicit `scale` (1 for
 * export's real image px, the display zoom factor for the editor preview) —
 * the same pattern used by textLayout.ts's font sizing.
 */

function ellipsePoints(w: number, h: number, steps: number): Point[] {
  const cx = w / 2;
  const cy = h / 2;
  const rx = w / 2;
  const ry = h / 2;
  const points: Point[] = [];
  for (let i = 0; i < steps; i++) {
    const t = (i / steps) * Math.PI * 2;
    points.push({ x: cx + rx * Math.cos(t), y: cy + ry * Math.sin(t) });
  }
  return points;
}

function roundedRectPoints(w: number, h: number, radius: number, arcSteps: number): Point[] {
  const r = Math.max(0, Math.min(radius, w / 2, h / 2));
  const corners = [
    { cx: w - r, cy: r, start: -Math.PI / 2, end: 0 }, // top-right
    { cx: w - r, cy: h - r, start: 0, end: Math.PI / 2 }, // bottom-right
    { cx: r, cy: h - r, start: Math.PI / 2, end: Math.PI }, // bottom-left
    { cx: r, cy: r, start: Math.PI, end: 1.5 * Math.PI }, // top-left
  ];
  const points: Point[] = [];
  for (const c of corners) {
    for (let i = 0; i <= arcSteps; i++) {
      const t = c.start + (c.end - c.start) * (i / arcSteps);
      points.push({ x: c.cx + r * Math.cos(t), y: c.cy + r * Math.sin(t) });
    }
  }
  return points;
}

/** Smooth rounded-rect or ellipse boundary — used for "speech" bubbles. */
export function buildSmoothBoundary(shape: BubbleShapeKind, w: number, h: number): Point[] {
  if (shape === "oval") return ellipsePoints(w, h, 96);
  return roundedRectPoints(w, h, Math.min(w, h) * 0.18, 12);
}

/** Outward-bulging scalloped/cloud boundary — used for "thought" bubbles. */
export function buildCloudBoundary(w: number, h: number): Point[] {
  const cx = w / 2;
  const cy = h / 2;
  const rx = w / 2;
  const ry = h / 2;
  const bumps = Math.max(8, Math.min(22, Math.round((w + h) / 2 / 34)));
  const amplitude = 0.14;
  const steps = Math.max(96, bumps * 10);
  const points: Point[] = [];
  for (let i = 0; i < steps; i++) {
    const t = (i / steps) * Math.PI * 2;
    const factor = 1 + amplitude * Math.sin(bumps * t);
    points.push({ x: cx + rx * factor * Math.cos(t), y: cy + ry * factor * Math.sin(t) });
  }
  return points;
}

/** Jagged spiky burst boundary (alternating outer/inner radius) — used for "shout" bubbles. */
export function buildJaggedBoundary(w: number, h: number): Point[] {
  const cx = w / 2;
  const cy = h / 2;
  const rx = w / 2;
  const ry = h / 2;
  const spikes = Math.max(10, Math.min(26, Math.round((w + h) / 2 / 30)));
  const innerRatio = 0.62;
  const n = spikes * 2;
  const points: Point[] = [];
  for (let i = 0; i < n; i++) {
    const t = (i / n) * Math.PI * 2;
    const factor = i % 2 === 0 ? 1 : innerRatio;
    points.push({ x: cx + rx * factor * Math.cos(t), y: cy + ry * factor * Math.sin(t) });
  }
  return points;
}

/** Maps a normalized (0..1) SVG boundary onto the current w x h box — independent x/y scale, so non-uniform bubble resizing behaves the same as the procedural shapes. */
function scaleNormalizedBoundary(points: Point[], w: number, h: number): Point[] {
  return points.map((p) => ({ x: p.x * w, y: p.y * h }));
}

/**
 * Selects and builds the boundary point list for a given visual style — the
 * one place both the drawing code and the tail-handle UI derive the outline
 * from, so handles always line up with what's actually drawn. `svgBoundary`
 * (normalized 0..1 points from svgBubbleGeometry.ts) is only used for
 * bubbleStyle "svg" — pass whatever getCachedSvgBubbleBoundary() currently
 * returns, which is null until that file's async load has resolved (the
 * bubble simply stays invisible for that one frame).
 */
export function buildBoundaryForStyle(
  bubbleStyle: BubbleForm["bubbleStyle"],
  shape: BubbleShapeKind,
  w: number,
  h: number,
  svgBoundary?: Point[] | null
): Point[] {
  if (bubbleStyle === "speech") return buildSmoothBoundary(shape, w, h);
  if (bubbleStyle === "thought") return buildCloudBoundary(w, h);
  if (bubbleStyle === "shout") return buildJaggedBoundary(w, h);
  if (bubbleStyle === "svg") return svgBoundary ? scaleNormalizedBoundary(svgBoundary, w, h) : [];
  return [];
}

function nearestBoundaryIndex(points: Point[], target: Point): number {
  let nearestIdx = 0;
  let bestDist = Infinity;
  for (let i = 0; i < points.length; i++) {
    const dx = points[i].x - target.x;
    const dy = points[i].y - target.y;
    const d = dx * dx + dy * dy;
    if (d < bestDist) {
      bestDist = d;
      nearestIdx = i;
    }
  }
  return nearestIdx;
}

/** Unit vector perpendicular to the from->to line. Both tail edges must bow using the SAME perpendicular direction (derived once from the tail's main anchor->tip axis) rather than each computing its own from its own local line — otherwise the two edges point in different "outward" directions and bow apart from each other instead of together (see offsetMidpoint). */
function perpendicularUnit(from: Point, to: Point): Point {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const len = Math.hypot(dx, dy) || 1;
  return { x: -dy / len, y: dx / len };
}

/** Point offset perpendicular to the from->to line, at its midpoint, by `amount` (signed — sign flips which side it bows to). Used for the single-edge case (chain tail, curve-handle position) where there's only one line and no risk of divergent perpendiculars. */
export function perpendicularOffset(from: Point, to: Point, amount: number): Point {
  const dir = perpendicularUnit(from, to);
  return { x: (from.x + to.x) / 2 + dir.x * amount, y: (from.y + to.y) / 2 + dir.y * amount };
}

/** Midpoint of a/b, offset by `amount` along an explicitly-given perpendicular `dir` (not derived from a/b themselves) — this is what keeps both tail edges bowing to the same side, see perpendicularUnit's doc comment. */
function offsetMidpoint(a: Point, b: Point, dir: Point, amount: number): Point {
  return { x: (a.x + b.x) / 2 + dir.x * amount, y: (a.y + b.y) / 2 + dir.y * amount };
}

function quadBezierPoint(p0: Point, control: Point, p1: Point, t: number): Point {
  const mt = 1 - t;
  return {
    x: mt * mt * p0.x + 2 * mt * t * control.x + t * t * p1.x,
    y: mt * mt * p0.y + 2 * mt * t * control.y + t * t * p1.y,
  };
}

/** Samples a quadratic bezier at `steps` evenly-spaced t values from just-past-0 to 1 — deliberately excludes p0 (the caller already has it as the previous point in its point list) but includes p1. */
function sampleQuadCurve(p0: Point, control: Point, p1: Point, steps: number): Point[] {
  const points: Point[] = [];
  for (let i = 1; i <= steps; i++) points.push(quadBezierPoint(p0, control, p1, i / steps));
  return points;
}

const TAIL_CURVE_STEPS = 12;

/** Walks the boundary from `startIdx` in `direction` (+1/-1) until the cumulative edge length reaches `targetDist`, returning the index reached. */
function indexAtDistance(points: Point[], startIdx: number, targetDist: number, direction: 1 | -1): number {
  const n = points.length;
  let idx = startIdx;
  let dist = 0;
  for (let steps = 0; steps < n; steps++) {
    const nextIdx = (idx + direction + n) % n;
    dist += Math.hypot(points[nextIdx].x - points[idx].x, points[nextIdx].y - points[idx].y);
    idx = nextIdx;
    if (dist >= targetDist) return idx;
  }
  return idx;
}

/** The two boundary points where a tail's base sits, `tailWidth` (px, same units as `points`) apart around `anchor` (the point on the bubble where the tail attaches — the tail tip itself when no explicit anchor is set, see resolveTailAnchor) — used both to draw the tail and to position its width-adjustment handles so they always match. */
export function tailBasePoints(points: Point[], anchor: Point, tailWidth: number): { left: Point; right: Point; nearestPoint: Point } {
  const n = points.length;
  const nearestIdx = nearestBoundaryIndex(points, anchor);
  const halfWidth = Math.max(1, tailWidth) / 2;
  const startIdx = n >= 3 ? indexAtDistance(points, nearestIdx, halfWidth, 1) : nearestIdx;
  const endIdx = n >= 3 ? indexAtDistance(points, nearestIdx, halfWidth, -1) : nearestIdx;
  return { left: points[startIdx], right: points[endIdx], nearestPoint: points[nearestIdx] };
}

/**
 * Splices a tail tip into a closed boundary point list, dropping the points
 * between the two `tailBasePoints` (a `tailWidth`-wide gap around the
 * boundary point nearest `anchor`) so the tail reads as a continuous part of
 * the outline instead of a separate shape stitched on top (which would leave
 * a visible seam where the two shapes overlap). The gap is cut around
 * `anchor`, but the actual point appended to close the shape is `tip` —
 * these differ once the user has dragged the anchor handle away from the
 * tip's nearest-boundary-point default.
 *
 * `curve` (default 0, straight — unchanged behavior) bows both tail edges by
 * sampling quadratic beziers instead of appending `tip` as a single point;
 * the result stays a flat Point[] either way, so fillAndStrokePath() below
 * needs no special-casing — same trick already used for the ellipse/cloud/
 * jagged boundaries (a "curve" is just a lot of straight little lines).
 */
export function insertTail(points: Point[], anchor: Point, tailWidth: number, tip: Point, curve = 0): Point[] {
  const n = points.length;
  if (n < 3) return points;
  const nearestIdx = nearestBoundaryIndex(points, anchor);
  const halfWidth = Math.max(1, tailWidth) / 2;
  const startIdx = indexAtDistance(points, nearestIdx, halfWidth, 1);
  const endIdx = indexAtDistance(points, nearestIdx, halfWidth, -1);
  const result: Point[] = [];
  for (let i = startIdx; ; i = (i + 1) % n) {
    result.push(points[i]);
    if (i === endIdx) break;
  }
  const left = result[0];
  const right = result[result.length - 1];
  if (curve) {
    // One shared direction for both edges (derived from the tail's main
    // nearestPoint->tip axis) — using each edge's own local direction here
    // instead would make the two edges bow apart from each other rather than
    // together (see perpendicularUnit's doc comment).
    const dir = perpendicularUnit(points[nearestIdx], tip);
    const controlRightToTip = offsetMidpoint(right, tip, dir, curve);
    const controlTipToLeft = offsetMidpoint(tip, left, dir, curve);
    result.push(...sampleQuadCurve(right, controlRightToTip, tip, TAIL_CURVE_STEPS));
    // Drops the curve's own final sample (== left) — left is already result[0], and closePath() draws the last short segment back to it.
    result.push(...sampleQuadCurve(tip, controlTipToLeft, left, TAIL_CURVE_STEPS).slice(0, -1));
  } else {
    result.push(tip);
  }
  return result;
}

/**
 * A large quad covering exactly one half-plane of the line through a-b (both already
 * scaled to match the boundary points this clips) — extended far past the w x h box in
 * every direction so the clip never visibly "runs out" regardless of the bubble's actual
 * size. By default keeps the half containing the box's own center (w/2, h/2); `flip`
 * keeps the other half instead. Degenerates to "no effective clip" (the whole box) when
 * a and b coincide, since the line direction is then undefined.
 */
function clipHalfPlanePolygon(w: number, h: number, a: Point, b: Point, flip: boolean): Point[] {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy);
  if (len < 1e-6) return [{ x: 0, y: 0 }, { x: w, y: 0 }, { x: w, y: h }, { x: 0, y: h }];
  const dirX = dx / len;
  const dirY = dy / len;
  let nx = -dirY;
  let ny = dirX;
  const cx = w / 2;
  const cy = h / 2;
  const side = (cx - a.x) * nx + (cy - a.y) * ny;
  const sign = (side >= 0 ? 1 : -1) * (flip ? -1 : 1);
  nx *= sign;
  ny *= sign;
  const reach = (w + h) * 4 + 1000;
  const farA = { x: a.x - dirX * reach, y: a.y - dirY * reach };
  const farB = { x: b.x + dirX * reach, y: b.y + dirY * reach };
  return [
    farA,
    farB,
    { x: farB.x + nx * reach, y: farB.y + ny * reach },
    { x: farA.x + nx * reach, y: farA.y + ny * reach },
  ];
}

/**
 * Sets ctx.fillStyle to the bubble's solid fillColor, or a gradient spanning the whole
 * form (`formW`/`formH`) when backgroundGradientFill is enabled — same "span the whole
 * block, not each subpath" idea as textEffects.ts's applyTextFillStyle, so the main body
 * and any tail drawn afterward sample the same continuous gradient instead of each
 * getting their own independently-scaled one. Exported so bubbleBackground.test.ts can
 * assert on it directly.
 */
export function applyBubbleFillStyle(ctx: CanvasRenderingContext2D, form: BubbleForm, formW: number, formH: number) {
  if (form.backgroundGradientFill.enabled) {
    const g = form.backgroundGradientFill;
    const rad = (g.angleDeg * Math.PI) / 180;
    const dx = Math.cos(rad);
    const dy = Math.sin(rad);
    const halfDiag = Math.max(1, Math.hypot(formW, formH) / 2);
    const cx = formW / 2;
    const cy = formH / 2;
    const gradient = ctx.createLinearGradient(cx - dx * halfDiag, cy - dy * halfDiag, cx + dx * halfDiag, cy + dy * halfDiag);
    gradient.addColorStop(0, g.colorStart);
    gradient.addColorStop(1, g.colorEnd);
    ctx.fillStyle = gradient;
  } else {
    ctx.fillStyle = form.fillColor;
  }
}

/** Sets ctx.setLineDash()/lineDashOffset from the form's dash pattern (scaled), a no-op
 * when the pattern is empty (plain solid line, ctx's own default dash state). Must be
 * paired with resetStrokeDash() after the stroke() call at any site with no enclosing
 * ctx.save()/restore() of its own — dash state persists on the context otherwise, and
 * would otherwise leak into whatever draws next (e.g. drawBubbleBevel's own hairline
 * strokes, which must stay solid regardless of the border's own dash style). */
export function applyStrokeDash(ctx: CanvasRenderingContext2D, form: BubbleForm, scale: number) {
  if (form.strokeDashPattern.length > 0) {
    ctx.setLineDash(form.strokeDashPattern.map((d) => d * scale));
    ctx.lineDashOffset = form.strokeDashOffsetPx * scale;
  }
}

export function resetStrokeDash(ctx: CanvasRenderingContext2D) {
  ctx.setLineDash([]);
  ctx.lineDashOffset = 0;
}

function fillAndStrokePath(ctx: CanvasRenderingContext2D, points: Point[], form: BubbleForm, scale: number, formW: number, formH: number) {
  if (points.length < 3) return;
  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);
  for (let i = 1; i < points.length; i++) ctx.lineTo(points[i].x, points[i].y);
  ctx.closePath();
  applyBubbleFillStyle(ctx, form, formW, formH);
  ctx.fill();
  ctx.lineWidth = Math.max(1, form.strokeWidthPx * scale);
  ctx.strokeStyle = form.strokeColor;
  applyStrokeDash(ctx, form, scale);
  ctx.stroke();
  resetStrokeDash(ctx);
}

/** Bubble styles that can carry a tail at all — "none" never draws a background, so a tail on it would be pointless. Exported for BubbleShape.tsx, which needs the same check to decide whether to show the tail-anchor handle. */
export function canHaveTail(bubbleStyle: BubbleForm["bubbleStyle"]): boolean {
  return bubbleStyle === "speech" || bubbleStyle === "shout" || bubbleStyle === "thought" || bubbleStyle === "svg";
}

/** Separate, unspliced tail: a triangle (base-left -> tip -> base-right) with its own fill+stroke, drawn on top of the already-closed body outline — the body's own stroke line stays visible where the triangle overlaps it, unlike insertTail's seamless splice. Bows both edges via native quadraticCurveTo when tailCurve is set (no point-sampling needed — this is already its own explicit path, unlike insertTail's flat boundary list). */
function drawDetachedTail(ctx: CanvasRenderingContext2D, boundaryPoints: Point[], anchor: Point, tip: Point, form: BubbleForm, scale: number, formW: number, formH: number) {
  if (boundaryPoints.length < 3) return;
  const { left, right, nearestPoint } = tailBasePoints(boundaryPoints, anchor, form.tailWidth * scale);
  const curve = form.tailCurve * scale;
  ctx.beginPath();
  ctx.moveTo(left.x, left.y);
  if (curve) {
    // Same shared-direction fix as insertTail — both edges bow along one
    // perpendicular derived from the tail's main axis, not their own local line.
    const dir = perpendicularUnit(nearestPoint, tip);
    const c1 = offsetMidpoint(left, tip, dir, curve);
    ctx.quadraticCurveTo(c1.x, c1.y, tip.x, tip.y);
    const c2 = offsetMidpoint(tip, right, dir, curve);
    ctx.quadraticCurveTo(c2.x, c2.y, right.x, right.y);
  } else {
    ctx.lineTo(tip.x, tip.y);
    ctx.lineTo(right.x, right.y);
  }
  ctx.closePath();
  applyBubbleFillStyle(ctx, form, formW, formH);
  ctx.fill();
  ctx.lineWidth = Math.max(1, form.strokeWidthPx * scale);
  ctx.strokeStyle = form.strokeColor;
  applyStrokeDash(ctx, form, scale);
  ctx.stroke();
  resetStrokeDash(ctx);
}

/** Draws one chain segment centered at (x, y), rotated to face `angle` (the direction
 * from bubble edge to tail tip) — rotation only matters for non-circular shapes, a
 * circle looks the same either way. `fillStyle` is resolved once by the caller (see
 * drawChainTail) rather than re-derived here: a CanvasGradient bakes in the coordinate
 * space active when it was CREATED (per the Canvas2D spec), so creating it fresh inside
 * this function's own ctx.translate(x, y) would incorrectly anchor the gradient to each
 * segment's local origin instead of the whole form — reusing one resolved value keeps
 * every segment sampling the same continuous form-space gradient. */
function drawChainSegment(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, angle: number, shape: BubbleForm["tailChainSegmentShape"], form: BubbleForm, scale: number, fillStyle: CanvasRenderingContext2D["fillStyle"]) {
  ctx.save();
  ctx.translate(x, y);
  if (shape !== "circle") ctx.rotate(angle);
  ctx.beginPath();
  if (shape === "circle") {
    ctx.ellipse(0, 0, size, size, 0, 0, Math.PI * 2);
  } else if (shape === "rect") {
    ctx.rect(-size, -size * 0.6, size * 2, size * 1.2);
  } else {
    // diamond
    ctx.moveTo(0, -size);
    ctx.lineTo(size, 0);
    ctx.lineTo(0, size);
    ctx.lineTo(-size, 0);
    ctx.closePath();
  }
  ctx.fillStyle = fillStyle;
  ctx.fill();
  ctx.lineWidth = Math.max(1, form.strokeWidthPx * scale * 0.6);
  ctx.strokeStyle = form.strokeColor;
  // No explicit resetStrokeDash() needed here — the enclosing ctx.save()/restore() (see
  // top/bottom of this function) already covers line-dash state per the Canvas2D spec.
  applyStrokeDash(ctx, form, scale);
  ctx.stroke();
  ctx.restore();
}

/**
 * Draws a chain of shrinking segments from the bubble edge (nearest boundary
 * point to `anchor`) to the tail tip — generalizes the original thought-bubble
 * circle trail to any boundary shape and any of the fixed segment shapes.
 * `tailChainSpacing` scales the gap between segment centers around the
 * default evenly-spread-to-the-tip step (1/(count+1) of the edge-to-tip
 * distance) — 1 reproduces that original spacing exactly, <1 bunches segments
 * closer to the bubble edge, >1 spreads them past that (segments can
 * overshoot the tip for a large enough value, same as a real hand-drawn
 * thought trail sometimes running past its target point). When tailCurve is
 * set, segments follow a quadratic bezier from edge to tip instead of a
 * straight line, each rotated to the curve's tangent at its own position.
 */
function drawChainTail(ctx: CanvasRenderingContext2D, boundaryPoints: Point[], anchor: Point, tip: Point, form: BubbleForm, scale: number, formW: number, formH: number) {
  if (boundaryPoints.length === 0) return;
  const edge = boundaryPoints[nearestBoundaryIndex(boundaryPoints, anchor)];
  const straightAngle = Math.atan2(tip.y - edge.y, tip.x - edge.x);
  const curve = form.tailCurve * scale;
  const control = curve ? perpendicularOffset(edge, tip, curve) : null;
  const count = form.tailChainSegments;
  const shape = form.tailChainSegmentShape;
  const baseStep = 1 / (count + 1);
  // Resolved once, outside every segment's own ctx.translate() — see drawChainSegment's
  // doc comment for why a gradient must be created in form-space, not per-segment space.
  applyBubbleFillStyle(ctx, form, formW, formH);
  const fillStyle = ctx.fillStyle;
  for (let i = 0; i < count; i++) {
    const t = baseStep * (i + 1) * form.tailChainSpacing;
    let cx: number, cy: number, angle: number;
    if (control) {
      const pt = quadBezierPoint(edge, control, tip, t);
      cx = pt.x;
      cy = pt.y;
      const dx = 2 * (1 - t) * (control.x - edge.x) + 2 * t * (tip.x - control.x);
      const dy = 2 * (1 - t) * (control.y - edge.y) + 2 * t * (tip.y - control.y);
      angle = Math.atan2(dy, dx);
    } else {
      cx = edge.x + (tip.x - edge.x) * t;
      cy = edge.y + (tip.y - edge.y) * t;
      angle = straightAngle;
    }
    const size = Math.max(1.5 * scale, form.strokeWidthPx * scale * (count - i) * 0.9);
    drawChainSegment(ctx, cx, cy, size, angle, shape, form, scale, fillStyle);
  }
}

/** Converts a #rrggbb hex color + 0-1 opacity into an "rgba(r, g, b, a)" string — used by
 * drawBubbleBevel's highlight/shadow colors, which (unlike EffectGlow/EffectShadow) carry
 * their own independent opacity. Deliberately not the newer #rrggbbaa 8-digit hex syntax,
 * which — like ctx.filter — hasn't been runtime-verified against @napi-rs/canvas's Skia
 * binding; plain rgba() is long-established and lower-risk. */
function hexToRgba(hex: string, opacity: number): string {
  const clean = hex.replace("#", "");
  const r = parseInt(clean.substring(0, 2), 16) || 0;
  const g = parseInt(clean.substring(2, 4), 16) || 0;
  const b = parseInt(clean.substring(4, 6), 16) || 0;
  return `rgba(${r}, ${g}, ${b}, ${opacity})`;
}

/**
 * Draws a soft bevel/emboss band along the bubble's boundary — a highlight pass and a
 * shadow pass, each a thin hairline stroke of `points` whose CAST SHADOW (ctx.shadow*)
 * does the actual visual work, offset in opposite directions derived from `angleDeg`
 * (swapped when direction is "down" — that's what actually flips the raised/recessed
 * look, matching Photoshop's Up/Down toggle, not reusing the same offset for both).
 * Canvas2D can't cast a shadow from a fully transparent source — the shadow is a
 * blurred/tinted copy of the source's own alpha — so the hairline core itself stays
 * visible too; at default size/soften this reads as an acceptable crisp inner edge to
 * the bevel, not a stray outline (verify visually — see plan notes).
 *
 * Must be called AFTER fillAndStrokePath, not before: unlike glow/drop-shadow (which
 * extend outward past the bubble's own footprint, so drawing them first still works —
 * the crisp fill+stroke simply overpaints their interior half), an "inner" bevel is
 * defined to sit ON TOP of the fill. Drawn earlier, the opaque fill would hide it
 * entirely.
 */
export function drawBubbleBevel(ctx: CanvasRenderingContext2D, points: Point[], form: BubbleForm, w: number, h: number, scale: number) {
  const bevel = form.backgroundBevel;
  if (!bevel.enabled || points.length < 3) return;

  const rad = (bevel.angleDeg * Math.PI) / 180;
  const size = bevel.sizePx * scale;
  const highlightOffset = { x: Math.cos(rad) * size, y: Math.sin(rad) * size };
  const shadowOffset = { x: -highlightOffset.x, y: -highlightOffset.y };
  const [highlightVec, shadowVec] = bevel.direction === "down" ? [shadowOffset, highlightOffset] : [highlightOffset, shadowOffset];

  function strokeBoundary() {
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i++) ctx.lineTo(points[i].x, points[i].y);
    ctx.closePath();
    ctx.lineWidth = Math.max(1, 1.5 * scale);
    ctx.stroke();
  }

  function passes() {
    const highlightRgba = hexToRgba(bevel.highlightColor, bevel.highlightOpacity);
    ctx.strokeStyle = highlightRgba;
    ctx.shadowColor = highlightRgba;
    ctx.shadowBlur = bevel.softenPx * scale;
    ctx.shadowOffsetX = highlightVec.x;
    ctx.shadowOffsetY = highlightVec.y;
    strokeBoundary();

    const shadowRgba = hexToRgba(bevel.shadowColor, bevel.shadowOpacity);
    ctx.strokeStyle = shadowRgba;
    ctx.shadowColor = shadowRgba;
    ctx.shadowOffsetX = shadowVec.x;
    ctx.shadowOffsetY = shadowVec.y;
    strokeBoundary();

    resetShadowState(ctx);
  }

  if (bevel.style === "emboss") {
    passes();
  } else if (bevel.style === "inner") {
    ctx.save();
    tracePolygonPath(ctx, points);
    ctx.clip();
    passes();
    ctx.restore();
  } else {
    // "outer" — clip to OUTSIDE the shape via a two-subpath evenodd clip. Built by hand
    // (not via two tracePolygonPath calls, which each call ctx.beginPath() internally and
    // would erase the first subpath) — a large rect (same "(w+h)*4+1000, big enough in
    // local units" margin idiom clipHalfPlanePolygon uses above) as the outer subpath,
    // `points` as the inner subpath; evenodd is winding-order-independent, so no
    // direction bookkeeping is needed between the two subpaths.
    ctx.save();
    const margin = (w + h) * 2 + 1000;
    ctx.beginPath();
    ctx.rect(-margin, -margin, w + margin * 2, h + margin * 2);
    ctx.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i++) ctx.lineTo(points[i].x, points[i].y);
    ctx.closePath();
    ctx.clip("evenodd");
    passes();
    ctx.restore();
  }
}

/**
 * Draws the visible bubble background (fill + stroke) plus its tail, for one
 * resolved form. No-op for bubbleStyle "none". `svgBoundary` is forwarded to
 * buildBoundaryForStyle() unchanged — see its doc comment. `precomputedBoundary`, when
 * given, is used instead of building the boundary from `shape`/`bubbleStyle` — the merged-
 * bubble path (bubbleMerge.ts) computes the union of several bubbles' own boundaries and
 * feeds the result back in here so tail-splicing/clip-line/fill/stroke all still run
 * exactly the same as for a procedural boundary.
 */
export function drawBubbleBackground(
  ctx: CanvasRenderingContext2D,
  form: BubbleForm,
  shape: BubbleShapeKind,
  scale: number,
  svgBoundary?: Point[] | null,
  precomputedBoundary?: Point[]
) {
  if (form.bubbleStyle === "none") return;
  const w = form.width * scale;
  const h = form.height * scale;

  let points = precomputedBoundary ?? buildBoundaryForStyle(form.bubbleStyle, shape, w, h, svgBoundary);
  const hasTail = !!form.tail && canHaveTail(form.bubbleStyle);
  const effectiveTailStyle = resolveEffectiveTailStyle(form.bubbleStyle, form.tailStyle);
  const tip = form.tail ? { x: form.tail.x * scale, y: form.tail.y * scale } : null;
  // Where the tail attaches to the bubble outline — an explicit, independently
  // draggable point once the user has set one (form.tailAnchor), otherwise
  // the original automatic behavior of "wherever is nearest to the tip".
  const anchorSource = form.tailAnchor ?? form.tail;
  const anchor = anchorSource ? { x: anchorSource.x * scale, y: anchorSource.y * scale } : null;

  if (hasTail && tip && anchor && effectiveTailStyle === "point") {
    points = insertTail(points, anchor, form.tailWidth * scale, tip, form.tailCurve * scale);
  }

  // The clip line, like tail/tailAnchor, is stored in LOCAL unrotated form coordinates —
  // scaled the same way as everything else here, then applied as a plain half-plane
  // ctx.clip() around the rest of the draw (fill/stroke + detached/chain tail), same
  // ctx.save()/clip()/restore() primitive already used by cutPanel.ts for panel artwork.
  const hasClip = !!form.clipA && !!form.clipB;
  if (hasClip) {
    ctx.save();
    tracePolygonPath(
      ctx,
      clipHalfPlanePolygon(w, h, { x: form.clipA!.x * scale, y: form.clipA!.y * scale }, { x: form.clipB!.x * scale, y: form.clipB!.y * scale }, form.clipFlip)
    );
    ctx.clip();
  }

  // Glow/drop-shadow underlay, main body silhouette only — for the default (and most
  // common) tailStyle "point", the tail is already spliced into `points` above via
  // insertTail, so body+tail already form one seamless outline and get one correct
  // shadow for free. "point-detached"/"chain" tails (drawn separately below) don't cast
  // their own shadow/glow — a documented v1 scope limit, not a bug.
  if ((form.backgroundGlow.enabled || form.backgroundDropShadow.enabled) && points.length >= 3) {
    applyBubbleFillStyle(ctx, form, w, h);
    drawShadowUnderlayPasses(ctx, form.backgroundGlow, form.backgroundDropShadow, () => {
      ctx.beginPath();
      ctx.moveTo(points[0].x, points[0].y);
      for (let i = 1; i < points.length; i++) ctx.lineTo(points[i].x, points[i].y);
      ctx.closePath();
      ctx.fill();
    });
  }

  fillAndStrokePath(ctx, points, form, scale, w, h);
  drawBubbleBevel(ctx, points, form, w, h, scale);

  if (hasTail && tip && anchor && effectiveTailStyle === "point-detached") {
    drawDetachedTail(ctx, points, anchor, tip, form, scale, w, h);
  } else if (hasTail && tip && anchor && effectiveTailStyle === "chain") {
    drawChainTail(ctx, points, anchor, tip, form, scale, w, h);
  }

  if (hasClip) ctx.restore();
}
