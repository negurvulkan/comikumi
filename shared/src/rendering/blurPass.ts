import type { TextBlur } from "../layoutSchema.js";

/**
 * Runs `drawBlock` (a re-runnable closure that paints the whole text block onto `ctx`)
 * with a blur applied, or straight through when blur is off/zero. Shared by every text
 * layout path (horizontal, vertical, curved, perspective) so blur looks the same
 * everywhere. Two kinds:
 *
 * - **gaussian**: a uniform soft blur via `ctx.filter = blur(px)` (supported by both the
 *   browser and the server's @napi-rs/canvas). The block is drawn once under the filter.
 * - **motion**: a directional smear — the block is composited several times, offset along
 *   `angleDeg` from `-dist/2` to `+dist/2`, each at reduced alpha, since neither canvas
 *   has a native motion-blur primitive. Portable and works identically on both.
 *
 * `radiusPx` is in the same unscaled units as outline widthPx; `scale` matches the caller's
 * (export multiplier / editor zoom factor), applied here exactly like outline `widthPx * scale`.
 */
export function drawWithTextBlur(
  ctx: CanvasRenderingContext2D,
  blur: TextBlur | undefined,
  scale: number,
  drawBlock: () => void
): void {
  if (!blur?.enabled || blur.radiusPx <= 0) {
    drawBlock();
    return;
  }
  const amount = blur.radiusPx * scale;
  if (blur.kind === "motion") {
    const rad = (blur.angleDeg * Math.PI) / 180;
    // One sample per ~1px of smear, clamped so a huge distance can't explode the draw count.
    const samples = Math.max(2, Math.min(24, Math.ceil(amount)));
    const prevAlpha = ctx.globalAlpha;
    ctx.globalAlpha = prevAlpha / samples;
    for (let i = 0; i < samples; i++) {
      const t = i / (samples - 1) - 0.5; // -0.5 .. +0.5
      ctx.save();
      ctx.translate(Math.cos(rad) * amount * t, Math.sin(rad) * amount * t);
      drawBlock();
      ctx.restore();
    }
    ctx.globalAlpha = prevAlpha;
  } else {
    const prev = ctx.filter && ctx.filter !== "none" ? ctx.filter : "";
    ctx.filter = prev ? `${prev} blur(${amount}px)` : `blur(${amount}px)`;
    drawBlock();
    ctx.filter = prev || "none";
  }
}
