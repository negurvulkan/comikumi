import type { Bubble, Point } from "../../../shared/src/layoutSchema";

/**
 * Ray-casting point-in-polygon test — works for any simple polygon, not just quads
 * (despite historically living in export/perspective.ts, where it's used for quad-bubble
 * text warping). Relocated here since it's also the panel-membership test used by
 * editorStore.ts (auto-assign a bubble to a panel on creation, auto-detach when dragged
 * outside); perspective.ts re-exports it so its existing callers/tests are unaffected.
 */
export function pointInQuad(p: Point, q: Point[]): boolean {
  let inside = false;
  for (let i = 0, j = q.length - 1; i < q.length; j = i++) {
    const xi = q[i].x,
      yi = q[i].y,
      xj = q[j].x,
      yj = q[j].y;
    const intersect = yi > p.y !== yj > p.y && p.x < ((xj - xi) * (p.y - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

/** Center of a bubble's own base box (ignores any per-language formOverride/rotation) —
 * used as the structural, language-independent point tested against a panel's polygon
 * for auto-assign-on-creation and auto-detach-on-drag. */
export function bubbleCenter(bubble: Pick<Bubble, "x" | "y" | "width" | "height">): Point {
  return { x: bubble.x + bubble.width / 2, y: bubble.y + bubble.height / 2 };
}

/** Closest point on the segment a→b to point p, and its squared distance — used to find
 * which edge a double-click landed nearest to when inserting a new vertex (PanelShape.tsx). */
export function closestPointOnSegment(p: Point, a: Point, b: Point): { point: Point; distSq: number } {
  const abx = b.x - a.x;
  const aby = b.y - a.y;
  const lengthSq = abx * abx + aby * aby;
  const t = lengthSq === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * abx + (p.y - a.y) * aby) / lengthSq));
  const point = { x: a.x + abx * t, y: a.y + aby * t };
  const dx = p.x - point.x;
  const dy = p.y - point.y;
  return { point, distSq: dx * dx + dy * dy };
}

/**
 * Projects a raw drag point onto the perpendicular axis of the `from`→`to` line
 * (measured from that line's midpoint), returning a signed bow amount — used by
 * BubbleShape.tsx's tail-curve handle to turn an arbitrary drag position into a clean
 * `tailCurve` value that ignores any tangential drag component. Positive/negative sign
 * indicates which side of the from→to line the drag point fell on.
 */
export function projectOntoPerpendicularBow(from: Point, to: Point, dragPoint: Point): number {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const len = Math.hypot(dx, dy) || 1;
  const px = -dy / len;
  const py = dx / len;
  const mx = (from.x + to.x) / 2;
  const my = (from.y + to.y) / 2;
  return (dragPoint.x - mx) * px + (dragPoint.y - my) * py;
}
