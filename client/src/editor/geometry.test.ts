import { describe, it, expect } from "vitest";
import type { Point } from "../../../shared/src/layoutSchema";
import { bubbleCenter, closestPointOnSegment, pointInQuad, projectOntoPerpendicularBow, setVertexAngle } from "./geometry";

function dist(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/** Unsigned angle (degrees, 0-180) between v->a and v->b via the dot product — the
 * "angle at this corner" the way a person would read it, independent of winding. */
function angleAtDeg(v: Point, a: Point, b: Point): number {
  const ax = a.x - v.x,
    ay = a.y - v.y;
  const bx = b.x - v.x,
    by = b.y - v.y;
  const dot = ax * bx + ay * by;
  const cos = dot / (Math.hypot(ax, ay) * Math.hypot(bx, by));
  return (Math.acos(Math.max(-1, Math.min(1, cos))) * 180) / Math.PI;
}

describe("pointInQuad", () => {
  const square: Point[] = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 } ];

  it("is true for a point inside the polygon", () => {
    expect(pointInQuad({ x: 5, y: 5 }, square)).toBe(true);
  });

  it("is false for a point outside the polygon", () => {
    expect(pointInQuad({ x: 50, y: 50 }, square)).toBe(false);
  });

  it("works for an irregular (non-quad) polygon too", () => {
    const triangle: Point[] = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 5, y: 10 }];
    expect(pointInQuad({ x: 5, y: 3 }, triangle)).toBe(true);
    expect(pointInQuad({ x: 1, y: 9 }, triangle)).toBe(false);
  });
});

describe("bubbleCenter", () => {
  it("returns the center of the base box, ignoring rotation", () => {
    expect(bubbleCenter({ x: 10, y: 20, width: 30, height: 40 })).toEqual({ x: 25, y: 40 });
  });
});

describe("closestPointOnSegment", () => {
  const a: Point = { x: 0, y: 0 };
  const b: Point = { x: 10, y: 0 };

  it("projects a point directly above the segment onto its perpendicular foot", () => {
    const { point, distSq } = closestPointOnSegment({ x: 5, y: 3 }, a, b);
    expect(point).toEqual({ x: 5, y: 0 });
    expect(distSq).toBe(9);
  });

  it("clamps to the nearer endpoint when the projection falls before the segment start", () => {
    const { point } = closestPointOnSegment({ x: -5, y: 4 }, a, b);
    expect(point).toEqual(a);
  });

  it("clamps to the nearer endpoint when the projection falls past the segment end", () => {
    const { point } = closestPointOnSegment({ x: 15, y: 4 }, a, b);
    expect(point).toEqual(b);
  });

  it("returns distance 0 for a point exactly on the segment", () => {
    const { distSq } = closestPointOnSegment({ x: 5, y: 0 }, a, b);
    expect(distSq).toBe(0);
  });

  it("degenerate zero-length segment collapses to the single point", () => {
    const point: Point = { x: 3, y: 3 };
    const { point: result, distSq } = closestPointOnSegment({ x: 6, y: 7 }, point, point);
    expect(result).toEqual(point);
    expect(distSq).toBe(9 + 16);
  });
});

describe("projectOntoPerpendicularBow", () => {
  const from: Point = { x: 0, y: 0 };
  const to: Point = { x: 10, y: 0 };

  it("returns 0 when the drag point sits exactly on the from->to midpoint", () => {
    expect(projectOntoPerpendicularBow(from, to, { x: 5, y: 0 })).toBeCloseTo(0, 6);
  });

  it("returns a positive/negative signed amount depending on which side the drag point is on", () => {
    const above = projectOntoPerpendicularBow(from, to, { x: 5, y: 8 });
    const below = projectOntoPerpendicularBow(from, to, { x: 5, y: -8 });
    expect(above).toBeCloseTo(8, 6);
    expect(below).toBeCloseTo(-8, 6);
    expect(Math.sign(above)).toBe(-Math.sign(below));
  });

  it("ignores the tangential (along-the-line) component of the drag", () => {
    // Both points are 8 units perpendicular from the line, differing only in
    // their position along it — the projected bow amount must be identical.
    const a = projectOntoPerpendicularBow(from, to, { x: 2, y: 8 });
    const b = projectOntoPerpendicularBow(from, to, { x: 9, y: 8 });
    expect(a).toBeCloseTo(b, 6);
  });
});

describe("setVertexAngle", () => {
  // A 3-point "L" where the middle vertex (index 1) starts at a skewed ~120.96°
  // angle instead of a right angle.
  const skewed: Point[] = [
    { x: 10, y: 0 },
    { x: 0, y: 0 },
    { x: -3, y: 5 },
  ];

  it("fixing the next point rotates only the previous point to hit the target angle", () => {
    const [prev, vertex, next] = skewed;
    const result = setVertexAngle(skewed, 1, "next", 90);
    expect(result[2]).toEqual(next); // "next" neighbor untouched
    expect(result[0]).not.toEqual(prev); // "previous" neighbor moved
    expect(angleAtDeg(result[1], result[0], result[2])).toBeCloseTo(90, 6);
    // Pure rotation around the vertex — distance to the vertex is preserved.
    expect(dist(result[1], result[0])).toBeCloseTo(dist(vertex, prev), 6);
  });

  it("fixing the previous point rotates only the next point to hit the target angle", () => {
    const [prev, vertex, next] = skewed;
    const result = setVertexAngle(skewed, 1, "previous", 90);
    expect(result[0]).toEqual(prev); // "previous" neighbor untouched
    expect(result[2]).not.toEqual(next); // "next" neighbor moved
    expect(angleAtDeg(result[1], result[0], result[2])).toBeCloseTo(90, 6);
    expect(dist(result[1], result[2])).toBeCloseTo(dist(vertex, next), 6);
  });

  it("the vertex itself never moves", () => {
    const result = setVertexAngle(skewed, 1, "next", 45);
    expect(result[1]).toEqual(skewed[1]);
  });

  it("works identically for a 4-point quad-style point list (cyclic wraparound)", () => {
    // A slightly skewed quad — set an exact 90° angle at corner 0, whose neighbors
    // wrap to indices 3 ("previous") and 1 ("next").
    const quad: Point[] = [
      { x: 0, y: 0 },
      { x: 10, y: 1 },
      { x: 11, y: 11 },
      { x: -2, y: 10 },
    ];
    const result = setVertexAngle(quad, 0, "next", 90);
    expect(result[1]).toEqual(quad[1]); // "next" neighbor untouched
    expect(angleAtDeg(result[0], result[3], result[1])).toBeCloseTo(90, 6);
  });
});
