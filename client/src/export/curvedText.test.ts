import { describe, it, expect } from "vitest";
import type { Point } from "../../../shared/src/layoutSchema";
import { buildArcLengthTable, totalArcLength, sampleCurvePolyline, fitCurvedText } from "./curvedText";

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
