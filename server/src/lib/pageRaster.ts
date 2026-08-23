import { Canvas, createCanvas, GlobalFonts, loadImage, type Image as NapiImage } from "@napi-rs/canvas";
import type { Bubble, BubbleForm, CurvedTextElement, Panel, PageLayout, Point, TextAlign, TextDirection, TextGradient, TextOutline } from "../../../shared/src/layoutSchema.js";
import {
  resolveBubbleForm,
  resolveBubbleStyle,
  resolveCurvedTextStyle,
  resolvePanelForLanguage,
  cutPanelReplacementFileForLanguage,
  imageFileForLanguage,
} from "../../../shared/src/layoutSchema.js";
import type { LetteringPreset } from "../../../shared/src/presets.js";
import { setCanvasFactory, type CanvasLike } from "../../../shared/src/rendering/canvasFactory.js";
import { paddingRatioFor, fitHorizontalText } from "../../../shared/src/rendering/textLayout.js";
import { drawVerticalText, fitVerticalText } from "../../../shared/src/rendering/verticalTypesetting.js";
import { drawBubbleBackground } from "../../../shared/src/rendering/bubbleBackground.js";
import { drawCutPanelContent } from "../../../shared/src/rendering/cutPanel.js";
import { warpImageIntoQuad, renderPerspectiveText } from "../../../shared/src/rendering/perspective.js";
import { fitCurvedText, drawCurvedText } from "../../../shared/src/rendering/curvedText.js";
import { applyTextFillStyle, drawStyledText, type TextFillStyle } from "../../../shared/src/rendering/textEffects.js";

/**
 * Server-side counterpart to client/src/export/renderPageToPng.ts, using
 * @napi-rs/canvas instead of a browser canvas. Exports composable pieces (rather than
 * one monolithic "render everything" function) so different callers can combine them
 * differently: the vector-PDF exporter (vectorPdf/buildPdfPage.ts) wants background +
 * Cut-Panels + images + bubble SHAPES on one flattened raster layer with real vector
 * text drawn separately on top; the PSD exporter (psdExport.ts) wants each of those as
 * its OWN separate layer, plus one fully-rendered (shape+text) layer per bubble/
 * curved-text element.
 *
 * Known gap (documented, not silently dropped): SVG-contour bubble backgrounds
 * (bubbleStyle "svg") need client/src/export/svgBubbleGeometry.ts's DOMParser-based SVG
 * parsing, which has no Node equivalent yet — such a bubble draws no background shape
 * here (same "not loaded yet" fallback buildBoundaryForStyle() already has for the
 * browser case before its async load resolves, just permanent instead of one frame).
 */

let canvasFactoryInstalled = false;

/** Installs the @napi-rs/canvas-backed offscreen-canvas factory (see canvasFactory.ts) —
 * idempotent, call before any of this module's rendering functions run. */
export function ensurePageRasterReady(): void {
  if (canvasFactoryInstalled) return;
  setCanvasFactory((width, height) => createCanvas(width, height) as unknown as CanvasLike);
  canvasFactoryInstalled = true;
}

/** Registers a font FILE under the family name ctx.font references (e.g. `24px "Anime
 * Ace"`) — must happen before any text measurement/drawing uses that family. Safe to call
 * repeatedly with the same alias (GlobalFonts just re-registers). */
export function registerFont(absolutePath: string, familyAlias: string): void {
  GlobalFonts.registerFromPath(absolutePath, familyAlias);
}

/** A child bubble's x/y/corners are relative to its parent panel's origin — see
 * renderPageToPng.ts's identical helper; duplicated here (and re-exported for
 * vectorPdf/buildPdfPage.ts, which needs the same lookup for quad-bubble corners)
 * rather than moved to shared/, since it's a 4-line, render-context-specific lookup,
 * not general-purpose math. */
export function panelOriginFor(bubble: Bubble, panels: Panel[]): Point {
  const panel = bubble.panelId ? panels.find((p) => p.id === bubble.panelId) : undefined;
  return panel?.origin ?? { x: 0, y: 0 };
}

/** Loads the page's source image, ensuring the canvas factory is installed first. */
export async function loadBaseImage(baseImagePath: string): Promise<NapiImage> {
  ensurePageRasterReady();
  return loadImage(baseImagePath);
}

export function drawBaseImage(ctx: CanvasRenderingContext2D, baseImage: NapiImage, layout: PageLayout): void {
  ctx.drawImage(baseImage as unknown as CanvasImageSource, 0, 0, layout.imageWidth, layout.imageHeight);
}

/** Draws Cut-Panel content (patched hole + moved/replaced content) and placed
 * ImageElements — everything that sits between the base image and the bubbles, in the
 * same order renderPageToPng.ts uses. `baseImage` is needed even here (not just for
 * drawBaseImage) since an unmoved/un-replaced Cut-Panel redraws from it directly. */
export async function drawCutPanelsAndImages(
  ctx: CanvasRenderingContext2D,
  layout: PageLayout,
  languageCode: string,
  baseImage: NapiImage,
  resolveImagePath: (fileName: string) => Promise<string | null>
): Promise<void> {
  const resolvedPanels = layout.panels.map((panel) => resolvePanelForLanguage(panel, languageCode));

  const replacementImages = new Map<string, NapiImage>();
  const replacementFileNames = new Set<string>();
  for (const resolved of resolvedPanels) {
    const fileName = cutPanelReplacementFileForLanguage(resolved.cut, languageCode);
    if (fileName) replacementFileNames.add(fileName);
  }
  await Promise.all(
    [...replacementFileNames].map(async (fileName) => {
      const absPath = await resolveImagePath(fileName);
      if (!absPath) return;
      replacementImages.set(fileName, await loadImage(absPath));
    })
  );

  for (const resolved of resolvedPanels) {
    const replacementFileName = cutPanelReplacementFileForLanguage(resolved.cut, languageCode);
    const replacementImage = replacementFileName ? replacementImages.get(replacementFileName) : undefined;
    drawCutPanelContent(
      ctx,
      resolved,
      baseImage as unknown as CanvasImageSource,
      layout.imageWidth,
      layout.imageHeight,
      1,
      replacementImage as unknown as CanvasImageSource | undefined
    );
  }

  // Placed images render below bubbles (a translated poster patch sits on the artwork;
  // any bubble on top of it should still win) — same order as renderPageToPng.ts.
  for (const element of layout.images) {
    const fileName = imageFileForLanguage(element, languageCode);
    if (!fileName) continue;
    const absPath = await resolveImagePath(fileName);
    if (!absPath) continue;
    const img = await loadImage(absPath);
    const warped = warpImageIntoQuad(element.corners, img as unknown as HTMLImageElement, element.opacity);
    if (warped) ctx.drawImage(warped.canvas as unknown as CanvasImageSource, warped.x, warped.y);
  }
}

/** Draws every non-quad bubble's background SHAPE only (no text) — quad bubbles draw no
 * separate background at all, matching renderPageToPng.ts (a quad bubble's only visual
 * is its perspective-warped text, drawn separately — see drawBubbleElement below for the
 * full shape+text version). */
export function drawBubbleBackgroundsOnly(ctx: CanvasRenderingContext2D, layout: PageLayout, languageCode: string, presets: LetteringPreset[]): void {
  for (const bubble of layout.bubbles) {
    if (bubble.shape === "quad") continue;

    const resolvedForm: BubbleForm = resolveBubbleForm(bubble, languageCode, presets);
    const origin = panelOriginFor(bubble, layout.panels);
    const form = origin.x || origin.y ? { ...resolvedForm, x: resolvedForm.x + origin.x, y: resolvedForm.y + origin.y } : resolvedForm;
    if (form.bubbleStyle === "none") continue;

    ctx.save();
    const cx = form.x + form.width / 2;
    const cy = form.y + form.height / 2;
    if (form.rotation) {
      ctx.translate(cx, cy);
      ctx.rotate((form.rotation * Math.PI) / 180);
      ctx.translate(-cx, -cy);
    }
    ctx.translate(form.x, form.y);
    // svgBoundary is always null here — see this module's doc comment's documented gap.
    drawBubbleBackground(ctx, form, bubble.shape, 1, null);
    ctx.restore();
  }
}

interface ResolvedTextStyle {
  fontSize: number;
  fontFamily: string;
  lineHeight: number;
  align: TextAlign;
  direction: TextDirection;
  color: string;
  textOutline: TextOutline;
  textGradient: TextGradient;
}

function drawHorizontalBubbleRaster(ctx: CanvasRenderingContext2D, bubble: Bubble, form: BubbleForm, text: string, style: ResolvedTextStyle): void {
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

function drawVerticalBubbleRaster(ctx: CanvasRenderingContext2D, bubble: Bubble, form: BubbleForm, text: string, style: ResolvedTextStyle): void {
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

/** Draws ONE bubble fully — background shape (unless "none") plus its text — mirroring
 * renderPageToPng.ts's per-bubble loop body exactly, including the quad-shape
 * perspective-text path. Used by the PSD exporter, which wants one complete raster
 * layer per bubble rather than a single flattened page. */
export function drawBubbleElement(ctx: CanvasRenderingContext2D, bubble: Bubble, layout: PageLayout, languageCode: string, presets: LetteringPreset[]): void {
  const text = bubble.text[languageCode];
  const hasText = !!text && !!text.trim();
  const style = resolveBubbleStyle(bubble, languageCode, presets);

  if (bubble.shape === "quad" && bubble.corners) {
    if (!hasText) return;
    const quadOrigin = panelOriginFor(bubble, layout.panels);
    const corners =
      quadOrigin.x || quadOrigin.y ? bubble.corners.map((c) => ({ x: c.x + quadOrigin.x, y: c.y + quadOrigin.y })) : bubble.corners;
    const warped = renderPerspectiveText(corners, {
      text: text!,
      fontFamily: style.fontFamily,
      fontSize: style.fontSize,
      lineHeight: style.lineHeight,
      align: style.align,
      color: style.color,
      outline: style.textOutline,
      gradient: style.textGradient,
      direction: style.direction,
    });
    if (warped) ctx.drawImage(warped.canvas as unknown as CanvasImageSource, warped.x, warped.y);
    return;
  }

  const resolvedForm: BubbleForm = resolveBubbleForm(bubble, languageCode, presets);
  const origin = panelOriginFor(bubble, layout.panels);
  const form = origin.x || origin.y ? { ...resolvedForm, x: resolvedForm.x + origin.x, y: resolvedForm.y + origin.y } : resolvedForm;
  if (form.bubbleStyle === "none" && !hasText) return;

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
    drawBubbleBackground(ctx, form, bubble.shape, 1, null);
    ctx.restore();
  }
  if (hasText) {
    if (style.direction === "vertical-rl") {
      drawVerticalBubbleRaster(ctx, bubble, form, text!, style);
    } else {
      drawHorizontalBubbleRaster(ctx, bubble, form, text!, style);
    }
  }
  ctx.restore();
}

/** Draws one freestanding curved-text element — mirrors renderPageToPng.ts's
 * curvedTexts loop body. No-op if this element has no text for `languageCode`. */
export function drawCurvedTextElementRaster(ctx: CanvasRenderingContext2D, el: CurvedTextElement, languageCode: string, presets: LetteringPreset[]): void {
  const text = el.text[languageCode];
  if (!text || !text.trim()) return;
  const style = resolveCurvedTextStyle(el, languageCode, presets);
  const fitted = fitCurvedText(ctx, text, style.fontFamily, el.points, style.fontSize);
  drawCurvedText(
    ctx,
    text,
    el.points,
    fitted,
    style.fontFamily,
    style.align,
    { color: style.color, outline: style.textOutline, gradient: style.textGradient },
    1
  );
}

export interface PageBackgroundOptions {
  /** Absolute filesystem path to the page's source image (volume's _empty folder). */
  baseImagePath: string;
  layout: PageLayout;
  languageCode: string;
  presets?: LetteringPreset[];
  /** Resolves an uploaded image's file name (server/data/images, or the project's own
   * assetsDir/images) to an absolute path readable from disk — used for both Cut-Panel
   * replacement images and placed ImageElements. */
  resolveImagePath: (fileName: string) => Promise<string | null>;
}

/** Renders the background raster layer (base image + Cut-Panel content + placed images +
 * bubble background shapes, NO text) for one page/language — returns the finished Canvas
 * so callers can either `.toBuffer("image/png")` it directly or hand it to sharp for CMYK
 * conversion before embedding in a PDF (see vectorPdf/buildPdfPage.ts). Composed from the
 * smaller exported pieces above — see psdExport.ts for a caller that uses them
 * separately instead. */
export async function renderPageBackground(opts: PageBackgroundOptions): Promise<Canvas> {
  ensurePageRasterReady();
  const { baseImagePath, layout, languageCode, resolveImagePath } = opts;
  const presets = opts.presets ?? [];

  const baseImage = await loadBaseImage(baseImagePath);
  const canvas = createCanvas(layout.imageWidth, layout.imageHeight);
  // Cast once here: @napi-rs/canvas's SKRSContext2D is structurally close to but not
  // literally CanvasRenderingContext2D (missing a few browser-only members like
  // drawFocusIfNeeded that nothing in this codebase's shared rendering code uses) — every
  // shared/src/rendering/*.ts function expects the browser type, so this is the one
  // boundary cast instead of one per call site.
  const ctx = canvas.getContext("2d") as unknown as CanvasRenderingContext2D;
  drawBaseImage(ctx, baseImage, layout);
  await drawCutPanelsAndImages(ctx, layout, languageCode, baseImage, resolveImagePath);
  drawBubbleBackgroundsOnly(ctx, layout, languageCode, presets);

  return canvas;
}
