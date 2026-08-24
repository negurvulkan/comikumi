import type { Bubble, BubbleForm, PageLayout, Panel, Point, TextAlign, TextDirection, TextGradient, TextOutline } from "../../../shared/src/layoutSchema";
import {
  cutPanelReplacementFileForLanguage,
  imageFileForLanguage,
  resolveBubbleForm,
  resolveBubbleStyle,
  resolveCurvedTextStyle,
  resolvePanelForLanguage,
} from "../../../shared/src/layoutSchema";
import type { LetteringPreset } from "../../../shared/src/presets";
import { paddingRatioFor, fitHorizontalText } from "../../../shared/src/rendering/textLayout";
import { drawVerticalText, fitVerticalText } from "../../../shared/src/rendering/verticalTypesetting";
import { renderPerspectiveText, warpImageIntoQuad } from "../../../shared/src/rendering/perspective";
import { drawBubbleBackground } from "../../../shared/src/rendering/bubbleBackground";
import { applyTextFillStyle, drawStyledText, type TextFillStyle } from "../../../shared/src/rendering/textEffects";
import { drawCurvedText, fitCurvedText } from "../../../shared/src/rendering/curvedText";
import { ensureSvgBubbleBoundaryLoaded, getCachedSvgBubbleBoundary } from "./svgBubbleGeometry";
import { drawCutPanelForeground, fillCutPanelHole } from "../../../shared/src/rendering/cutPanel";

/** A child bubble's x/y/corners are relative to its parent panel's origin (see
 * PanelPointsSchema.origin) — unlike the live Konva canvas, this is a plain 2D-context
 * renderer with no parent-transform to lean on, so the origin must be added back in
 * explicitly before any of the drawing math below runs. Unassigned/stale-panelId bubbles
 * resolve to {x:0,y:0} (a no-op shift), matching how they're already absolute today. */
function panelOriginFor(bubble: Bubble, panels: Panel[]): Point {
  const panel = bubble.panelId ? panels.find((p) => p.id === bubble.panelId) : undefined;
  return panel?.origin ?? { x: 0, y: 0 };
}

interface ResolvedStyle {
  fontSize: number;
  fontFamily: string;
  lineHeight: number;
  align: TextAlign;
  direction: TextDirection;
  color: string;
  textOutline: TextOutline;
  textGradient: TextGradient;
}

function drawHorizontalBubble(ctx: CanvasRenderingContext2D, bubble: Bubble, form: BubbleForm, text: string, style: ResolvedStyle) {
  const ratio = paddingRatioFor(form.bubbleStyle, bubble.shape);
  const boxWidth = form.width * (1 - ratio);
  const boxHeight = form.height * (1 - ratio);

  const { fontSize: size, lines, lineStep, blockHeight } = fitHorizontalText(
    ctx,
    text,
    style.fontFamily,
    style.lineHeight,
    boxWidth,
    boxHeight,
    style.fontSize
  );

  ctx.font = `${size}px "${style.fontFamily}"`;
  ctx.textBaseline = "middle";
  ctx.textAlign = style.align;
  ctx.direction = style.direction === "rtl" ? "rtl" : "ltr";

  const startY = form.y + form.height / 2 - blockHeight / 2 + lineStep / 2;
  const centerX = form.x + form.width / 2;
  const anchorX = style.align === "left" ? form.x + (form.width - boxWidth) / 2 : style.align === "right" ? form.x + form.width - (form.width - boxWidth) / 2 : centerX;

  const fillStyle: TextFillStyle = { color: style.color, outline: style.textOutline, gradient: style.textGradient };
  applyTextFillStyle(ctx, fillStyle, form.x, startY - lineStep / 2, form.width, blockHeight, 1);

  lines.forEach((line, i) => {
    drawStyledText(ctx, line.text, anchorX, startY + i * lineStep, fillStyle);
  });
}

function drawVerticalBubble(ctx: CanvasRenderingContext2D, bubble: Bubble, form: BubbleForm, text: string, style: ResolvedStyle) {
  const ratio = paddingRatioFor(form.bubbleStyle, bubble.shape);
  const boxWidth = form.width * (1 - ratio);
  const boxHeight = form.height * (1 - ratio);

  const fitted = fitVerticalText(text, style.lineHeight, boxWidth, boxHeight, style.fontSize);
  drawVerticalText(ctx, fitted, form.x + form.width / 2, form.y + form.height / 2, boxWidth, {
    fontFamily: style.fontFamily,
    color: style.color,
    align: style.align,
    outline: style.textOutline,
    gradient: style.textGradient,
    scale: 1,
  });
}

export async function renderPageToPng(
  baseImage: HTMLImageElement,
  layout: PageLayout,
  languageCode: string,
  /** Resolves an uploaded image's file name (see server/data/images) to a loaded HTMLImageElement. */
  loadPlacedImage?: (fileName: string) => Promise<HTMLImageElement>,
  /** Projectwide style presets — must match what the live editor preview resolves
   * against, or the exported PNG would visually diverge from what the translator saw. */
  presets: LetteringPreset[] = []
): Promise<Blob> {
  const canvas = document.createElement("canvas");
  canvas.width = layout.imageWidth;
  canvas.height = layout.imageHeight;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("2D-Canvas-Kontext konnte nicht erstellt werden");

  ctx.drawImage(baseImage, 0, 0, layout.imageWidth, layout.imageHeight);

  // Cut-Panel replacement images (if any) must be loaded before the synchronous draw
  // loop below — same preload-then-draw shape as the SVG bubble contours further down,
  // since drawCutPanelContent() itself stays fully synchronous.
  // Resolved once per panel for the language being exported — the same panel can be a
  // plain untouched marker in one language and a moved/removed/replaced Cut-Panel in
  // another (see Panel.languageOverride's doc comment / resolvePanelForLanguage()).
  const resolvedPanels = layout.panels.map((panel) => resolvePanelForLanguage(panel, languageCode));

  const replacementImages = new Map<string, HTMLImageElement>();
  if (loadPlacedImage) {
    const replacementFileNames = new Set<string>();
    for (const resolved of resolvedPanels) {
      const fileName = cutPanelReplacementFileForLanguage(resolved.cut, languageCode);
      if (fileName) replacementFileNames.add(fileName);
    }
    await Promise.all(
      [...replacementFileNames].map(async (fileName) => {
        replacementImages.set(fileName, await loadPlacedImage(fileName));
      })
    );
  }

  // Cut-Panels: patch every vacated original spot FIRST, then draw every panel's
  // detached content — see drawCutPanelForeground's doc comment for why this must be two
  // full passes rather than fill-then-draw interleaved per panel (a swap between two
  // Cut-Panels lands one's vacated spot exactly where the other's content now sits; doing
  // fill+draw per panel would let a later panel's hole-fill erase an earlier panel's
  // already-drawn content there). Runs before placed images/bubbles/curved texts so those
  // still layer normally on top. A no-op for any Panel without `.cut`.
  for (const resolved of resolvedPanels) fillCutPanelHole(ctx, resolved, 1);
  for (const resolved of resolvedPanels) {
    const replacementFileName = cutPanelReplacementFileForLanguage(resolved.cut, languageCode);
    const replacementImage = replacementFileName ? replacementImages.get(replacementFileName) : undefined;
    drawCutPanelForeground(ctx, resolved, baseImage, layout.imageWidth, layout.imageHeight, 1, replacementImage);
  }

  // SVG bubble contours are parsed asynchronously and cached (see
  // svgBubbleGeometry.ts) — every distinct file referenced by this layout
  // (base form or any per-language formOverride) must be loaded before the
  // synchronous draw loop below runs, or that bubble would draw empty.
  const svgFileNames = new Set<string>();
  for (const bubble of layout.bubbles) {
    if (bubble.svgFileName) svgFileNames.add(bubble.svgFileName);
    for (const override of Object.values(bubble.formOverride ?? {})) {
      if (override.svgFileName) svgFileNames.add(override.svgFileName);
    }
  }
  await Promise.all([...svgFileNames].map((fileName) => ensureSvgBubbleBoundaryLoaded(fileName)));

  // Placed images render below text bubbles (a translated poster patch sits
  // on the artwork; any bubble on top of it should still win).
  if (loadPlacedImage) {
    for (const element of layout.images) {
      const fileName = imageFileForLanguage(element, languageCode);
      if (!fileName) continue;
      const img = await loadPlacedImage(fileName);
      const warped = warpImageIntoQuad(element.corners, img, element.opacity);
      if (warped) ctx.drawImage(warped.canvas, warped.x, warped.y);
    }
  }

  for (const bubble of layout.bubbles) {
    const text = bubble.text[languageCode];
    const hasText = !!text && !!text.trim();
    const style = resolveBubbleStyle(bubble, languageCode, presets);

    if (bubble.shape === "quad" && bubble.corners) {
      if (!hasText) continue;
      const quadOrigin = panelOriginFor(bubble, layout.panels);
      const corners =
        quadOrigin.x || quadOrigin.y ? bubble.corners.map((c) => ({ x: c.x + quadOrigin.x, y: c.y + quadOrigin.y })) : bubble.corners;
      const warped = renderPerspectiveText(corners, {
        text,
        fontFamily: style.fontFamily,
        fontSize: style.fontSize,
        lineHeight: style.lineHeight,
        align: style.align,
        color: style.color,
        outline: style.textOutline,
        gradient: style.textGradient,
        direction: style.direction,
      });
      if (warped) ctx.drawImage(warped.canvas, warped.x, warped.y);
      continue;
    }

    const resolvedForm = resolveBubbleForm(bubble, languageCode, presets);
    const origin = panelOriginFor(bubble, layout.panels);
    const form = origin.x || origin.y ? { ...resolvedForm, x: resolvedForm.x + origin.x, y: resolvedForm.y + origin.y } : resolvedForm;
    // A bubble with a visible background is real page artwork now, not just
    // an invisible text overlay — it must still be drawn even when this
    // language has no translation yet (e.g. a batch export of an
    // untranslated language shouldn't leave a newly-added bubble missing).
    if (form.bubbleStyle === "none" && !hasText) continue;

    ctx.save();
    const cx = form.x + form.width / 2;
    const cy = form.y + form.height / 2;
    if (form.rotation) {
      ctx.translate(cx, cy);
      ctx.rotate((form.rotation * Math.PI) / 180);
      ctx.translate(-cx, -cy);
    }
    if (form.bubbleStyle !== "none") {
      ctx.save();
      ctx.translate(form.x, form.y);
      drawBubbleBackground(ctx, form, bubble.shape, 1, getCachedSvgBubbleBoundary(form.svgFileName));
      ctx.restore();
    }
    if (hasText) {
      if (style.direction === "vertical-rl") {
        drawVerticalBubble(ctx, bubble, form, text, style);
      } else {
        drawHorizontalBubble(ctx, bubble, form, text, style);
      }
    }
    ctx.restore();
  }

  // Freestanding title/effect text on a Bézier path — drawn after bubbles so
  // titles/effects sit visually on top, same order as the editor preview.
  for (const el of layout.curvedTexts) {
    const text = el.text[languageCode];
    if (!text || !text.trim()) continue;
    const style = resolveCurvedTextStyle(el, languageCode, presets);
    const fitted = fitCurvedText(ctx, text, style.fontFamily, el.points, style.fontSize);
    drawCurvedText(ctx, text, el.points, fitted, style.fontFamily, style.align, {
      color: style.color,
      outline: style.textOutline,
      gradient: style.textGradient,
    }, 1);
  }

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("PNG-Export fehlgeschlagen"));
    }, "image/png");
  });
}
