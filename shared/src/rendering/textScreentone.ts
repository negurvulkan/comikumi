import type { BubbleScreentone } from "../layoutSchema.js";
import { createOffscreenCanvas } from "./canvasFactory.js";
import { buildScreentonePattern } from "./screentone.js";

export interface ScreentoneMaskBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Fills an already-per-glyph-rotated block of text with a screentone pattern via an
 * offscreen mask + `source-in` composite, instead of a plain `ctx.fillStyle = pattern`.
 *
 * Why this is needed at all: a CanvasPattern anchors its tile-repeat origin to whatever
 * CTM is active AT FILL TIME (unlike CanvasGradient, which bakes its coordinate space in
 * at CREATION time — see applyBubbleFillStyle's own doc comments for that established
 * distinction). Most text-drawing call sites share one ambient CTM across every glyph in
 * a block (plain `ctx.fillText(text, x, y)` with no per-glyph transform), so a plain
 * pattern swap in applyTextFillStyle already works there, exactly like gradient does.
 * But curvedText.ts's per-character loop (always) and verticalTypesetting.ts's rotated-
 * token case each do their own `ctx.save(); ctx.translate(...); ctx.rotate(...); ...;
 * ctx.restore();` PER GLYPH — reusing one pattern object across those would give every
 * glyph an independently phase-shifted dot pattern instead of one continuous field.
 *
 * The fix: render the block's existing (UNMODIFIED) per-glyph fill-only draw logic into
 * a small offscreen canvas — `drawFillOnly` is literally the same loop the caller already
 * had, just redirected to a translated offscreen context instead of the real one — then
 * `source-in` composite the screentone pattern through whatever alpha shape resulted,
 * then blit the one flat bitmap back with a single drawImage. Once baked into pixels,
 * per-glyph rotation is no longer a CTM concern for anything downstream.
 *
 * Any enabled outline must be drawn SEPARATELY, unmasked, directly on the real `ctx`
 * (solid `strokeStyle` has no CTM-phase problem) — see drawStyledText's `mode` param.
 */
export function drawScreentoneMaskedGlyphs(
  ctx: CanvasRenderingContext2D,
  bounds: ScreentoneMaskBounds,
  screentone: BubbleScreentone,
  scale: number,
  mirrorTextState: (maskCtx: CanvasRenderingContext2D) => void,
  drawFillOnly: (maskCtx: CanvasRenderingContext2D) => void
): void {
  // Oversample to match the ambient CTM's real device-pixel density — a fresh offscreen
  // canvas gets none of the sharpness a native fillText call gets "for free" under
  // editor zoom / HiDPI / export-resolution scaling. ctx.getTransform() reads the ACTUAL
  // CTM (Konva's interactive zoom is a separate prop never folded into the `scale`
  // parameter already threaded through these functions), so this one mechanism
  // transparently covers zoom, HiDPI, and 2x/3x PNG export all at once.
  const ctm = ctx.getTransform();
  const oversample = Math.max(1, Math.min(4, Math.max(Math.hypot(ctm.a, ctm.b), Math.hypot(ctm.c, ctm.d))));

  const w = Math.max(1, Math.ceil(bounds.width * oversample));
  const h = Math.max(1, Math.ceil(bounds.height * oversample));
  const mask = createOffscreenCanvas(w, h);
  const maskCtx = mask.getContext("2d");
  maskCtx.scale(oversample, oversample);
  maskCtx.translate(-bounds.x, -bounds.y);

  mirrorTextState(maskCtx);
  drawFillOnly(maskCtx);

  maskCtx.globalCompositeOperation = "source-in";
  maskCtx.fillStyle = buildScreentonePattern(maskCtx, screentone, scale);
  maskCtx.fillRect(bounds.x, bounds.y, bounds.width, bounds.height);

  ctx.drawImage(mask as unknown as HTMLCanvasElement, bounds.x, bounds.y, bounds.width, bounds.height);
}
