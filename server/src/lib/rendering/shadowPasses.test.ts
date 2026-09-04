import { describe, it, expect } from "vitest";
import { createCanvas } from "@napi-rs/canvas";
import { drawShadowUnderlayPasses } from "../../../../shared/src/rendering/shadowPasses.js";
import type { EffectGlow, EffectShadow } from "../../../../shared/src/layoutSchema.js";

function ctx() {
  return createCanvas(10, 10).getContext("2d") as unknown as CanvasRenderingContext2D;
}

const disabledGlow: EffectGlow = { enabled: false, color: "#66e0ff", blurPx: 16 };
const enabledGlow: EffectGlow = { enabled: true, color: "#66e0ff", blurPx: 16 };
const disabledShadow: EffectShadow = { enabled: false, color: "#000000", blurPx: 8, offsetXPx: 4, offsetYPx: 4 };
const enabledShadow: EffectShadow = { enabled: true, color: "#000000", blurPx: 8, offsetXPx: 4, offsetYPx: 4 };

describe("drawShadowUnderlayPasses", () => {
  it("calls draw() zero times when neither effect is enabled", () => {
    const c = ctx();
    let calls = 0;
    drawShadowUnderlayPasses(c, disabledGlow, disabledShadow, () => calls++);
    expect(calls).toBe(0);
  });

  it("calls draw() once for a single enabled effect", () => {
    const c = ctx();
    let calls = 0;
    drawShadowUnderlayPasses(c, enabledGlow, disabledShadow, () => calls++);
    expect(calls).toBe(1);
  });

  it("calls draw() twice when both effects are enabled", () => {
    const c = ctx();
    let calls = 0;
    drawShadowUnderlayPasses(c, enabledGlow, enabledShadow, () => calls++);
    expect(calls).toBe(2);
  });

  it("sets ctx.shadow* to the glow config (zero offset) during the glow pass", () => {
    const c = ctx();
    let seenDuringGlow: { color: string; blur: number; x: number; y: number } | null = null;
    drawShadowUnderlayPasses(c, enabledGlow, disabledShadow, () => {
      seenDuringGlow = { color: c.shadowColor, blur: c.shadowBlur, x: c.shadowOffsetX, y: c.shadowOffsetY };
    });
    expect(seenDuringGlow).toEqual({ color: "#66e0ff", blur: 16, x: 0, y: 0 });
  });

  it("sets ctx.shadow* to the drop-shadow config (with offset) during the shadow pass", () => {
    const c = ctx();
    let seenDuringShadow: { color: string; blur: number; x: number; y: number } | null = null;
    drawShadowUnderlayPasses(c, disabledGlow, enabledShadow, () => {
      seenDuringShadow = { color: c.shadowColor, blur: c.shadowBlur, x: c.shadowOffsetX, y: c.shadowOffsetY };
    });
    expect(seenDuringShadow).toEqual({ color: "#000000", blur: 8, x: 4, y: 4 });
  });

  it("resets ctx.shadowBlur to 0 after the last pass, whether or not any effect ran", () => {
    const c = ctx();
    c.shadowBlur = 99;
    drawShadowUnderlayPasses(c, enabledGlow, enabledShadow, () => {});
    expect(c.shadowBlur).toBe(0);

    const c2 = ctx();
    c2.shadowBlur = 99;
    drawShadowUnderlayPasses(c2, disabledGlow, disabledShadow, () => {});
    expect(c2.shadowBlur).toBe(0);
  });
});
