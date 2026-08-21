import type { Point } from "../../../shared/src/layoutSchema";

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
