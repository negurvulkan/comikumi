import { createCanvas, ImageData as NapiImageData, type Canvas } from "@napi-rs/canvas";
import { initializeCanvas, writePsdBuffer, type Layer, type Psd } from "ag-psd";
import type { Bubble, LayerItem, PageLayout, Panel } from "../../../shared/src/layoutSchema.js";
import { imageFileForLanguage, pageLayerOrder, resolveBubbleForm, resolveBubbleStyle, resolveCurvedTextStyle } from "../../../shared/src/layoutSchema.js";
import type { LetteringPreset } from "../../../shared/src/presets.js";
import { textBoxFor, fitHorizontalText } from "../../../shared/src/rendering/textLayout.js";
import {
  drawBaseImage,
  drawBubbleBackgroundOnly,
  drawBubbleElement,
  drawBubbleTextOnly,
  drawCurvedTextElementRaster,
  drawCutPanels,
  drawImageElement,
  ensurePageRasterReady,
  loadBaseImage,
  panelOriginFor,
  registerFont,
} from "./pageRaster.js";
import { findFontFileForFamily } from "./fontResolver.js";
import { resolvePsdFontName } from "./psdFontNames.js";
import { buildPsdTextLayerData } from "./psdTextLayer.js";

/**
 * Layered PSD export: "Hintergrund" (base scan) / "Retuschen / Cut-Panels" (Cut-Panel
 * content only) / one layer per bubble, per curved-text element, and per placed image.
 * Every layer is ALWAYS a raster PNG-with-alpha (`canvas`) — Photoshop can hide/show/
 * move/mask/retouch it regardless. When `editableTextLayers` is set (opt-in, default
 * off) a qualifying bubble ALSO gets a real, Photoshop-Type-tool-editable text object
 * alongside that raster (see psdTextLayer.ts's buildPsdTextLayerData for exactly which
 * bubbles qualify and why the rest stay raster-only — quad/vertical-rl/gradient-fill/
 * merged bubbles, or a font with no resolvable PostScript name, can't be represented as
 * native PSD text). Curved-text elements are always raster-only — no PSD text-engine
 * concept can place text along an arbitrary Bézier path. Photoshop shows the raster
 * image immediately either way; a text-bearing layer additionally prompts an "Update"
 * dialog on first open, converting it to live, retypeable text once accepted (ag-psd's
 * own documented behavior for freshly-written text layers, not a bug here).
 *
 * Every layer is kept at FULL PAGE SIZE (not tightly cropped to its content's bounding
 * box) — simpler and safer than computing a per-element crop rect (especially for
 * rotated/quad bubbles), at the cost of a larger file than a tightly cropped layer
 * would be. A worthwhile follow-up, not attempted here.
 *
 * Bubble/curved-text/image layers are ordered per layoutSchema.ts's pageLayerOrder, so
 * the PSD's own layer stack (bottom to top in the `layers` array) matches what the
 * editor canvas and the PNG export show — an image explicitly brought in front of a
 * bubble sits above that bubble's layer here too (unlike the vector-PDF export, see
 * pageRaster.ts's renderPageBackground doc comment for why that one's different).
 */

let psdCanvasInitialized = false;

function ensurePsdCanvasReady(): void {
  if (psdCanvasInitialized) return;
  ensurePageRasterReady();
  initializeCanvas(
    (width, height) => createCanvas(width, height) as unknown as HTMLCanvasElement,
    (width, height) => new NapiImageData(width, height) as unknown as ImageData
  );
  psdCanvasInitialized = true;
}

function newTransparentCanvas(width: number, height: number): Canvas {
  return createCanvas(width, height);
}

function ctxOf(canvas: Canvas): CanvasRenderingContext2D {
  return canvas.getContext("2d") as unknown as CanvasRenderingContext2D;
}

/** @napi-rs/canvas only draws with a family once it's been registered via
 * GlobalFonts.registerFromPath (see pageRaster.ts's registerFont) — unlike the vector-PDF
 * exporter, which always calls this as part of embedding the font into the PDF itself,
 * nothing else in the PSD path ever did, so every bubble/curved-text font silently fell
 * back to @napi-rs/canvas's default face. Resolves every family actually in use up front
 * (same "skip if no embeddable .ttf/.otf on disk" behavior as the PDF path, rather than
 * crash) so drawBubbleElement/drawCurvedTextElementRaster below draw with the real font. */
async function registerFontsInUse(layout: PageLayout, languageCode: string, presets: LetteringPreset[]): Promise<void> {
  const families = new Set<string>();
  for (const bubble of layout.bubbles) {
    const text = bubble.text[languageCode];
    if (!text || !text.trim()) continue;
    families.add(resolveBubbleStyle(bubble, languageCode, presets).fontFamily);
  }
  for (const el of layout.curvedTexts) {
    const text = el.text[languageCode];
    if (!text || !text.trim()) continue;
    families.add(resolveCurvedTextStyle(el, languageCode, presets).fontFamily);
  }
  await Promise.all(
    [...families].map(async (family) => {
      const absPath = await findFontFileForFamily(family);
      if (absPath) registerFont(absPath, family);
    })
  );
}

export interface BuildPsdOptions {
  baseImagePath: string;
  layout: PageLayout;
  languageCode: string;
  presets?: LetteringPreset[];
  resolveImagePath: (fileName: string) => Promise<string | null>;
  /** Opt-in, default off (see psdTextLayer.ts's doc comment for why) — when set,
   * bubbles that qualify (see buildPsdTextLayerData's gate) get a real, Photoshop-
   * Type-tool-editable text object alongside their existing raster image, instead of
   * being pure raster. */
  editableTextLayers?: boolean;
}

/** Only used for ctx.measureText() inside fitHorizontalText when computing an editable
 * text layer's wrapped lines — never itself drawn/exported (same pattern as
 * buildPdfPage.ts's own measureCtx). Fonts are already registered process-wide by
 * registerFontsInUse() before this is used, so its metrics match the real font. */
function newMeasureCtx(): CanvasRenderingContext2D {
  return createCanvas(10, 10).getContext("2d") as unknown as CanvasRenderingContext2D;
}

/** Computes the same box/wrapped-lines a bubble's raster draw already used (resolving
 * form/style/panel-origin the identical way drawBubbleElement does internally — see
 * pageRaster.ts), then hands them to buildPsdTextLayerData(). Returns `undefined`
 * (not `null`) so callers can spread it directly into a Layer literal with `...(x ?
 * {text: x} : {})`. */
async function buildTextDataFor(
  bubble: Bubble,
  text: string,
  panels: Panel[],
  languageCode: string,
  presets: LetteringPreset[],
  measureCtx: CanvasRenderingContext2D
) {
  const style = resolveBubbleStyle(bubble, languageCode, presets);
  if (style.direction === "vertical-rl") return undefined; // fitHorizontalText doesn't apply — see buildPsdTextLayerData's own gate for why vertical stays raster anyway

  const resolvedForm = resolveBubbleForm(bubble, languageCode, presets);
  const origin = panelOriginFor(bubble, panels);
  const form = origin.x || origin.y ? { ...resolvedForm, x: resolvedForm.x + origin.x, y: resolvedForm.y + origin.y } : resolvedForm;
  // textBoxFor() returns a box LOCAL to the bubble (0,0-origin) — every raster draw
  // path (renderPageToPng.ts, pageRaster.ts, buildPdfPage.ts) explicitly adds the
  // bubble's own page position (form.x/form.y) on top before drawing; this needs the
  // same shift for the text layer's `transform` to land in the right place, not at
  // the bubble's offset-from-top-left within its own box.
  const localBox = textBoxFor(form.bubbleStyle, bubble.shape, form, 1);
  const box = { ...localBox, x: form.x + localBox.x, y: form.y + localBox.y };
  const balloonGeometry =
    bubble.shape === "oval" && style.balloonAwareWrap && !(form.clipA && form.clipB)
      ? { shape: bubble.shape, balloonAwareWrap: style.balloonAwareWrap, bubbleWidth: form.width, bubbleHeight: form.height }
      : undefined;
  const fitted = fitHorizontalText(measureCtx, text, style.fontFamily, style.lineHeight, localBox.width, localBox.height, style.fontSize, balloonGeometry);
  const postscriptName = await resolvePsdFontName(style.fontFamily);

  return buildPsdTextLayerData({ bubble, style, fitted, box, postscriptName }) ?? undefined;
}

export async function buildLayeredPsd(opts: BuildPsdOptions): Promise<Buffer> {
  ensurePsdCanvasReady();
  const { baseImagePath, layout, languageCode, resolveImagePath } = opts;
  const presets = opts.presets ?? [];
  const { imageWidth: width, imageHeight: height } = layout;
  const measureCtx = newMeasureCtx();

  await registerFontsInUse(layout, languageCode, presets);
  const baseImage = await loadBaseImage(baseImagePath);

  const backgroundCanvas = newTransparentCanvas(width, height);
  drawBaseImage(ctxOf(backgroundCanvas), baseImage, layout);

  const retouchCanvas = newTransparentCanvas(width, height);
  await drawCutPanels(ctxOf(retouchCanvas), layout, languageCode, baseImage, resolveImagePath);

  const layers: Layer[] = [
    { name: "Hintergrund", top: 0, left: 0, right: width, bottom: height, canvas: backgroundCanvas as unknown as HTMLCanvasElement },
    { name: "Retuschen / Cut-Panels", top: 0, left: 0, right: width, bottom: height, canvas: retouchCanvas as unknown as HTMLCanvasElement },
  ];

  // Bubble/curved-text/image layers are built into a lookup keyed by (type, id) first,
  // then pushed onto `layers` in pageLayerOrder — so the PSD's own bottom-to-top layer
  // stack always matches the editor canvas and PNG export (see this module's doc
  // comment). Labels still number by each element's own array position (not its paint
  // position), same as before this feature — more stable/meaningful for identifying a
  // specific element than a position that changes every time something's reordered.
  // Each key maps to one OR TWO layers — a bubble that gets an editable text object
  // splits into a background-only layer plus a separate text-only layer (see the loop
  // below for why a real PSD Type layer can't share a layer with the bubble's shape).
  const layerByKey = new Map<string, Layer[]>();

  for (const [i, bubble] of layout.bubbles.entries()) {
    const text = bubble.text[languageCode];
    const hasVisibleContent = (!!text && !!text.trim()) || bubble.shape !== "quad"; // quad-only-visual-is-text; rect/oval can show an empty background shape too
    if (!hasVisibleContent) continue;
    const textData =
      opts.editableTextLayers && text && text.trim()
        ? await buildTextDataFor(bubble, text, layout.panels, languageCode, presets, measureCtx)
        : undefined;

    if (textData) {
      // A real PSD Type layer can ONLY contain text — Photoshop discards whatever
      // raster pixels a layer had once it "Updates" it to live text (see this
      // module's doc comment on the "Update" dialog). drawBubbleElement's combined
      // background+text raster would silently lose the bubble's own outline/fill the
      // moment the user accepts that prompt, so the background needs its own,
      // separate, text-free layer instead of sharing one with the text object.
      const bgCanvas = newTransparentCanvas(width, height);
      drawBubbleBackgroundOnly(ctxOf(bgCanvas), bubble, layout, languageCode, presets);
      const textCanvas = newTransparentCanvas(width, height);
      drawBubbleTextOnly(ctxOf(textCanvas), bubble, layout, languageCode, presets);
      layerByKey.set(`bubble:${bubble.id}`, [
        { name: `Sprechblase ${i + 1} (Hintergrund)`, top: 0, left: 0, right: width, bottom: height, canvas: bgCanvas as unknown as HTMLCanvasElement },
        {
          name: `Sprechblase ${i + 1} (Text)`,
          top: 0,
          left: 0,
          right: width,
          bottom: height,
          canvas: textCanvas as unknown as HTMLCanvasElement,
          text: textData,
        },
      ]);
    } else {
      const canvas = newTransparentCanvas(width, height);
      drawBubbleElement(ctxOf(canvas), bubble, layout, languageCode, presets);
      layerByKey.set(`bubble:${bubble.id}`, [
        { name: `Sprechblase ${i + 1}`, top: 0, left: 0, right: width, bottom: height, canvas: canvas as unknown as HTMLCanvasElement },
      ]);
    }
  }

  layout.curvedTexts.forEach((el, i) => {
    const text = el.text[languageCode];
    if (!text || !text.trim()) return;
    const canvas = newTransparentCanvas(width, height);
    drawCurvedTextElementRaster(ctxOf(canvas), el, languageCode, presets);
    layerByKey.set(`curvedText:${el.id}`, [
      { name: `Kurventext ${i + 1}`, top: 0, left: 0, right: width, bottom: height, canvas: canvas as unknown as HTMLCanvasElement },
    ]);
  });

  for (const [i, element] of layout.images.entries()) {
    if (!imageFileForLanguage(element, languageCode)) continue;
    const canvas = newTransparentCanvas(width, height);
    await drawImageElement(ctxOf(canvas), element, languageCode, resolveImagePath);
    layerByKey.set(`image:${element.id}`, [
      { name: `Bild ${i + 1}`, top: 0, left: 0, right: width, bottom: height, canvas: canvas as unknown as HTMLCanvasElement },
    ]);
  }

  const order: LayerItem[] = pageLayerOrder(layout);
  for (const item of order) {
    const found = layerByKey.get(`${item.type}:${item.id}`);
    if (found) layers.push(...found);
  }

  const psd: Psd = { width, height, children: layers };
  return writePsdBuffer(psd);
}
