import type { TextGradient, TextOutline } from "../../../shared/src/layoutSchema";

/**
 * Shared text-fill styling (solid color, optional gradient, optional
 * outline) — one place both the live Konva preview and the PNG export set up
 * before drawing glyphs, so an outlined/gradient bubble looks identical in
 * both. Mirrors the pattern already used for bubble backgrounds/vertical
 * typesetting: one function, called from every text-drawing site.
 */
export interface TextFillStyle {
  color: string;
  outline?: TextOutline;
  gradient?: TextGradient;
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
  if (style.gradient?.enabled) {
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

/** Draws one line/glyph run with the outline (if enabled, stroked first so it forms a border behind the fill) then the fill — call after applyTextFillStyle. */
export function drawStyledText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, style: TextFillStyle) {
  if (style.outline?.enabled) {
    ctx.strokeText(text, x, y);
  }
  ctx.fillText(text, x, y);
}
