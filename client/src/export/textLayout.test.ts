import { describe, it, expect } from "vitest";
import { paddingRatioFor, fitHorizontalText, wrapHorizontal, PADDING_RATIO, SVG_BUBBLE_PADDING_RATIO } from "./textLayout";

function fakeCtx(widthPerChar: number) {
  return {
    font: "",
    measureText(text: string) {
      return { width: text.length * widthPerChar };
    },
  } as unknown as CanvasRenderingContext2D;
}

describe("paddingRatioFor", () => {
  it("returns the fixed SVG ratio regardless of shape when bubbleStyle is 'svg'", () => {
    expect(paddingRatioFor("svg", "rect")).toBe(SVG_BUBBLE_PADDING_RATIO);
    expect(paddingRatioFor("svg", "oval")).toBe(SVG_BUBBLE_PADDING_RATIO);
  });

  it("otherwise looks up the per-shape ratio", () => {
    expect(paddingRatioFor("speech", "rect")).toBe(PADDING_RATIO.rect);
    expect(paddingRatioFor("thought", "oval")).toBe(PADDING_RATIO.oval);
    expect(paddingRatioFor("none", "quad")).toBe(PADDING_RATIO.quad);
  });
});

describe("wrapHorizontal", () => {
  it("keeps a short line as a single line", () => {
    const lines = wrapHorizontal(fakeCtx(2), "hello world", 1000);
    expect(lines).toHaveLength(1);
    expect(lines[0].text).toBe("hello world");
  });

  it("wraps onto a new line once maxWidth is exceeded", () => {
    // "aaaa bbbb" at width-per-char 10: "aaaa bbbb" = 9*10=90 > maxWidth 60, "aaaa"=40 <= 60.
    const lines = wrapHorizontal(fakeCtx(10), "aaaa bbbb", 60);
    expect(lines.map((l) => l.text)).toEqual(["aaaa", "bbbb"]);
  });

  it("treats explicit newlines as forced paragraph breaks", () => {
    const lines = wrapHorizontal(fakeCtx(2), "first\nsecond", 1000);
    expect(lines.map((l) => l.text)).toEqual(["first", "second"]);
  });

  it("an empty paragraph becomes an empty line entry, not omitted", () => {
    const lines = wrapHorizontal(fakeCtx(2), "a\n\nb", 1000);
    expect(lines.map((l) => l.text)).toEqual(["a", "", "b"]);
  });
});

describe("fitHorizontalText", () => {
  it("keeps the base font size when the text already fits the box", () => {
    const result = fitHorizontalText(fakeCtx(1), "hi", "Anime Ace", 1.2, 500, 500, 24);
    expect(result.fontSize).toBe(24);
  });

  it("shrinks the font size until the wrapped block height fits, down to MIN_FONT_SIZE", () => {
    const longText = "word ".repeat(40).trim();
    const result = fitHorizontalText(fakeCtx(8), longText, "Anime Ace", 1.2, 100, 60, 48);
    expect(result.fontSize).toBeLessThan(48);
    expect(result.fontSize).toBeGreaterThanOrEqual(6);
    // Either it fits, or it bottomed out at MIN_FONT_SIZE without fitting.
    expect(result.blockHeight <= 60 || result.fontSize === 6).toBe(true);
  });
});
