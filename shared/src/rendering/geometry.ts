import type { Point } from "../layoutSchema.js";

/**
 * Ray-casting point-in-polygon test — works for any simple polygon, not just quads.
 * Lives here (rather than client/src/editor/geometry.ts, which re-exports it for its
 * existing callers) because perspective.ts's Node-side reuse (server-side vector-PDF
 * rendering) needs it too, and shared/ can't depend on client/.
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
