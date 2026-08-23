import { createCanvas, ImageData as NapiImageData, type Canvas } from "@napi-rs/canvas";
import { initializeCanvas, writePsdBuffer, type Layer, type Psd } from "ag-psd";
import type { PageLayout } from "../../../shared/src/layoutSchema.js";
import { resolveBubbleStyle, resolveCurvedTextStyle } from "../../../shared/src/layoutSchema.js";
import type { LetteringPreset } from "../../../shared/src/presets.js";
import {
  drawBaseImage,
  drawBubbleElement,
  drawCurvedTextElementRaster,
  drawCutPanelsAndImages,
  ensurePageRasterReady,
  loadBaseImage,
  registerFont,
} from "./pageRaster.js";
import { findFontFileForFamily } from "./fontResolver.js";

/**
 * Layered PSD export: "Hintergrund" (base scan) / "Retuschen" (Cut-Panel content +
 * placed images) / one layer per bubble and per curved-text element ("Text/
 * Sprechblasen"). Every layer is a plain RASTER PNG-with-alpha (confirmed choice —
 * not a real, Photoshop-text-tool-editable PSD text object, which would be as much
 * work as the vector-PDF problem itself) — Photoshop can hide/show/move/mask each
 * layer independently, but not retype the text with the Type tool.
 *
 * Every layer is kept at FULL PAGE SIZE (not tightly cropped to its content's bounding
 * box) — simpler and safer than computing a per-element crop rect (especially for
 * rotated/quad bubbles), at the cost of a larger file than a tightly cropped layer
 * would be. A worthwhile follow-up, not attempted here.
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
}

export async function buildLayeredPsd(opts: BuildPsdOptions): Promise<Buffer> {
  ensurePsdCanvasReady();
  const { baseImagePath, layout, languageCode, resolveImagePath } = opts;
  const presets = opts.presets ?? [];
  const { imageWidth: width, imageHeight: height } = layout;

  await registerFontsInUse(layout, languageCode, presets);
  const baseImage = await loadBaseImage(baseImagePath);

  const backgroundCanvas = newTransparentCanvas(width, height);
  drawBaseImage(ctxOf(backgroundCanvas), baseImage, layout);

  const retouchCanvas = newTransparentCanvas(width, height);
  await drawCutPanelsAndImages(ctxOf(retouchCanvas), layout, languageCode, baseImage, resolveImagePath);

  const layers: Layer[] = [
    { name: "Hintergrund", top: 0, left: 0, right: width, bottom: height, canvas: backgroundCanvas as unknown as HTMLCanvasElement },
    { name: "Retuschen / Cut-Panels / Bilder", top: 0, left: 0, right: width, bottom: height, canvas: retouchCanvas as unknown as HTMLCanvasElement },
  ];

  layout.bubbles.forEach((bubble, i) => {
    const text = bubble.text[languageCode];
    const hasVisibleContent = (!!text && !!text.trim()) || bubble.shape !== "quad"; // quad-only-visual-is-text; rect/oval can show an empty background shape too
    if (!hasVisibleContent) return;
    const canvas = newTransparentCanvas(width, height);
    drawBubbleElement(ctxOf(canvas), bubble, layout, languageCode, presets);
    layers.push({
      name: `Sprechblase ${i + 1}`,
      top: 0,
      left: 0,
      right: width,
      bottom: height,
      canvas: canvas as unknown as HTMLCanvasElement,
    });
  });

  layout.curvedTexts.forEach((el, i) => {
    const text = el.text[languageCode];
    if (!text || !text.trim()) return;
    const canvas = newTransparentCanvas(width, height);
    drawCurvedTextElementRaster(ctxOf(canvas), el, languageCode, presets);
    layers.push({
      name: `Kurventext ${i + 1}`,
      top: 0,
      left: 0,
      right: width,
      bottom: height,
      canvas: canvas as unknown as HTMLCanvasElement,
    });
  });

  const psd: Psd = { width, height, children: layers };
  return writePsdBuffer(psd);
}
