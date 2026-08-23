import { describe, it, expect } from "vitest";
import type { Point } from "../../../../shared/src/layoutSchema.js";
import { unitSquareToQuad, invert3, apply, pointInQuad } from "../../../../shared/src/rendering/perspective.js";

// Axis-aligned quad — a box from (10,20) to (110,70) — makes expected mapped
// points easy to reason about, and exercises the "already a parallelogram"
// (pure-affine) branch of unitSquareToQuad.
const axisAlignedQuad: Point[] = [
  { x: 10, y: 20 },
  { x: 110, y: 20 },
  { x: 110, y: 70 },
  { x: 10, y: 70 },
];

// A genuine (non-parallelogram) perspective quad — top edge narrower than the
// bottom, like a sign viewed from below — exercises the full projective branch.
const perspectiveQuad: Point[] = [
  { x: 40, y: 0 },
  { x: 60, y: 0 },
  { x: 100, y: 100 },
  { x: 0, y: 100 },
];

describe("unitSquareToQuad + apply", () => {
  it("maps the unit square's 4 corners exactly onto an axis-aligned quad", () => {
    const m = unitSquareToQuad(axisAlignedQuad);
    expect(apply(m, 0, 0)).toEqual({ x: 10, y: 20 });
    expect(apply(m, 1, 0)).toEqual({ x: 110, y: 20 });
    expect(apply(m, 1, 1)).toEqual({ x: 110, y: 70 });
    expect(apply(m, 0, 1)).toEqual({ x: 10, y: 70 });
  });

  it("maps the unit square's 4 corners exactly onto a genuine perspective quad", () => {
    const m = unitSquareToQuad(perspectiveQuad);
    for (const [uv, expected] of [
      [[0, 0], perspectiveQuad[0]],
      [[1, 0], perspectiveQuad[1]],
      [[1, 1], perspectiveQuad[2]],
      [[0, 1], perspectiveQuad[3]],
    ] as const) {
      const mapped = apply(m, uv[0], uv[1]);
      expect(mapped.x).toBeCloseTo(expected.x, 6);
      expect(mapped.y).toBeCloseTo(expected.y, 6);
    }
  });

  it("maps the unit square's center to the quad's visual center for an axis-aligned quad", () => {
    const m = unitSquareToQuad(axisAlignedQuad);
    const center = apply(m, 0.5, 0.5);
    expect(center.x).toBeCloseTo(60, 6);
    expect(center.y).toBeCloseTo(45, 6);
  });
});

describe("invert3", () => {
  it("round-trips: apply(invert3(forward), apply(forward, x, y)) is the identity", () => {
    const forward = unitSquareToQuad(perspectiveQuad);
    const inverse = invert3(forward);
    for (const [u, v] of [
      [0.2, 0.3],
      [0.7, 0.9],
      [0.5, 0.5],
    ]) {
      const mapped = apply(forward, u, v);
      const back = apply(inverse, mapped.x, mapped.y);
      expect(back.x).toBeCloseTo(u, 6);
      expect(back.y).toBeCloseTo(v, 6);
    }
  });

  it("falls back to the identity matrix for a singular (degenerate) input", () => {
    const singular: [number, number, number, number, number, number, number, number, number] = [
      0, 0, 0, 0, 0, 0, 0, 0, 0,
    ];
    expect(invert3(singular)).toEqual([1, 0, 0, 0, 1, 0, 0, 0, 1]);
  });
});

describe("pointInQuad", () => {
  it("returns true for a point inside an axis-aligned quad", () => {
    expect(pointInQuad({ x: 60, y: 45 }, axisAlignedQuad)).toBe(true);
  });

  it("returns false for a point clearly outside the quad", () => {
    expect(pointInQuad({ x: 500, y: 500 }, axisAlignedQuad)).toBe(false);
  });

  it("returns false for a point inside the axis-aligned bounding box but outside a non-rectangular quad", () => {
    // (5, 5) is within perspectiveQuad's bbox (0..100, 0..100) but well to the
    // left of the narrow top edge (40..60 at y=0) — outside the actual quad.
    expect(pointInQuad({ x: 5, y: 5 }, perspectiveQuad)).toBe(false);
  });
});
