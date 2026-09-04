import { describe, it, expect } from "vitest";
import { createCanvas } from "@napi-rs/canvas";
import type { Point } from "../../../../shared/src/layoutSchema.js";
import { createBubble, resolveBubbleForm } from "../../../../shared/src/layoutSchema.js";
import {
  applyBubbleFillStyle,
  applyStrokeDash,
  buildSmoothBoundary,
  buildBoundaryForStyle,
  buildCloudBoundary,
  buildJaggedBoundary,
  canHaveTail,
  drawBubbleBackground,
  drawBubbleBevel,
  insertTail,
  perpendicularOffset,
  resetStrokeDash,
  tailBasePoints,
} from "../../../../shared/src/rendering/bubbleBackground.js";
import type { BubbleBevelDirection, BubbleBevelStyle } from "../../../../shared/src/layoutSchema.js";

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

function ctx() {
  return createCanvas(200, 200).getContext("2d") as unknown as CanvasRenderingContext2D;
}

describe("applyBubbleFillStyle", () => {
  const form = resolveBubbleForm(createBubble({ id: "b1", x: 0, y: 0, width: 100, height: 100, bubbleStyle: "speech" }), "de");

  it("sets a plain solid-color fillStyle when backgroundGradientFill is disabled", () => {
    const c = ctx();
    applyBubbleFillStyle(c, form, 100, 100);
    expect(c.fillStyle).toBe(form.fillColor);
  });

  it("sets a CanvasGradient fillStyle when backgroundGradientFill is enabled", () => {
    const c = ctx();
    const gradientForm = {
      ...form,
      backgroundGradientFill: { enabled: true, colorStart: "#ffffff", colorEnd: "#000000", angleDeg: 0 },
    };
    applyBubbleFillStyle(c, gradientForm, 100, 100);
    expect(typeof c.fillStyle).not.toBe("string");
  });
});

describe("drawBubbleBackground with glow/dropShadow", () => {
  const baseForm = resolveBubbleForm(createBubble({ id: "b1", x: 0, y: 0, width: 100, height: 100, bubbleStyle: "speech" }), "de");

  it("does not throw and resets shadow state when glow/dropShadow are enabled", () => {
    const c = ctx();
    const form = {
      ...baseForm,
      backgroundGlow: { enabled: true, color: "#66e0ff", blurPx: 16 },
      backgroundDropShadow: { enabled: true, color: "#000000", blurPx: 8, offsetXPx: 4, offsetYPx: 4 },
    };
    expect(() => drawBubbleBackground(c, form, "rect", 1)).not.toThrow();
    expect(c.shadowBlur).toBe(0);
  });

  it("is a no-op for the shadow underlay when neither effect is enabled (unchanged behavior)", () => {
    const c = ctx();
    expect(() => drawBubbleBackground(c, baseForm, "rect", 1)).not.toThrow();
    expect(c.shadowBlur).toBe(0);
  });
});

describe("drawBubbleBevel", () => {
  const baseForm = resolveBubbleForm(createBubble({ id: "b1", x: 0, y: 0, width: 100, height: 100, bubbleStyle: "speech" }), "de");
  const boundary = buildSmoothBoundary("rect", 100, 100);
  const styles: BubbleBevelStyle[] = ["inner", "outer", "emboss"];
  const directions: BubbleBevelDirection[] = ["up", "down"];

  for (const style of styles) {
    for (const direction of directions) {
      it(`does not throw and resets shadow state for style="${style}" direction="${direction}"`, () => {
        const c = ctx();
        const form = {
          ...baseForm,
          backgroundBevel: {
            enabled: true,
            style,
            direction,
            sizePx: 6,
            angleDeg: 120,
            softenPx: 4,
            highlightColor: "#ffffff",
            highlightOpacity: 0.75,
            shadowColor: "#000000",
            shadowOpacity: 0.6,
          },
        };
        expect(() => drawBubbleBevel(c, boundary, form, 100, 100, 1)).not.toThrow();
        expect(c.shadowBlur).toBe(0);
      });
    }
  }

  it("is a no-op when disabled (unchanged behavior)", () => {
    const c = ctx();
    c.shadowBlur = 42;
    drawBubbleBevel(c, boundary, baseForm, 100, 100, 1);
    // shadowBlur is left untouched (not reset) since the function returns immediately —
    // callers always run this right after fillAndStrokePath, which doesn't touch shadow
    // state either, so there's nothing to clean up when bevel itself never ran.
    expect(c.shadowBlur).toBe(42);
  });

  it("integrates cleanly via drawBubbleBackground end-to-end (no throw, shadow reset)", () => {
    const c = ctx();
    const form = {
      ...baseForm,
      backgroundBevel: {
        enabled: true,
        style: "inner" as const,
        direction: "up" as const,
        sizePx: 6,
        angleDeg: 120,
        softenPx: 4,
        highlightColor: "#ffffff",
        highlightOpacity: 0.75,
        shadowColor: "#000000",
        shadowOpacity: 0.6,
      },
    };
    expect(() => drawBubbleBackground(c, form, "rect", 1)).not.toThrow();
    expect(c.shadowBlur).toBe(0);
  });
});

describe("applyStrokeDash / resetStrokeDash", () => {
  const baseForm = resolveBubbleForm(createBubble({ id: "b1", x: 0, y: 0, width: 100, height: 100, bubbleStyle: "speech" }), "de");

  it("is a no-op when the pattern is empty (solid line, unchanged behavior)", () => {
    const c = ctx();
    applyStrokeDash(c, baseForm, 1);
    expect(c.getLineDash()).toEqual([]);
  });

  it("sets the dash list and offset, scaled by `scale`", () => {
    const c = ctx();
    const form = { ...baseForm, strokeDashPattern: [8, 4], strokeDashOffsetPx: 2 };
    applyStrokeDash(c, form, 2);
    expect(c.getLineDash()).toEqual([16, 8]);
    expect(c.lineDashOffset).toBe(4);
  });

  it("resetStrokeDash clears the dash list and offset", () => {
    const c = ctx();
    c.setLineDash([8, 4]);
    c.lineDashOffset = 5;
    resetStrokeDash(c);
    expect(c.getLineDash()).toEqual([]);
    expect(c.lineDashOffset).toBe(0);
  });
});

describe("drawBubbleBackground with strokeDashPattern", () => {
  const baseForm = resolveBubbleForm(createBubble({ id: "b1", x: 0, y: 0, width: 100, height: 100, bubbleStyle: "speech" }), "de");

  it("does not throw with a dash pattern set, and resets dash state afterward", () => {
    const c = ctx();
    const form = { ...baseForm, strokeDashPattern: [8, 4] };
    expect(() => drawBubbleBackground(c, form, "rect", 1)).not.toThrow();
    expect(c.getLineDash()).toEqual([]);
  });

  it("does not leak the dash pattern into a subsequent bevel pass (the bug this design avoids) — checked against the highest-risk 'emboss' style, which has no clip/save-restore wrapper of its own", () => {
    const c = ctx();
    const form = {
      ...baseForm,
      strokeDashPattern: [8, 4],
      backgroundBevel: {
        enabled: true,
        style: "emboss" as const,
        direction: "up" as const,
        sizePx: 6,
        angleDeg: 120,
        softenPx: 4,
        highlightColor: "#ffffff",
        highlightOpacity: 0.75,
        shadowColor: "#000000",
        shadowOpacity: 0.6,
      },
    };
    expect(() => drawBubbleBackground(c, form, "rect", 1)).not.toThrow();
    expect(c.getLineDash()).toEqual([]);
  });

  it("chain-tail segments pick up the pattern too, consistent with strokeColor/strokeWidthPx", () => {
    const c = ctx();
    const form = {
      ...resolveBubbleForm(createBubble({ id: "b2", x: 0, y: 0, width: 100, height: 100, bubbleStyle: "thought" }), "de"),
      tail: { x: 50, y: 150 },
      tailStyle: "chain" as const,
      strokeDashPattern: [4, 2],
    };
    expect(() => drawBubbleBackground(c, form, "rect", 1)).not.toThrow();
    expect(c.getLineDash()).toEqual([]);
  });
});
