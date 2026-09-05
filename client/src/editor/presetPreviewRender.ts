import type { Point } from "../../../shared/src/layoutSchema";
import { createBubble, createCurvedTextElement, resolveBubbleForm, resolveBubbleStyle, resolveCurvedTextStyle } from "../../../shared/src/layoutSchema";
import type { LetteringPreset, PresetTextFields, PresetBackgroundFields } from "../../../shared/src/presets";
import { drawBubbleBackground } from "../../../shared/src/rendering/bubbleBackground";
import { fitCurvedText, drawCurvedText } from "../../../shared/src/rendering/curvedText";
import { drawHorizontalBubble, drawVerticalBubble } from "../export/renderPageToPng";

/** Any fixed placeholder — resolveBubbleForm/resolveBubbleStyle/resolveCurvedTextStyle
 * only use this to look up PER-LANGUAGE OVERRIDE maps, which the synthetic preview
 * bubble/curved-text below never has, so the exact value is irrelevant. */
const PREVIEW_LANG = "__preview__";
const PREVIEW_PRESET_ID = "__preview-preset__";

/** Draws a sample bubble (background + text) reflecting the given in-progress preset
 * fields — used by PresetPreview.tsx for a live preview while editing. Builds a
 * synthetic, never-persisted LetteringPreset + Bubble and resolves/draws them through
 * the EXACT same shared functions the real editor canvas and PNG export use
 * (resolveBubbleForm/Style, drawBubbleBackground, drawHorizontal/VerticalBubble) — no
 * preview-specific drawing logic, so the result is pixel-identical to a real linked
 * bubble. Confirmed safe: those resolvers just do a plain in-memory `presets.find(...)`,
 * no server round-trip, so an unsaved draft preset works exactly like a persisted one. */
export function drawBubblePreview(
  ctx: CanvasRenderingContext2D,
  size: { width: number; height: number },
  text: PresetTextFields,
  background: PresetBackgroundFields,
  sampleText: string,
  svgBoundary: Point[] | null,
  svgOutline: Point[][] | null
): void {
  ctx.clearRect(0, 0, size.width, size.height);
  const draftPreset: LetteringPreset = { id: PREVIEW_PRESET_ID, name: "", text, background };
  const margin = Math.min(size.width, size.height) * 0.12;
  const bubble = createBubble({
    id: "__preview-bubble__",
    x: margin,
    y: margin,
    width: size.width - margin * 2,
    height: size.height - margin * 2,
    shape: "oval",
    presetId: PREVIEW_PRESET_ID,
    text: { [PREVIEW_LANG]: sampleText },
  });
  const form = resolveBubbleForm(bubble, PREVIEW_LANG, [draftPreset]);
  const style = resolveBubbleStyle(bubble, PREVIEW_LANG, [draftPreset]);

  if (form.bubbleStyle !== "none") {
    ctx.save();
    ctx.translate(form.x, form.y);
    drawBubbleBackground(ctx, form, bubble.shape, 1, svgBoundary, undefined, svgOutline);
    ctx.restore();
  }
  if (!sampleText.trim()) return;
  if (style.direction === "vertical-rl") drawVerticalBubble(ctx, bubble, form, sampleText, style);
  else drawHorizontalBubble(ctx, bubble, form, sampleText, style);
}

/** A fixed, gentle horizontal arc spanning a `width`x`height` canvas at vertical-center —
 * curved text has no background/bevel/gradient-fill concept, only the text-style half of
 * a preset applies (see PresetPropertiesPanel.tsx's tabs), so no bubble-shape input is
 * needed here, just a representative curve to hang the text on. */
function previewArcPoints(width: number, height: number): Point[] {
  const midY = height / 2;
  const pad = width * 0.08;
  return [
    { x: pad, y: midY + height * 0.12 },
    { x: width * 0.35, y: midY - height * 0.18 },
    { x: width * 0.65, y: midY - height * 0.18 },
    { x: width - pad, y: midY + height * 0.12 },
  ];
}

export function drawCurvedTextPreview(
  ctx: CanvasRenderingContext2D,
  size: { width: number; height: number },
  text: PresetTextFields,
  sampleText: string
): void {
  ctx.clearRect(0, 0, size.width, size.height);
  if (!sampleText.trim()) return;
  const draftPreset: LetteringPreset = { id: PREVIEW_PRESET_ID, name: "", text, background: {} };
  const points = previewArcPoints(size.width, size.height);
  const el = {
    ...createCurvedTextElement({ id: "__preview-curved__", points, fontFamily: text.fontFamily, fontSize: text.fontSize }),
    presetId: PREVIEW_PRESET_ID,
    text: { [PREVIEW_LANG]: sampleText },
  };
  const style = resolveCurvedTextStyle(el, PREVIEW_LANG, [draftPreset]);
  const fitted = fitCurvedText(ctx, sampleText, style.fontFamily, points, style.fontSize);
  drawCurvedText(
    ctx,
    sampleText,
    points,
    fitted,
    style.fontFamily,
    style.align,
    {
      color: style.color,
      outline: style.textOutline,
      gradient: style.textGradient,
      screentone: style.textScreentone,
      glow: style.textGlow,
      dropShadow: style.textDropShadow,
    },
    1
  );
}
