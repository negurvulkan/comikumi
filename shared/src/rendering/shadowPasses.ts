import type { EffectGlow, EffectShadow } from "../layoutSchema.js";

function applyShadowState(ctx: CanvasRenderingContext2D, config: EffectGlow | EffectShadow | null, offsetX = 0, offsetY = 0) {
  if (!config?.enabled) {
    ctx.shadowColor = "transparent";
    ctx.shadowBlur = 0;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 0;
    return;
  }
  ctx.shadowColor = config.color;
  ctx.shadowBlur = config.blurPx;
  ctx.shadowOffsetX = offsetX;
  ctx.shadowOffsetY = offsetY;
}

/**
 * Runs `draw` once per enabled shadow-like effect (glow, then drop-shadow) as an
 * "underlay" pass, then resets shadow state to none — the caller does its own final
 * crisp draw immediately afterward, unaffected (shadow already off by then). Two-pass
 * instead of one because Canvas2D only supports one active shadow config per draw call:
 * a colored glow AND a dark drop-shadow together (e.g. a shout bubble wanting both) need
 * two independent redraws of the same glyphs/shape UNDER the final crisp copy — mirrors
 * how Photoshop composites independent Drop Shadow + Outer Glow layer effects. The
 * underlay passes' own non-shadow pixels are harmless: a shadow offset only moves the
 * shadow, never the source draw, so the underlay's real pixels land exactly where the
 * final crisp pass lands and get fully overpainted by it.
 */
export function drawShadowUnderlayPasses(
  ctx: CanvasRenderingContext2D,
  glow: EffectGlow | undefined,
  dropShadow: EffectShadow | undefined,
  draw: () => void
) {
  if (glow?.enabled) {
    applyShadowState(ctx, glow, 0, 0);
    draw();
  }
  if (dropShadow?.enabled) {
    applyShadowState(ctx, dropShadow, dropShadow.offsetXPx, dropShadow.offsetYPx);
    draw();
  }
  applyShadowState(ctx, null);
}
