import { describe, it, expect } from "vitest";
import type { Point } from "../../../../shared/src/layoutSchema.js";
import {
  buildSmoothBoundary,
  buildBoundaryForStyle,
  buildCloudBoundary,
  buildJaggedBoundary,
  canHaveTail,
  insertTail,
  perpendicularOffset,
  tailBasePoints,
} from "../../../../shared/src/rendering/bubbleBackground.js";

describe("buildSmoothBoundary", () => {
  it("returns a closed, finite point set for an oval", () => {
    const oval = buildSmoothBoundary("oval", 200, 100);
    expect(oval.length).toBe(96);
    for (const p of oval) {
      expect(Number.isFinite(p.x)).toBe(true);
      expect(Number.isFinite(p.y)).toBe(true);
    }
  });

  it("returns the expected point count for a rounded rect (4 corners x (arcSteps+1))", () => {
    const rect = buildSmoothBoundary("rect", 200, 100);
    expect(rect.length).toBe(4 * 13);
  });
});

describe("canHaveTail", () => {
  it("matches the documented set of tail-capable bubble styles", () => {
    expect(canHaveTail("speech")).toBe(true);
    expect(canHaveTail("thought")).toBe(true);
    expect(canHaveTail("shout")).toBe(true);
    expect(canHaveTail("svg")).toBe(true);
    expect(canHaveTail("none")).toBe(false);
  });
});

describe("insertTail", () => {
  const boundary = buildSmoothBoundary("oval", 200, 120);
  const anchor: Point = { x: 100, y: 120 };
  const tip: Point = { x: 100, y: 220 };
  const tailWidth = 40;

  it("with curve=0 appends the tip verbatim (unchanged pre-curve behavior)", () => {
    const result = insertTail(boundary, anchor, tailWidth, tip, 0);
    expect(result[result.length - 1]).toEqual(tip);
  });

  it("returns the input unchanged when the boundary has fewer than 3 points", () => {
    const degenerate: Point[] = [{ x: 0, y: 0 }];
    expect(insertTail(degenerate, anchor, tailWidth, tip, 5)).toBe(degenerate);
  });

  // Regression test for a real bug fixed this session: the two tail edges must
  // bow to the SAME side when curved. Each edge originally computed its own
  // local perpendicular direction, which made them bow apart from each other
  // instead of together (see perpendicularUnit's doc comment in
  // bubbleBackground.ts). This checks the geometric invariant rather than the
  // internal implementation, so it stays valid across refactors.
  it("curves both tail edges to the same side instead of bowing apart", () => {
    const curve = 15;
    const { left, right } = tailBasePoints(boundary, anchor, tailWidth);
    const straight = insertTail(boundary, anchor, tailWidth, tip, 0);
    const curved = insertTail(boundary, anchor, tailWidth, tip, curve);

    // Curving samples the edges instead of a single straight append, so it
    // must add strictly more points than the straight variant.
    expect(curved.length).toBeGreaterThan(straight.length);

    const sharedPrefixLength = straight.length - 1; // everything up to and including `right`
    const appended = curved.slice(sharedPrefixLength);

    const side = (a: Point, b: Point, p: Point) => Math.sign((b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x));
    const sides = appended.map((p) => side(left, right, p)).filter((s) => s !== 0);
    expect(sides.length).toBeGreaterThan(0);
    expect(sides.every((s) => s === sides[0])).toBe(true);
  });
});

describe("perpendicularOffset", () => {
  it("offsets exactly perpendicular to a horizontal line", () => {
    const from: Point = { x: 0, y: 0 };
    const to: Point = { x: 10, y: 0 };
    const offset = perpendicularOffset(from, to, 5);
    expect(offset.x).toBeCloseTo(5, 5);
    expect(Math.abs(offset.y)).toBeCloseTo(5, 5);
  });
});

describe("buildCloudBoundary", () => {
  it("returns a closed, finite scalloped boundary roughly centered on the box", () => {
    const points = buildCloudBoundary(200, 100);
    expect(points.length).toBeGreaterThan(0);
    for (const p of points) {
      expect(Number.isFinite(p.x)).toBe(true);
      expect(Number.isFinite(p.y)).toBe(true);
    }
    const avgX = points.reduce((s, p) => s + p.x, 0) / points.length;
    const avgY = points.reduce((s, p) => s + p.y, 0) / points.length;
    expect(avgX).toBeCloseTo(100, 0);
    expect(avgY).toBeCloseTo(50, 0);
  });
});

describe("buildJaggedBoundary", () => {
  it("alternates outer/inner radius, producing points at two distinct distances from center", () => {
    const w = 200;
    const h = 200; // square box so outer/inner radius ratio is exact regardless of x/y
    const points = buildJaggedBoundary(w, h);
    const cx = w / 2;
    const cy = h / 2;
    const dists = points.map((p) => Math.hypot(p.x - cx, p.y - cy));
    const outer = Math.max(...dists);
    const inner = Math.min(...dists);
    expect(inner).toBeCloseTo(outer * 0.62, 1);
  });
});

describe("buildBoundaryForStyle", () => {
  it("dispatches to the matching shape builder for speech/thought/shout", () => {
    expect(buildBoundaryForStyle("speech", "oval", 200, 100)).toEqual(buildSmoothBoundary("oval", 200, 100));
    expect(buildBoundaryForStyle("thought", "oval", 200, 100)).toEqual(buildCloudBoundary(200, 100));
    expect(buildBoundaryForStyle("shout", "oval", 200, 100)).toEqual(buildJaggedBoundary(200, 100));
  });

  it("returns an empty boundary for 'none'", () => {
    expect(buildBoundaryForStyle("none", "rect", 200, 100)).toEqual([]);
  });

  it("scales a normalized 0..1 SVG boundary onto the given box independently per axis", () => {
    const normalized: Point[] = [{ x: 0, y: 0 }, { x: 1, y: 1 }, { x: 0.5, y: 0.25 }];
    expect(buildBoundaryForStyle("svg", "rect", 200, 100, normalized)).toEqual([
      { x: 0, y: 0 },
      { x: 200, y: 100 },
      { x: 100, y: 25 },
    ]);
  });

  it("returns an empty boundary for 'svg' when no SVG boundary has loaded yet", () => {
    expect(buildBoundaryForStyle("svg", "rect", 200, 100, null)).toEqual([]);
  });
});

describe("tailBasePoints", () => {
  it("returns two boundary points tailWidth apart, straddling the anchor's nearest boundary point", () => {
    const boundary = buildSmoothBoundary("oval", 200, 120);
    const anchor: Point = { x: 100, y: 120 };
    const { left, right, nearestPoint } = tailBasePoints(boundary, anchor, 40);
    expect(boundary).toContainEqual(left);
    expect(boundary).toContainEqual(right);
    expect(boundary).toContainEqual(nearestPoint);
  });

  it("degenerate boundaries (<3 points) collapse left/right/nearestPoint to the same point", () => {
    const degenerate: Point[] = [{ x: 5, y: 5 }];
    const result = tailBasePoints(degenerate, { x: 0, y: 0 }, 40);
    expect(result.left).toEqual(degenerate[0]);
    expect(result.right).toEqual(degenerate[0]);
    expect(result.nearestPoint).toEqual(degenerate[0]);
  });
});
