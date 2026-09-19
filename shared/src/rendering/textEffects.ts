import type { BubbleScreentone, EffectGlow, EffectShadow, TextBlur, TextGradient, TextOutline, TextStroke } from "../layoutSchema.js";
import { buildScreentonePattern } from "./screentone.js";

/**
 * Shared text-fill styling (solid color, optional gradient, optional
 * outline, optional glow/drop-shadow) — one place both the live Konva preview and the
 * PNG export set up before drawing glyphs, so an outlined/gradient/glow/shadow bubble
 * looks identical in both. Mirrors the pattern already used for bubble backgrounds/
 * vertical typesetting: one function, called from every text-drawing site. glow/
 * dropShadow are NOT applied here — see drawShadowUnderlayPasses in shadowPasses.ts,
 * which each call site wraps its own draw loop in, once, before calling drawStyledText
 * for the real crisp draw (applyTextFillStyle/drawStyledText themselves stay unaware of
 * shadow state, since ctx.fillStyle/strokeStyle persist independently of ctx.shadow*).
 */
export interface TextFillStyle {
  color: string;
  outline?: TextOutline;
  /** Extra stacked stroke layers drawn BEHIND `outline` and the fill — the classic SFX
   * "black + white + color" concentric border. Empty/undefined = unchanged single-outline
   * behavior. Widths are in the same unscaled units as `outline.widthPx`; they're scaled
   * by `scale` (below) at stroke time, so the construction site must set `scale` too when
   * it populates this. See drawStyledText for the widest-first draw ordering. */
  strokes?: TextStroke[];
  /** The same scale factor passed to applyTextFillStyle — needed by drawStyledText to size
   * the `strokes` passes (applyTextFillStyle only ever sets the single `outline`'s
   * lineWidth). Defaults to 1 when unset, so a call site that never uses `strokes` is
   * unaffected. */
  scale?: number;
  gradient?: TextGradient;
  /** Fills with a procedural screentone/halftone pattern instead of a solid color or
   * gradient — wins over both when enabled (see applyTextFillStyle). For the two
   * call sites that draw glyphs with their own per-glyph rotation (curvedText.ts always,
   * verticalTypesetting.ts's rotated-token case), a plain `ctx.fillStyle = pattern`
   * would misalign per glyph — see drawScreentoneMaskedGlyphs in textScreentone.ts for
   * why and how those two sites route around it. */
  screentone?: BubbleScreentone;
  glow?: EffectGlow;
  dropShadow?: EffectShadow;
  /** Gaussian/motion blur of the whole text block (see blurPass.ts). Applied by the block-
   * drawing call sites (they wrap their draw with drawWithTextBlur), not by drawStyledText. */
  blur?: TextBlur;
}

/**
 * Sets ctx.fillStyle (solid color or a gradient spanning `bboxX/Y/W/H`) and,
 * if an outline is enabled, ctx.strokeStyle/lineWidth/lineJoin too. Call once
 * per text block — the gradient must span the whole block, not be rebuilt per
 * line, or it would look banded instead of one continuous fade. `bboxX/Y/W/H`
 * and `scale` are in the same units as the fillText calls that follow.
 */
export function applyTextFillStyle(
  ctx: CanvasRenderingContext2D,
  style: TextFillStyle,
  bboxX: number,
  bboxY: number,
  bboxW: number,
  bboxH: number,
  scale: number
) {
  if (style.screentone?.enabled) {
    ctx.fillStyle = buildScreentonePattern(ctx, style.screentone, scale);
  } else if (style.gradient?.enabled) {
    const rad = (style.gradient.angleDeg * Math.PI) / 180;
    const dx = Math.cos(rad);
    const dy = Math.sin(rad);
    const halfDiag = Math.max(1, Math.hypot(bboxW, bboxH) / 2);
    const cx = bboxX + bboxW / 2;
    const cy = bboxY + bboxH / 2;
    const gradient = ctx.createLinearGradient(cx - dx * halfDiag, cy - dy * halfDiag, cx + dx * halfDiag, cy + dy * halfDiag);
    gradient.addColorStop(0, style.gradient.colorStart);
    gradient.addColorStop(1, style.gradient.colorEnd);
    ctx.fillStyle = gradient;
  } else {
    ctx.fillStyle = style.color;
  }

  if (style.outline?.enabled) {
    ctx.lineJoin = "round";
    ctx.miterLimit = 2;
    ctx.lineWidth = Math.max(1, style.outline.widthPx * scale);
    ctx.strokeStyle = style.outline.color;
  }
}

/** The widest stroke width (unscaled px) any text-stroke pass will draw — the enabled
 * `outline` plus every `strokes` layer. Used by the per-glyph rotated renderers
 * (curvedText.ts, verticalTypesetting.ts's rotated-token case) to pad their offscreen
 * buffers / screentone-mask bounds so a wide stacked stroke isn't clipped. Returns 0 when
 * there's no stroking at all. */
export function maxTextStrokeWidthPx(style: TextFillStyle): number {
  let max = style.outline?.enabled ? style.outline.widthPx : 0;
  for (const s of style.strokes ?? []) max = Math.max(max, s.widthPx);
  return max;
}

/** Draws one line/glyph run with the outline (if enabled, stroked first so it forms a
 * border behind the fill) then the fill — call after applyTextFillStyle. Any `style.strokes`
 * layers are drawn first of all, widest-first, so they sit behind the main `outline` and
 * the fill (concentric SFX border). `mode` lets a caller split stroke/fill into separate
 * passes (see textScreentone.ts's masked-glyph technique, which needs every stroke drawn
 * solid, unmasked, directly on the real canvas — a stroke has no CTM-phase problem, only a
 * patterned fill does — and only the fill routed through the offscreen mask); every
 * existing call site keeps its default "both", unaffected. */
export function drawStyledText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  style: TextFillStyle,
  mode: "both" | "strokeOnly" | "fillOnly" = "both"
) {
  if (mode !== "fillOnly") {
    // Extra stacked strokes, widest first (so wider layers sit furthest back), drawn
    // before the main outline. applyTextFillStyle only configured the main outline's
    // stroke state, so we set (and restore) our own per layer here.
    if (style.strokes?.length) {
      const scale = style.scale ?? 1;
      const prevWidth = ctx.lineWidth;
      const prevStroke = ctx.strokeStyle;
      const prevJoin = ctx.lineJoin;
      const prevMiter = ctx.miterLimit;
      ctx.lineJoin = "round";
      ctx.miterLimit = 2;
      for (const s of [...style.strokes].sort((a, b) => b.widthPx - a.widthPx)) {
        ctx.lineWidth = Math.max(1, s.widthPx * scale);
        ctx.strokeStyle = s.color;
        ctx.strokeText(text, x, y);
      }
      ctx.lineWidth = prevWidth;
      ctx.strokeStyle = prevStroke;
      ctx.lineJoin = prevJoin;
      ctx.miterLimit = prevMiter;
    }
    if (style.outline?.enabled) {
      ctx.strokeText(text, x, y);
    }
  }
  if (mode !== "strokeOnly") {
    ctx.fillText(text, x, y);
  }
}
