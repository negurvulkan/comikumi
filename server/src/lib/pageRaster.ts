import { Canvas, createCanvas, GlobalFonts, loadImage, type Image as NapiImage } from "@napi-rs/canvas";
import type { Bubble, BubbleForm, Panel, PageLayout, Point } from "../../../shared/src/layoutSchema.js";
import { resolveBubbleForm, resolvePanelForLanguage, cutPanelReplacementFileForLanguage, imageFileForLanguage } from "../../../shared/src/layoutSchema.js";
import type { LetteringPreset } from "../../../shared/src/presets.js";
import { setCanvasFactory, type CanvasLike } from "../../../shared/src/rendering/canvasFactory.js";
import { drawBubbleBackground } from "../../../shared/src/rendering/bubbleBackground.js";
import { drawCutPanelContent } from "../../../shared/src/rendering/cutPanel.js";
import { warpImageIntoQuad } from "../../../shared/src/rendering/perspective.js";

/**
 * Server-side counterpart to client/src/export/renderPageToPng.ts — draws everything
 * EXCEPT bubble/curved text (background image, Cut-Panel content, placed images, bubble
 * background SHAPES only) using @napi-rs/canvas instead of a browser canvas. Used as the
 * raster background layer for both the vector-PDF export (Phase 3+ draws real vector text
 * on top) and the PSD export's "Hintergrund"/"Retuschen" layers.
 *
 * Known gap (documented, not silently dropped): SVG-contour bubble backgrounds
 * (bubbleStyle "svg") need client/src/export/svgBubbleGeometry.ts's DOMParser-based SVG
 * parsing, which has no Node equivalent yet — such a bubble draws no background shape
 * here (same "not loaded yet" fallback buildBoundaryForStyle() already has for the
 * browser case before its async load resolves, just permanent instead of one frame).
 * Quad-shape bubbles draw no separate background either, matching
 * renderPageToPng.ts's existing behavior (a quad bubble's only visual is its
 * perspective-warped text, handled in a later phase, not a fill/stroke shape).
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
 * so callers can either `.toBuffer("image/png")` it directly (PSD layers) or hand it to
 * sharp for CMYK conversion before embedding in a PDF (see vectorPdf/ in a later phase). */
export async function renderPageBackground(opts: PageBackgroundOptions): Promise<Canvas> {
  ensurePageRasterReady();
  const { baseImagePath, layout, languageCode, resolveImagePath } = opts;
  const presets = opts.presets ?? [];

  const baseImage = await loadImage(baseImagePath);
  const canvas = createCanvas(layout.imageWidth, layout.imageHeight);
  // Cast once here: @napi-rs/canvas's SKRSContext2D is structurally close to but not
  // literally CanvasRenderingContext2D (missing a few browser-only members like
  // drawFocusIfNeeded that nothing in this codebase's shared rendering code uses) — every
  // shared/src/rendering/*.ts function expects the browser type, so this is the one
  // boundary cast instead of one per call site.
  const ctx = canvas.getContext("2d") as unknown as CanvasRenderingContext2D;
  ctx.drawImage(baseImage as unknown as CanvasImageSource, 0, 0, layout.imageWidth, layout.imageHeight);

  // Cut-Panels: resolve per language first (a panel can be untouched in one language and
  // moved/removed/replaced in another — see Panel.languageOverride).
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

  for (const bubble of layout.bubbles) {
    // Quad bubbles draw no separate background shape — their only visual is
    // perspective-warped text (a later phase), matching renderPageToPng.ts.
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

  return canvas;
}
