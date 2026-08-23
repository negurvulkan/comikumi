import { describe, it, expect } from "vitest";
import type { Point } from "../../../shared/src/layoutSchema";
import { bubbleCenter, closestPointOnSegment, pointInQuad, projectOntoPerpendicularBow } from "./geometry";

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
