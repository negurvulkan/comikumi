import type { Panel, Point } from "../../../shared/src/layoutSchema";

/** How far a Cut-Panel has moved since it was cut (0,0 = never moved) — the panel's
 * current `origin` minus its frozen `cutOrigin`. Combined with the panel's *current*
 * `points`, this is all that's needed to derive which region of the original source
 * image is shown here: a whole-panel rigid translate shifts `points` and `origin`
 * together (this delta changes, but `points` minus delta — the source region — stays
 * exactly the same, since both moved by the same amount), while a vertex-only reshape
 * changes `points` without touching `origin` (this delta stays the same, so the derived
 * source region's shape changes to match the reshape one-to-one). */
export function cutPanelDelta(panel: Panel): Point {
  if (!panel.cut) return { x: 0, y: 0 };
  return { x: panel.origin.x - panel.cut.cutOrigin.x, y: panel.origin.y - panel.cut.cutOrigin.y };
}

/** The region of the original source image a Cut-Panel's content is drawn from — the
 * panel's current `points`, shifted back by `cutPanelDelta`. Only meaningful when
 * `panel.cut` is set. */
export function cutPanelSourcePolygon(panel: Panel): Point[] {
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
 * renderPageToPng.ts, which apply it before calling this).
 */
export function drawCutPanelContent(
  ctx: CanvasRenderingContext2D,
  panel: Panel,
  baseImage: CanvasImageSource,
  imageWidth: number,
  imageHeight: number,
  scale: number
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

  ctx.save();
  tracePolygonPath(ctx, scaledPoints);
  ctx.clip();
  ctx.drawImage(baseImage, d.x * scale, d.y * scale, imageWidth * scale, imageHeight * scale);
  ctx.restore();
}
