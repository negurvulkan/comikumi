import type { Bubble, Point } from "../../../shared/src/layoutSchema";

/**
 * Ray-casting point-in-polygon test — works for any simple polygon, not just quads.
 * Lives in shared/src/rendering/geometry.ts now (perspective.ts's server-side reuse for
 * vector-PDF export needs it too, and shared/ can't depend on client/) — re-exported here
 * unchanged so this file's existing callers (editorStore.ts's panel-membership tests)
 * don't need to know it moved.
 */
export { pointInQuad } from "../../../shared/src/rendering/geometry";

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

function normalizeAngle(a: number): number {
  let n = a;
  while (n <= -Math.PI) n += 2 * Math.PI;
  while (n > Math.PI) n -= 2 * Math.PI;
  return n;
}

function rotateAround(p: Point, center: Point, angle: number): Point {
  const dx = p.x - center.x;
  const dy = p.y - center.y;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  return { x: center.x + dx * cos - dy * sin, y: center.y + dy * cos + dx * sin };
}

/**
 * Sets the exact interior angle (in degrees) at points[vertexIndex] — its two
 * neighbors are points[vertexIndex-1] ("previous") and points[vertexIndex+1]
 * ("next"), indices wrapping cyclically (works identically for a 4-point quad or an
 * N-point panel polygon). `fixedNeighbor` stays untouched; the OTHER neighbor is
 * rotated around the vertex (pure rotation — its distance to the vertex is
 * unchanged) until the angle between the two edges equals `targetDegrees`. The
 * current winding sense (which side the moving neighbor swings toward) is preserved,
 * so `targetDegrees` is simply the unsigned angle a user would name for that corner.
 */
export function setVertexAngle(points: Point[], vertexIndex: number, fixedNeighbor: "previous" | "next", targetDegrees: number): Point[] {
  const n = points.length;
  const v = points[vertexIndex];
  const prevIdx = (vertexIndex - 1 + n) % n;
  const nextIdx = (vertexIndex + 1) % n;
  const a = points[prevIdx];
  const b = points[nextIdx];

  const angleA = Math.atan2(a.y - v.y, a.x - v.x);
  const angleB = Math.atan2(b.y - v.y, b.x - v.x);
  const currentSigned = normalizeAngle(angleB - angleA);
  const sign = currentSigned < 0 ? -1 : 1;
  const targetSigned = sign * ((targetDegrees * Math.PI) / 180);
  const delta = targetSigned - currentSigned;

  const next = points.slice();
  if (fixedNeighbor === "previous") next[nextIdx] = rotateAround(b, v, delta);
  else next[prevIdx] = rotateAround(a, v, -delta);
  return next;
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
