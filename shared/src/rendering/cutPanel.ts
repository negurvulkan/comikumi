import type { Point, ResolvedPanel } from "../layoutSchema.js";
import { polygonBounds } from "../layoutSchema.js";

/** How far a Cut-Panel has moved since it was cut (0,0 = never moved) — the resolved
 * panel's `origin` minus its frozen `cut.cutOrigin`. Combined with the resolved `points`,
 * this is all that's needed to derive which region of the original source image is shown
 * here: a whole-panel rigid translate shifts `points` and `origin` together (this delta
 * changes, but `points` minus delta — the source region — stays exactly the same, since
 * both moved by the same amount), while a vertex-only reshape changes `points` without
 * touching `origin` (this delta stays the same, so the derived source region's shape
 * changes to match the reshape one-to-one). Callers pass an already-*resolved* panel (see
 * resolvePanelForLanguage() in layoutSchema.ts) — a whole-panel translate/reshape can
 * differ per language, but the delta math itself is language-agnostic once resolved. */
export function cutPanelDelta(panel: ResolvedPanel): Point {
  if (!panel.cut) return { x: 0, y: 0 };
  return { x: panel.origin.x - panel.cut.cutOrigin.x, y: panel.origin.y - panel.cut.cutOrigin.y };
}

/** The region of the original source image a Cut-Panel's content is drawn from — the
 * resolved panel's current `points`, shifted back by `cutPanelDelta`. Only meaningful when
 * `panel.cut` is set. */
export function cutPanelSourcePolygon(panel: ResolvedPanel): Point[] {
  const d = cutPanelDelta(panel);
  return panel.points.map((p) => ({ x: p.x - d.x, y: p.y - d.y }));
}

function tracePolygonPath(ctx: CanvasRenderingContext2D, points: Point[]): void {
  ctx.beginPath();
  points.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
  ctx.closePath();
}

/**
 * Fills a Cut-Panel's VACATED spot (its source region — see cutPanelSourcePolygon) with
 * the stored hole-fill color. Split out from the content draw below so a caller handling
 * MULTIPLE Cut-Panels can run this for every panel first, before drawing any of their
 * foreground content (see drawCutPanelForeground's doc comment for why that ordering
 * matters). A no-op for a plain (non-cut) panel.
 */
export function fillCutPanelHole(ctx: CanvasRenderingContext2D, panel: ResolvedPanel, scale: number): void {
  if (!panel.cut) return;
  const sourcePolygon = cutPanelSourcePolygon(panel).map((p) => ({ x: p.x * scale, y: p.y * scale }));
  ctx.save();
  tracePolygonPath(ctx, sourcePolygon);
  ctx.fillStyle = panel.cut.holeFill.color;
  ctx.fill();
  ctx.restore();
}

/**
 * Draws a Cut-Panel's detached content (original cut-out or replacement image) at its
 * current position — the whole source image shifted by `cutPanelDelta`, clipped to the
 * panel's current outline, landing exactly the originally-cut pixels at the panel's
 * current (possibly moved/reshaped) position. Does NOT fill the vacated spot — see
 * fillCutPanelHole above, which callers must run for every Cut-Panel FIRST, before this
 * for any of them: when two panels swap positions, panel A's vacated spot lands exactly
 * where panel B's content now sits (and vice versa), so interleaving fill-then-draw
 * per panel (the two functions' one combined predecessor, drawCutPanelContent, did
 * exactly that) would have a later panel's hole-fill silently erase an earlier panel's
 * already-drawn content sitting in that same spot. Two full passes across all panels —
 * every hole filled, only then every foreground drawn — makes the result order-independent.
 * All coordinates are expected in the SAME space as `baseImage`'s natural pixel dimensions
 * (`imageWidth`/`imageHeight`) — callers scale by their own display `scale` factor as
 * needed (see CutPanelContentShape.tsx / renderPageToPng.ts / pageRaster.ts, which apply
 * it before calling this).
 *
 * Takes an already-*resolved* panel (see resolvePanelForLanguage() in layoutSchema.ts) —
 * callers resolve for whichever language is being rendered/exported before calling this,
 * so the same panel can be a plain untouched marker in one language and a moved/removed/
 * replaced Cut-Panel in another.
 *
 * `replacementImage`, if given (already loaded by the caller — see
 * cutPanelReplacementFileForLanguage in layoutSchema.ts), takes over entirely: instead of
 * redrawing the original cut-out, it stretches the replacement image to the panel's
 * current bounding box and clips it to the panel's actual (possibly non-quad) shape, then
 * strokes the optional border on top. `panel.cut.removed` always wins over a replacement
 * image if both are somehow set (defense against an inconsistent saved state, even though
 * the inspector UI presents them as one mutually-exclusive choice) — draws nothing at all
 * in that case (the hole-fill from the paired fillCutPanelHole() call is the entire
 * visual result, so the panel simply disappears from the page instead of reappearing at
 * its current position).
 */
export function drawCutPanelForeground(
  ctx: CanvasRenderingContext2D,
  panel: ResolvedPanel,
  baseImage: CanvasImageSource,
  imageWidth: number,
  imageHeight: number,
  scale: number,
  replacementImage?: CanvasImageSource
): void {
  if (!panel.cut || panel.cut.removed) return;
  const d = cutPanelDelta(panel);
  const scaledPoints = panel.points.map((p) => ({ x: p.x * scale, y: p.y * scale }));

  // Mirrors around the panel's own bounding-box center, applied after clipping so the
  // outline itself stays put — only the pixels drawn inside it flip left-right.
  const bounds = polygonBounds(panel.points);
  const mirrorCenterX = ((bounds.minX + bounds.maxX) / 2) * scale;
  function applyFlipIfNeeded(): void {
    if (!panel.cut!.flipHorizontal) return;
    ctx.translate(mirrorCenterX, 0);
    ctx.scale(-1, 1);
    ctx.translate(-mirrorCenterX, 0);
  }

  if (panel.cut.replacement && replacementImage) {
    ctx.save();
    tracePolygonPath(ctx, scaledPoints);
    ctx.clip();
    applyFlipIfNeeded();
    ctx.drawImage(
      replacementImage,
      bounds.minX * scale,
      bounds.minY * scale,
      (bounds.maxX - bounds.minX) * scale,
      (bounds.maxY - bounds.minY) * scale
    );
    ctx.restore();
    if (panel.cut.replacement.border) {
      ctx.save();
      tracePolygonPath(ctx, scaledPoints);
      ctx.lineWidth = panel.cut.replacement.border.widthPx * scale;
      ctx.strokeStyle = panel.cut.replacement.border.color;
      ctx.stroke();
      ctx.restore();
    }
    return;
  }

  ctx.save();
  tracePolygonPath(ctx, scaledPoints);
  ctx.clip();
  applyFlipIfNeeded();
  ctx.drawImage(baseImage, d.x * scale, d.y * scale, imageWidth * scale, imageHeight * scale);
  ctx.restore();
}

/**
 * Convenience wrapper for the single-panel case (fill then draw, same as this file's two
 * split functions run back to back) — used by call sites that only ever render ONE
 * Cut-Panel at a time (e.g. this file's own unit tests). A caller rendering a whole
 * page's worth of Cut-Panels should NOT use this — see drawCutPanelForeground's doc
 * comment for why a multi-panel caller needs two full passes (fillCutPanelHole for every
 * panel, only then drawCutPanelForeground for every panel) instead of interleaving fill
 * and draw per panel the way this wrapper does.
 */
export function drawCutPanelContent(
  ctx: CanvasRenderingContext2D,
  panel: ResolvedPanel,
  baseImage: CanvasImageSource,
  imageWidth: number,
  imageHeight: number,
  scale: number,
  replacementImage?: CanvasImageSource
): void {
  fillCutPanelHole(ctx, panel, scale);
  drawCutPanelForeground(ctx, panel, baseImage, imageWidth, imageHeight, scale, replacementImage);
}
