import { describe, it, expect } from "vitest";
import {
  paddingRatioFor,
  fitHorizontalText,
  wrapHorizontal,
  ovalRowWidth,
  PADDING_RATIO,
  SVG_BUBBLE_PADDING_RATIO,
  type BalloonGeometry,
} from "../../../../shared/src/rendering/textLayout.js";

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

  it("an explicit override wins over both the SVG ratio and the per-shape lookup", () => {
    expect(paddingRatioFor("speech", "rect", 0.4)).toBe(0.4);
    expect(paddingRatioFor("svg", "oval", 0)).toBe(0);
  });

  it("a null/undefined override falls back to the existing automatic behavior", () => {
    expect(paddingRatioFor("speech", "rect", null)).toBe(PADDING_RATIO.rect);
    expect(paddingRatioFor("speech", "rect", undefined)).toBe(PADDING_RATIO.rect);
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

  it("accepts a per-row width function instead of a flat scalar", () => {
    // Row 0 gets 60 (fits "aaaa" only), row 1+ gets 1000 (fits everything) — proves the
    // callback is looked up PER ROW, not just called once for the whole block.
    const widthAt = (rowIndex: number) => (rowIndex === 0 ? 60 : 1000);
    const lines = wrapHorizontal(fakeCtx(10), "aaaa bbbb cccc", widthAt);
    expect(lines.map((l) => l.text)).toEqual(["aaaa", "bbbb cccc"]);
  });
});

describe("ovalRowWidth", () => {
  it("is widest at the bubble's vertical center (rowCenterY = 0)", () => {
    const atCenter = ovalRowWidth(200, 100, 0);
    const nearTop = ovalRowWidth(200, 100, 40);
    expect(atCenter).toBeGreaterThan(nearTop);
  });

  it("is symmetric above and below center", () => {
    expect(ovalRowWidth(200, 100, 30)).toBeCloseTo(ovalRowWidth(200, 100, -30), 6);
  });

  it("never collapses toward zero near the top/bottom pole (floored)", () => {
    const nearPole = ovalRowWidth(200, 100, 49.9);
    expect(nearPole).toBeGreaterThan(0);
    expect(nearPole).toBeGreaterThanOrEqual(200 * 0.3 * (1 - 0.12) - 1e-6);
  });

  it("scales linearly with bubble width at a fixed relative row position", () => {
    expect(ovalRowWidth(400, 100, 0)).toBeCloseTo(ovalRowWidth(200, 100, 0) * 2, 6);
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

  it("without balloon geometry, an oval bubble wraps exactly like the flat-box legacy behavior", () => {
    const withoutGeometry = fitHorizontalText(fakeCtx(8), "aaaa bbbb cccc dddd", "Anime Ace", 1.2, 100, 200, 24);
    const geometry: BalloonGeometry = { shape: "oval", balloonAwareWrap: false, bubbleWidth: 300, bubbleHeight: 300 };
    const withGeometryOff = fitHorizontalText(fakeCtx(8), "aaaa bbbb cccc dddd", "Anime Ace", 1.2, 100, 200, 24, geometry);
    expect(withGeometryOff).toEqual(withoutGeometry);
  });

  it("balloon-aware oval wrapping fits more per line near the vertical center than the flat box would", () => {
    // A wide, short oval: the flat 0.28-inset box is much narrower than the true ellipse
    // width near the center, so balloon-aware wrapping should fit strictly more per line
    // (fewer total lines) for the same text/font size.
    const text = "one two three four five six seven eight";
    const flat = fitHorizontalText(fakeCtx(8), text, "Anime Ace", 1.2, 300 * (1 - 0.28), 100 * (1 - 0.28), 16);
    const geometry: BalloonGeometry = { shape: "oval", balloonAwareWrap: true, bubbleWidth: 300, bubbleHeight: 100 };
    const balloonAware = fitHorizontalText(fakeCtx(8), text, "Anime Ace", 1.2, 300 * (1 - 0.28), 100 * (1 - 0.28), 16, geometry);
    expect(balloonAware.lines.length).toBeLessThanOrEqual(flat.lines.length);
  });

  it("a non-oval shape ignores balloon geometry even when balloonAwareWrap is true", () => {
    const rectResult = fitHorizontalText(fakeCtx(8), "aaaa bbbb cccc dddd", "Anime Ace", 1.2, 100, 200, 24, {
      shape: "rect",
      balloonAwareWrap: true,
      bubbleWidth: 300,
      bubbleHeight: 300,
    });
    const flatResult = fitHorizontalText(fakeCtx(8), "aaaa bbbb cccc dddd", "Anime Ace", 1.2, 100, 200, 24);
    expect(rectResult).toEqual(flatResult);
  });
});
