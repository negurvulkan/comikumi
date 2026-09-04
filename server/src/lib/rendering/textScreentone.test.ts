import { describe, it, expect } from "vitest";
import { createCanvas } from "@napi-rs/canvas";
import type { BubbleScreentone } from "../../../../shared/src/layoutSchema.js";
import { setCanvasFactory, type CanvasLike } from "../../../../shared/src/rendering/canvasFactory.js";
import { drawScreentoneMaskedGlyphs } from "../../../../shared/src/rendering/textScreentone.js";

setCanvasFactory((width, height) => createCanvas(width, height) as unknown as CanvasLike);

function ctx() {
  return createCanvas(200, 200).getContext("2d") as unknown as CanvasRenderingContext2D;
}

const screentone: BubbleScreentone = {
  enabled: true,
  pattern: "dots",
  spacingPx: 8,
  sizeRatio: 0.6,
  angleDeg: 0,
  dotColor: "#000000",
  backgroundColor: "#ffffff",
  opacity: 1,
};

function countNonTransparentPixels(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): number {
  const data = c.getImageData(x, y, w, h).data;
  let count = 0;
  for (let i = 3; i < data.length; i += 4) {
    if (data[i] > 0) count++;
  }
  return count;
}

describe("drawScreentoneMaskedGlyphs", () => {
  it("does not throw and paints non-transparent pixels where the glyph mask had ink", () => {
    const c = ctx();
    c.font = '60px "sans-serif"';
    c.textBaseline = "middle";
    c.textAlign = "center";
    const bounds = { x: 20, y: 20, width: 160, height: 100 };

    expect(() =>
      drawScreentoneMaskedGlyphs(
        c,
        bounds,
        screentone,
        1,
        (maskCtx) => {
          maskCtx.font = c.font;
          maskCtx.textBaseline = c.textBaseline;
          maskCtx.textAlign = c.textAlign;
        },
        (maskCtx) => {
          maskCtx.fillStyle = "#000000";
          maskCtx.fillText("A", bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
        }
      )
    ).not.toThrow();

    expect(countNonTransparentPixels(c, bounds.x, bounds.y, bounds.width, bounds.height)).toBeGreaterThan(0);
  });

  it("paints nothing when the fill-only draw callback paints no ink (empty mask)", () => {
    const c = ctx();
    const bounds = { x: 20, y: 20, width: 60, height: 60 };

    drawScreentoneMaskedGlyphs(
      c,
      bounds,
      screentone,
      1,
      () => {},
      () => {} // no-op: nothing drawn into the mask
    );

    expect(countNonTransparentPixels(c, bounds.x, bounds.y, bounds.width, bounds.height)).toBe(0);
  });

  it("oversamples using the ambient CTM (ctx.getTransform()), not just the scale parameter", () => {
    const c = ctx();
    c.scale(3, 3);
    c.font = '20px "sans-serif"';
    c.textBaseline = "middle";
    c.textAlign = "center";
    const bounds = { x: 5, y: 5, width: 50, height: 30 };

    // Should not throw even though the ambient CTM (3x) differs from the scale param (1) —
    // ctx.getTransform() reads the real 3x zoom, exercising the oversample path.
    expect(() =>
      drawScreentoneMaskedGlyphs(
        c,
        bounds,
        screentone,
        1,
        (maskCtx) => {
          maskCtx.font = c.font;
          maskCtx.textBaseline = c.textBaseline;
          maskCtx.textAlign = c.textAlign;
        },
        (maskCtx) => {
          maskCtx.fillStyle = "#000000";
          maskCtx.fillText("B", bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
        }
      )
    ).not.toThrow();
  });
});
