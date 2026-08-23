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
 * Draws a Cut-Panel's content at its current position: fills the vacated original spot
 * with the stored hole-fill color, then draws the whole source image shifted by
 * `cutPanelDelta`, clipped to the panel's current outline — landing exactly the
 * originally-cut pixels at the panel's current (possibly moved/reshaped) position. Always
 * runs both steps unconditionally, even for a never-moved panel (the redraw then exactly
 * re-covers the fill with the same content it just painted over — harmless, and avoids a
 * "has it moved" special case). All coordinates are expected in the SAME space as
 * `baseImage`'s natural pixel dimensions (`imageWidth`/`imageHeight`) — callers scale by
 * their own display `scale` factor as needed (see CutPanelContentShape.tsx /
 * renderPageToPng.ts / pageRaster.ts, which apply it before calling this).
 *
 * Takes an already-*resolved* panel (see resolvePanelForLanguage() in layoutSchema.ts) —
 * callers resolve for whichever language is being rendered/exported before calling this,
 * so the same panel can be a plain untouched marker in one language and a moved/removed/
 * replaced Cut-Panel in another.
 *
 * `replacementImage`, if given (already loaded by the caller — see
 * cutPanelReplacementFileForLanguage in layoutSchema.ts), takes over step 2 entirely:
 * instead of redrawing the original cut-out, it stretches the replacement image to the
 * panel's current bounding box and clips it to the panel's actual (possibly non-quad)
 * shape, then strokes the optional border on top. `panel.cut.removed` always wins over a
 * replacement image if both are somehow set (defense against an inconsistent saved
 * state, even though the inspector UI presents them as one mutually-exclusive choice).
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
  if (!panel.cut) return;
  const d = cutPanelDelta(panel);
  const scaledPoints = panel.points.map((p) => ({ x: p.x * scale, y: p.y * scale }));
  const sourcePolygon = cutPanelSourcePolygon(panel).map((p) => ({ x: p.x * scale, y: p.y * scale }));

  ctx.save();
  tracePolygonPath(ctx, sourcePolygon);
  ctx.fillStyle = panel.cut.holeFill.color;
  ctx.fill();
  ctx.restore();

  // "Removed" (fully deleted, see Panel.cut.removed's doc comment): the hole-fill above
  // is the entire visual result — nothing gets redrawn anywhere, so the panel simply
  // disappears from the page instead of reappearing at its current position.
  if (panel.cut.removed) return;

  if (panel.cut.replacement && replacementImage) {
    const bounds = polygonBounds(panel.points);
    ctx.save();
    tracePolygonPath(ctx, scaledPoints);
    ctx.clip();
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
  ctx.drawImage(baseImage, d.x * scale, d.y * scale, imageWidth * scale, imageHeight * scale);
  ctx.restore();
}
