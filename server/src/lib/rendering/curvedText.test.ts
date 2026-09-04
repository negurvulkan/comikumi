import { describe, it, expect } from "vitest";
import { createCanvas } from "@napi-rs/canvas";
import type { Point } from "../../../../shared/src/layoutSchema.js";
import type { TextFillStyle } from "../../../../shared/src/rendering/textEffects.js";
import { setCanvasFactory, type CanvasLike } from "../../../../shared/src/rendering/canvasFactory.js";
import { buildArcLengthTable, totalArcLength, sampleCurvePolyline, fitCurvedText, drawCurvedText } from "../../../../shared/src/rendering/curvedText.js";

setCanvasFactory((width, height) => createCanvas(width, height) as unknown as CanvasLike);

/** Minimal CanvasRenderingContext2D stand-in — fitCurvedText only ever reads
 * `ctx.font` (settable) and calls `ctx.measureText(text).width`, so a fixed
 * per-character width model is enough to exercise the shrink-to-fit loop
 * without jsdom/node-canvas. */
function fakeCtx(widthPerChar: number) {
  return {
    font: "",
    measureText(text: string) {
      return { width: text.length * widthPerChar };
    },
  } as unknown as CanvasRenderingContext2D;
}

// A straight horizontal line from (0,0) to (300,0) — arc length is exactly 300,
// which makes the expected numbers easy to reason about.
const straightLine: Point[] = [
  { x: 0, y: 0 },
  { x: 100, y: 0 },
  { x: 200, y: 0 },
  { x: 300, y: 0 },
];

describe("buildArcLengthTable / totalArcLength", () => {
  it("produces a monotonically increasing distance table starting at 0", () => {
    const table = buildArcLengthTable(straightLine, 10);
    expect(table[0]).toEqual({ t: 0, dist: 0 });
    for (let i = 1; i < table.length; i++) {
      expect(table[i].dist).toBeGreaterThanOrEqual(table[i - 1].dist);
    }
  });

  it("the total arc length of a straight line matches its endpoint distance", () => {
    const table = buildArcLengthTable(straightLine);
    expect(totalArcLength(table)).toBeCloseTo(300, 5);
  });

  it("totalArcLength of an empty table is 0", () => {
    expect(totalArcLength([])).toBe(0);
  });
});

describe("sampleCurvePolyline", () => {
  it("samples steps+1 points, starting and ending at the curve's endpoints", () => {
    const poly = sampleCurvePolyline(straightLine, 4);
    expect(poly).toHaveLength(5);
    expect(poly[0]).toEqual({ x: 0, y: 0 });
    expect(poly[poly.length - 1]).toEqual({ x: 300, y: 0 });
  });
});

describe("fitCurvedText", () => {
  it("keeps the base font size when the text already fits the curve", () => {
    const result = fitCurvedText(fakeCtx(2), "hi", "Anime Ace", straightLine, 24);
    expect(result.fontSize).toBe(24);
  });

  it("shrinks the font size until the text fits, down to MIN_FONT_SIZE", () => {
    // 50 chars * width-per-char at size 1 would need a huge curve — forces shrinking.
    const longText = "x".repeat(50);
    const result = fitCurvedText(fakeCtx(10), longText, "Anime Ace", straightLine, 48);
    expect(result.fontSize).toBeLessThan(48);
    expect(result.fontSize).toBeGreaterThanOrEqual(6); // MIN_FONT_SIZE
  });

  it("flattens newlines to spaces before measuring", () => {
    const withBreak = fitCurvedText(fakeCtx(2), "a\nb", "Anime Ace", straightLine, 24);
    const flattened = fitCurvedText(fakeCtx(2), "a b", "Anime Ace", straightLine, 24);
    expect(withBreak.totalTextWidth).toBe(flattened.totalTextWidth);
  });
});

// A gentle arc (not a straight line) — closer to how curved/SFX text is actually used,
// and gives drawCurvedText's per-character rotate() a real angle to work with.
const arc: Point[] = [
  { x: 20, y: 120 },
  { x: 80, y: 20 },
  { x: 160, y: 20 },
  { x: 220, y: 120 },
];

function realCtx() {
  return createCanvas(240, 160).getContext("2d") as unknown as CanvasRenderingContext2D;
}

function countNonTransparentPixels(c: CanvasRenderingContext2D): number {
  const data = c.getImageData(0, 0, 240, 160).data;
  let count = 0;
  for (let i = 3; i < data.length; i += 4) {
    if (data[i] > 0) count++;
  }
  return count;
}

describe("drawCurvedText", () => {
  const baseStyle: TextFillStyle = { color: "#000000" };

  it("draws without throwing and paints non-transparent pixels (plain solid fill)", () => {
    const c = realCtx();
    const fitted = fitCurvedText(c, "BOOM", "sans-serif", arc, 40);
    expect(() => drawCurvedText(c, "BOOM", arc, fitted, "sans-serif", "center", baseStyle, 1)).not.toThrow();
    expect(countNonTransparentPixels(c)).toBeGreaterThan(0);
  });

  it("routes the fill through the offscreen-mask composite when screentone is enabled, and still paints pixels", () => {
    const c = realCtx();
    const screentoneStyle: TextFillStyle = {
      color: "#000000",
      outline: { enabled: true, color: "#ff0000", widthPx: 2 },
      screentone: {
        enabled: true,
        pattern: "dots",
        spacingPx: 6,
        sizeRatio: 0.6,
        angleDeg: 20,
        dotColor: "#000000",
        backgroundColor: "#ffffff",
        opacity: 1,
      },
    };
    const fitted = fitCurvedText(c, "BOOM", "sans-serif", arc, 40);
    expect(() => drawCurvedText(c, "BOOM", arc, fitted, "sans-serif", "center", screentoneStyle, 1)).not.toThrow();
    expect(countNonTransparentPixels(c)).toBeGreaterThan(0);
  });

  it("is a no-op for blank/whitespace-only text", () => {
    const c = realCtx();
    const fitted = fitCurvedText(c, "   ", "sans-serif", arc, 40);
    drawCurvedText(c, "   ", arc, fitted, "sans-serif", "center", baseStyle, 1);
    expect(countNonTransparentPixels(c)).toBe(0);
  });
});
