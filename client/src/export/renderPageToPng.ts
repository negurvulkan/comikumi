import type {
  Bubble,
  BubbleForm,
  CurvedTextElement,
  EffectGlow,
  EffectShadow,
  ImageElement,
  PageLayout,
  Panel,
  Point,
  TextAlign,
  TextDirection,
  TextGradient,
  TextOutline,
} from "../../../shared/src/layoutSchema";
import {
  cutPanelReplacementFileForLanguage,
  imageFileForLanguage,
  pageLayerOrder,
  resolveBubbleForm,
  resolveBubbleStyle,
  resolveCurvedTextStyle,
  resolvePanelForLanguage,
} from "../../../shared/src/layoutSchema";
import type { LetteringPreset } from "../../../shared/src/presets";
import { fitHorizontalText, textBoxFor } from "../../../shared/src/rendering/textLayout";
import { drawVerticalText, fitVerticalText } from "../../../shared/src/rendering/verticalTypesetting";
import { renderPerspectiveText, warpImageIntoQuad } from "../../../shared/src/rendering/perspective";
import { drawBubbleBackground } from "../../../shared/src/rendering/bubbleBackground";
import { applyTextFillStyle, drawStyledText, type TextFillStyle } from "../../../shared/src/rendering/textEffects";
import { drawShadowUnderlayPasses } from "../../../shared/src/rendering/shadowPasses";
import { drawCurvedText, fitCurvedText } from "../../../shared/src/rendering/curvedText";
import { ensureSvgBubbleBoundaryLoaded, getCachedSvgBubbleBoundary } from "./svgBubbleGeometry";
import { drawCutPanelForeground, fillCutPanelHole } from "../../../shared/src/rendering/cutPanel";
import { resolveMergeGroups, computeMergedBoundary } from "./bubbleMerge";

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
  balloonAwareWrap: boolean | undefined;
  color: string;
  textOutline: TextOutline;
  textGradient: TextGradient;
  textGlow: EffectGlow;
  textDropShadow: EffectShadow;
}

export function drawHorizontalBubble(
  ctx: CanvasRenderingContext2D,
  bubble: Bubble,
  form: BubbleForm,
  text: string,
  style: ResolvedStyle,
  mergedBounds?: { x: number; y: number; width: number; height: number }
) {
  const box = textBoxFor(form.bubbleStyle, bubble.shape, form, 1, mergedBounds);

  // See BubbleShape.tsx's identical carve-out: a merged group's boundary
  // isn't a clean ellipse, and a clip line isn't accounted for by the
  // closed-form ellipse formula — both fall back to the flat box either way.
  const balloonGeometry =
    bubble.shape === "oval" && style.balloonAwareWrap && !mergedBounds && !(form.clipA && form.clipB)
      ? { shape: bubble.shape, balloonAwareWrap: style.balloonAwareWrap, bubbleWidth: form.width, bubbleHeight: form.height }
      : undefined;

  const { fontSize: size, lines, lineStep, blockHeight } = fitHorizontalText(
    ctx,
    text,
    style.fontFamily,
    style.lineHeight,
    box.width,
    box.height,
    style.fontSize,
    balloonGeometry
  );

  ctx.font = `${size}px "${style.fontFamily}"`;
  ctx.textBaseline = "middle";
  ctx.textAlign = style.align;
  ctx.direction = style.direction === "rtl" ? "rtl" : "ltr";

  const startY = form.y + box.y + box.height / 2 - blockHeight / 2 + lineStep / 2;
  const centerX = form.x + box.x + box.width / 2;
  const anchorX = style.align === "left" ? form.x + box.x : style.align === "right" ? form.x + box.x + box.width : centerX;

  const fillStyle: TextFillStyle = {
    color: style.color,
    outline: style.textOutline,
    gradient: style.textGradient,
    glow: style.textGlow,
    dropShadow: style.textDropShadow,
  };
  applyTextFillStyle(ctx, fillStyle, form.x, startY - lineStep / 2, form.width, blockHeight, 1);

  const drawAllLines = () => {
    lines.forEach((line, i) => {
      drawStyledText(ctx, line.text, anchorX, startY + i * lineStep, fillStyle);
    });
  };
  drawShadowUnderlayPasses(ctx, fillStyle.glow, fillStyle.dropShadow, drawAllLines);
  drawAllLines();
}

export function drawVerticalBubble(
  ctx: CanvasRenderingContext2D,
  bubble: Bubble,
  form: BubbleForm,
  text: string,
  style: ResolvedStyle,
  mergedBounds?: { x: number; y: number; width: number; height: number }
) {
  const box = textBoxFor(form.bubbleStyle, bubble.shape, form, 1, mergedBounds);

  const balloonGeometry =
    bubble.shape === "oval" && style.balloonAwareWrap && !mergedBounds && !(form.clipA && form.clipB)
      ? { shape: bubble.shape, balloonAwareWrap: style.balloonAwareWrap, bubbleWidth: form.width, bubbleHeight: form.height }
      : undefined;

  const fitted = fitVerticalText(text, style.lineHeight, box.width, box.height, style.fontSize, balloonGeometry);
  drawVerticalText(ctx, fitted, form.x + box.x + box.width / 2, form.y + box.y + box.height / 2, box.width, {
    fontFamily: style.fontFamily,
    color: style.color,
    align: style.align,
    outline: style.textOutline,
    gradient: style.textGradient,
    glow: style.textGlow,
    dropShadow: style.textDropShadow,
    scale: 1,
  });
}

export type RasterImageFormat = "png" | "jpeg" | "webp";

export interface RasterExportOptions {
  /** Output container/codec. Defaults to "png" (lossless, matches prior behavior). */
  format?: RasterImageFormat;
  /** 0-1, only meaningful for "jpeg"/"webp" — browsers ignore it for "png". */
  quality?: number;
  /** Resolution multiplier applied to the layout's native pixel size (e.g. 2 = 2x/"retina"). */
  scale?: number;
}

const MIME_TYPE_BY_FORMAT: Record<RasterImageFormat, string> = {
  png: "image/png",
  jpeg: "image/jpeg",
  webp: "image/webp",
};

/** Shared by renderPageToPng and the uniform-format export path (useNormalizeRun.ts),
 * which needs a second toBlob() call after resizing the already-rendered canvas. */
export function canvasToBlob(canvas: HTMLCanvasElement, format: RasterImageFormat = "png", quality?: number): Promise<Blob> {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new Error("Bild-Export fehlgeschlagen"));
      },
      MIME_TYPE_BY_FORMAT[format],
      quality
    );
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
  presets: LetteringPreset[] = [],
  exportOptions: RasterExportOptions = {}
): Promise<Blob> {
  const { format = "png", quality, scale = 1 } = exportOptions;
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(layout.imageWidth * scale);
  canvas.height = Math.round(layout.imageHeight * scale);
  const maybeCtx = canvas.getContext("2d");
  if (!maybeCtx) throw new Error("2D-Canvas-Kontext konnte nicht erstellt werden");
  // Rebound as its own const (rather than just narrowing `maybeCtx` in place) so the
  // narrowed non-null type is visible inside the drawOne*() function declarations below —
  // TS's flow narrowing for a closed-over variable doesn't reliably propagate into a
  // hoisted function declaration referencing the original binding.
  const ctx: CanvasRenderingContext2D = maybeCtx;
  // Every drawing call below works in the layout's native pixel units — scaling the
  // context once up front (rather than threading a scale factor through every draw
  // call) lets the whole render pipeline stay resolution-agnostic.
  if (scale !== 1) ctx.scale(scale, scale);

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

  // Pre-resolve every non-quad bubble's absolute form (panel-origin baked in) up front —
  // needed both by the main per-bubble draw loop below and by merge-group members, whose
  // own geometry must be available even for the group members that aren't drawn
  // individually (see resolveMergeGroups/computeMergedBoundary in bubbleMerge.ts).
  const resolvedForms = new Map<string, BubbleForm>();
  for (const b of layout.bubbles) {
    if (b.shape === "quad") continue;
    const resolved = resolveBubbleForm(b, languageCode, presets);
    const origin = panelOriginFor(b, layout.panels);
    resolvedForms.set(b.id, origin.x || origin.y ? { ...resolved, x: resolved.x + origin.x, y: resolved.y + origin.y } : resolved);
  }
  const mergeGroups = resolveMergeGroups(layout.bubbles);

  async function drawOneImage(element: ImageElement): Promise<void> {
    if (!loadPlacedImage) return;
    const fileName = imageFileForLanguage(element, languageCode);
    if (!fileName) return;
    const img = await loadPlacedImage(fileName);
    const warped = warpImageIntoQuad(element.corners, img, element.opacity);
    if (warped) ctx.drawImage(warped.canvas, warped.x, warped.y);
  }

  function drawOneBubble(bubble: Bubble): void {
    const text = bubble.text[languageCode];
    const hasText = !!text && !!text.trim();
    const style = resolveBubbleStyle(bubble, languageCode, presets);

    if (bubble.shape === "quad" && bubble.corners) {
      if (!hasText) return;
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
        glow: style.textGlow,
        dropShadow: style.textDropShadow,
        direction: style.direction,
      });
      if (warped) ctx.drawImage(warped.canvas, warped.x, warped.y);
      return;
    }

    // Non-primary merge-group members contribute their geometry to the primary's unified
    // outline (below) but are never drawn on their own — a stale/lone mergeGroupId (the
    // other member deleted, or filtered out for being a "quad") falls back to drawing
    // this bubble normally instead of silently vanishing.
    const group = bubble.mergeGroupId ? mergeGroups.get(bubble.mergeGroupId) : undefined;
    const isMerged = !!group && group.length >= 2;
    if (isMerged && !bubble.mergePrimary) return;

    const form = resolvedForms.get(bubble.id)!;
    // A bubble with a visible background is real page artwork now, not just
    // an invisible text overlay — it must still be drawn even when this
    // language has no translation yet (e.g. a batch export of an
    // untranslated language shouldn't leave a newly-added bubble missing).
    if (form.bubbleStyle === "none" && !hasText) return;

    let precomputedBoundary: Point[] | undefined;
    let mergedBounds: { x: number; y: number; width: number; height: number } | undefined;
    if (isMerged) {
      const members = group!.map((m) => ({
        bubble: m,
        form: resolvedForms.get(m.id)!,
        svgBoundary: getCachedSvgBubbleBoundary(m.svgFileName),
      }));
      const primary = members.find((m) => m.bubble.id === bubble.id)!;
      precomputedBoundary = computeMergedBoundary(members, primary);
      const xs = precomputedBoundary.map((p) => p.x);
      const ys = precomputedBoundary.map((p) => p.y);
      const minX = Math.min(...xs);
      const minY = Math.min(...ys);
      mergedBounds = { x: minX, y: minY, width: Math.max(...xs) - minX, height: Math.max(...ys) - minY };
    }

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
      drawBubbleBackground(ctx, form, bubble.shape, 1, getCachedSvgBubbleBoundary(form.svgFileName), precomputedBoundary);
      ctx.restore();
    }
    if (hasText) {
      if (style.direction === "vertical-rl") {
        drawVerticalBubble(ctx, bubble, form, text, style, mergedBounds);
      } else {
        drawHorizontalBubble(ctx, bubble, form, text, style, mergedBounds);
      }
    }
    ctx.restore();
  }

  function drawOneCurvedText(el: CurvedTextElement): void {
    const text = el.text[languageCode];
    if (!text || !text.trim()) return;
    const style = resolveCurvedTextStyle(el, languageCode, presets);
    const fitted = fitCurvedText(ctx, text, style.fontFamily, el.points, style.fontSize);
    drawCurvedText(ctx, text, el.points, fitted, style.fontFamily, style.align, {
      color: style.color,
      outline: style.textOutline,
      gradient: style.textGradient,
      glow: style.textGlow,
      dropShadow: style.textDropShadow,
    }, 1);
  }

  // Bottom-to-top paint order across images/bubbles/curved texts (see
  // layoutSchema.ts's pageLayerOrder) — without any layerOrderOverride set anywhere,
  // this is byte-for-byte the same order rendering already used before layer ordering
  // existed (images, then bubbles, then curved texts).
  for (const item of pageLayerOrder(layout)) {
    if (item.type === "image") {
      const element = layout.images.find((i) => i.id === item.id);
      if (element) await drawOneImage(element);
    } else if (item.type === "bubble") {
      const bubble = layout.bubbles.find((b) => b.id === item.id);
      if (bubble) drawOneBubble(bubble);
    } else {
      const el = layout.curvedTexts.find((c) => c.id === item.id);
      if (el) drawOneCurvedText(el);
    }
  }

  return canvasToBlob(canvas, format, quality);
}
