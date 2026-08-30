import fs from "node:fs/promises";
import { PDFDocument, type PDFFont, type PDFPage, rgb, degrees } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import sharp from "sharp";
import { createCanvas } from "@napi-rs/canvas";
import type { Bubble, BubbleForm, PageLayout, Panel, Point } from "../../../../shared/src/layoutSchema.js";
import { resolveBubbleForm, resolveBubbleStyle, resolveCurvedTextStyle } from "../../../../shared/src/layoutSchema.js";
import type { LetteringPreset } from "../../../../shared/src/presets.js";
import { paddingRatioFor, fitHorizontalText } from "../../../../shared/src/rendering/textLayout.js";
import { fitCurvedText, pointAtArcLength, totalArcLength } from "../../../../shared/src/rendering/curvedText.js";
import { ensurePageRasterReady, panelOriginFor, registerFont, renderPageBackground } from "../pageRaster.js";
import { findFontFileForFamily } from "../fontResolver.js";
import { applyPdfXMetadata, loadConfiguredIccProfile, type PdfXVersion } from "./pdfXMetadata.js";

/**
 * Builds one page of the vector-print PDF: the raster background (see pageRaster.ts —
 * everything except bubble/curved text) embedded as the page's full-bleed image, with
 * real PDF vector text drawn on top for rect/oval bubbles (exact affine placement),
 * curved-path text (per-glyph affine placement), and quad-shape bubbles (an affine
 * APPROXIMATION — see drawQuadBubbleText's doc comment for why true projective text is
 * impossible in the PDF format itself, not just unimplemented). Vertical (tategaki) text
 * is the one remaining later phase — skipped here for now (its text simply doesn't
 * appear yet, tracked openly rather than silently baked into the raster).
 *
 * Industry-standard print resolution — matches the px->pt conversion the earlier IDML
 * research already worked out, applied uniformly to page size, geometry, and font size.
 */
const PDF_DPI = 300;
const PT_PER_PX = 72 / PDF_DPI;

export interface BuildPdfPageOptions {
  baseImagePath: string;
  layout: PageLayout;
  languageCode: string;
  presets?: LetteringPreset[];
  resolveImagePath: (fileName: string) => Promise<string | null>;
  /** "x1a" or "x4" — only actually affects the XMP conformance stamp, and only when an
   * ICC profile is configured at all (see pdfXMetadata.ts's loadConfiguredIccProfile). */
  pdfxVersion: PdfXVersion;
}

export interface BuildPdfPageResult {
  bytes: Buffer;
  /** False when no PDFX_ICC_PROFILE_PATH is configured — the PDF is still real vector
   * text over a CMYK background, just not stamped/certifiable as PDF/X (see
   * pdfXMetadata.ts's doc comment). Surface this to the user rather than hide it. */
  pdfxStamped: boolean;
}

function hexToRgb01(hex: string): [number, number, number] {
  const clean = hex.replace("#", "");
  const full = clean.length === 3 ? clean.split("").map((c) => c + c).join("") : clean;
  const value = parseInt(full, 16) || 0;
  return [((value >> 16) & 255) / 255, ((value >> 8) & 255) / 255, (value & 255) / 255];
}

function rotateAroundPx(p: { x: number; y: number }, center: { x: number; y: number }, angleRad: number): { x: number; y: number } {
  const dx = p.x - center.x;
  const dy = p.y - center.y;
  const cos = Math.cos(angleRad);
  const sin = Math.sin(angleRad);
  return { x: center.x + dx * cos - dy * sin, y: center.y + dx * sin + dy * cos };
}

/** Rotates a plain offset vector (not a point around a center) — used for curved text,
 * where each glyph's own local "shift left/down by half its own size" offset needs to be
 * re-expressed in world space after that glyph's individual tangent-angle rotation. */
function rotateVector(dx: number, dy: number, angleRad: number): { x: number; y: number } {
  const cos = Math.cos(angleRad);
  const sin = Math.sin(angleRad);
  return { x: dx * cos - dy * sin, y: dx * sin + dy * cos };
}

/**
 * Draws a quad-shape bubble's text using a best-fit AFFINE approximation of the
 * quad, instead of the true projective (perspective) warp the live preview/PNG export
 * use — PDF text-drawing matrices are strictly affine (translate/rotate/scale/shear),
 * so genuine projective distortion of vector text is impossible in the PDF format
 * itself, not merely unimplemented here. The approximation: an affine map built from 3
 * of the quad's 4 corners (TL, TR, BL) is exact at those three points; the 4th (BR) is
 * wherever that map happens to put it — for a true parallelogram this is exact overall,
 * for a genuine trapezoid/perspective quad it's a visible-but-usually-minor deviation
 * that grows with how extreme the quad's perspective is. A single rotation angle
 * (from the TL->TR edge) is used for ALL lines, so any shear/non-uniform-scale in the
 * quad only affects line POSITION, not each line's own rotation.
 */
function drawQuadBubbleText(
  page: PDFPage,
  font: PDFFont,
  bubble: Bubble,
  style: ReturnType<typeof resolveBubbleStyle>,
  text: string,
  panels: Panel[],
  measureCtx: CanvasRenderingContext2D,
  toPdfXY: (px: number, py: number) => { x: number; y: number }
): void {
  const origin = panelOriginFor(bubble, panels);
  const raw = bubble.corners!;
  const corners: Point[] = origin.x || origin.y ? raw.map((c) => ({ x: c.x + origin.x, y: c.y + origin.y })) : raw;
  const [p0, p1, p2, p3] = corners; // TL, TR, BR, BL

  const edgeLen = (a: Point, b: Point) => Math.hypot(b.x - a.x, b.y - a.y);
  // "Flattened" undistorted box size, same average-edge-length approach renderPerspectiveText
  // (the client's raster quad renderer) already uses for laying out the source text.
  const flatWidth = Math.max(8, (edgeLen(p0, p1) + edgeLen(p3, p2)) / 2);
  const flatHeight = Math.max(8, (edgeLen(p0, p3) + edgeLen(p1, p2)) / 2);
  const padX = flatWidth * 0.06;
  const padY = flatHeight * 0.1;

  const { fontSize, lines, lineStep, blockHeight } = fitHorizontalText(
    measureCtx,
    text,
    style.fontFamily,
    style.lineHeight,
    flatWidth - padX * 2,
    flatHeight - padY * 2,
    style.fontSize
  );

  // Affine basis: origin at TL, "right" spans TL->TR, "down" spans TL->BL — exact at
  // (u=0,v=0)=TL, (u=1,v=0)=TR, (u=0,v=1)=BL; BR is only reached exactly if p1+p3-p0
  // happens to equal the real p2 (i.e. the quad is a parallelogram).
  const rightVec = { x: p1.x - p0.x, y: p1.y - p0.y };
  const downVec = { x: p3.x - p0.x, y: p3.y - p0.y };
  const angle = Math.atan2(rightVec.y, rightVec.x);
  function affine(u: number, v: number): Point {
    return { x: p0.x + u * rightVec.x + v * downVec.x, y: p0.y + u * rightVec.y + v * downVec.y };
  }

  const anchorXLocal = style.align === "left" ? padX : style.align === "right" ? flatWidth - padX : flatWidth / 2;
  const startYLocal = flatHeight / 2 - blockHeight / 2 + lineStep / 2;
  const baselineCorrectionPx = fontSize * 0.32;
  const [r, g, b] = hexToRgb01(style.color);

  lines.forEach((line, i) => {
    const lineWidthPx = font.widthOfTextAtSize(line.text, fontSize);
    const alignShiftPx = style.align === "center" ? lineWidthPx / 2 : style.align === "right" ? lineWidthPx : 0;
    const localX = anchorXLocal - alignShiftPx;
    const localY = startYLocal + i * lineStep + baselineCorrectionPx;
    const world = affine(localX / flatWidth, localY / flatHeight);
    const { x, y } = toPdfXY(world.x, world.y);
    page.drawText(line.text, {
      x,
      y,
      size: fontSize * PT_PER_PX,
      font,
      color: rgb(r, g, b),
      rotate: degrees((-angle * 180) / Math.PI),
    });
  });
}

export async function buildVectorPdfPage(opts: BuildPdfPageOptions): Promise<BuildPdfPageResult> {
  ensurePageRasterReady();
  const { layout, languageCode } = opts;
  const presets = opts.presets ?? [];

  const backgroundCanvas = await renderPageBackground({
    baseImagePath: opts.baseImagePath,
    layout,
    languageCode,
    presets,
    resolveImagePath: opts.resolveImagePath,
  });
  // CMYK JPEG, not PNG — PNG has no CMYK color type at all (see the existing
  // /export-print route's own reasoning), and pdf-lib only embeds raster images as
  // JPEG or PNG, never TIFF. Quality 95 is a deliberate, documented lossy trade-off
  // (see docs/FEATURES.md) — not pixel-perfect like the /export-print TIFF path.
  const backgroundCmykJpeg = await sharp(backgroundCanvas.toBuffer("image/png"))
    .flatten({ background: "#ffffff" })
    .toColourspace("cmyk")
    .jpeg({ quality: 95 })
    .toBuffer();

  const pdfDoc = await PDFDocument.create();
  pdfDoc.registerFontkit(fontkit);
  const pageWidthPt = layout.imageWidth * PT_PER_PX;
  const pageHeightPt = layout.imageHeight * PT_PER_PX;
  const page = pdfDoc.addPage([pageWidthPt, pageHeightPt]);
  const bgImage = await pdfDoc.embedJpg(backgroundCmykJpeg);
  page.drawImage(bgImage, { x: 0, y: 0, width: pageWidthPt, height: pageHeightPt });

  // Only used for ctx.measureText() inside fitHorizontalText — never drawn/exported.
  const measureCtx = createCanvas(10, 10).getContext("2d") as unknown as CanvasRenderingContext2D;
  const embeddedFonts = new Map<string, PDFFont | null>();

  async function embedFontFor(family: string): Promise<PDFFont | null> {
    if (embeddedFonts.has(family)) return embeddedFonts.get(family)!;
    const absPath = await findFontFileForFamily(family);
    if (!absPath) {
      embeddedFonts.set(family, null);
      return null;
    }
    // Also registers the family with @napi-rs/canvas so measureCtx's ctx.font
    // resolves the REAL font's metrics instead of a fallback — otherwise fitHorizontalText
    // would wrap/shrink against the wrong glyph widths and visibly diverge from the PDF.
    registerFont(absPath, family);
    const bytes = await fs.readFile(absPath);
    const font = await pdfDoc.embedFont(bytes, { subset: true });
    embeddedFonts.set(family, font);
    return font;
  }

  // PDF's y-axis grows upward from the bottom-left; every stored coordinate is
  // top-left-origin image px — flip once here instead of scattering (h - y) everywhere.
  function toPdfXY(px: number, py: number): { x: number; y: number } {
    return { x: px * PT_PER_PX, y: pageHeightPt - py * PT_PER_PX };
  }

  for (const bubble of layout.bubbles) {
    const text = bubble.text[languageCode];
    if (!text || !text.trim()) continue;
    const style = resolveBubbleStyle(bubble, languageCode, presets);
    if (style.direction === "vertical-rl") continue; // later phase — tategaki (both rect/oval and quad)

    const font = await embedFontFor(style.fontFamily);
    // No embeddable (.ttf/.otf) file for this family — skip rather than silently
    // substitute a different font, which would look right but be factually wrong.
    if (!font) continue;

    if (bubble.shape === "quad" && bubble.corners) {
      drawQuadBubbleText(page, font, bubble, style, text, layout.panels, measureCtx, toPdfXY);
      continue;
    }

    const resolvedForm: BubbleForm = resolveBubbleForm(bubble, languageCode, presets);
    // A bubble that's a child of a panel stores panel-RELATIVE x/y — the embedded
    // background raster already accounts for this (see pageRaster.ts's
    // drawBubbleBackgroundsOnly/drawBubbleElement), so text must be shifted by the same
    // panel origin or it visibly detaches from its bubble (same fix drawQuadBubbleText
    // already applies internally for quad bubbles, just missing here for rect/oval).
    const origin = panelOriginFor(bubble, layout.panels);
    const form: BubbleForm =
      origin.x || origin.y ? { ...resolvedForm, x: resolvedForm.x + origin.x, y: resolvedForm.y + origin.y } : resolvedForm;
    const ratio = paddingRatioFor(form.bubbleStyle, bubble.shape, form.paddingRatio);
    const boxWidth = form.width * (1 - ratio);
    const boxHeight = form.height * (1 - ratio);
    const { fontSize, lines, lineStep, blockHeight } = fitHorizontalText(
      measureCtx,
      text,
      style.fontFamily,
      style.lineHeight,
      boxWidth,
      boxHeight,
      style.fontSize
    );

    const startY = form.y + form.height / 2 - blockHeight / 2 + lineStep / 2;
    const centerX = form.x + form.width / 2;
    const anchorXPx =
      style.align === "left"
        ? form.x + (form.width - boxWidth) / 2
        : style.align === "right"
          ? form.x + form.width - (form.width - boxWidth) / 2
          : centerX;
    const rotationRad = (form.rotation * Math.PI) / 180;
    const bubbleCenterPx = { x: form.x + form.width / 2, y: form.y + form.height / 2 };
    const [r, g, b] = hexToRgb01(style.color);

    lines.forEach((line, i) => {
      // `fontSize` is already in px (this app's native unit) — widthOfTextAtSize's
      // result comes back in that SAME unit (it's a pure scale by size/unitsPerEm, no
      // implicit pt conversion happens inside pdf-lib), so no /PT_PER_PX here. Dividing
      // by it here was a bug: it inflated the width ~4x, which only ever showed up for
      // center/right-aligned text (align="left" has no shift to corrupt).
      const lineWidthPx = font.widthOfTextAtSize(line.text, fontSize);
      // Canvas draws these lines with textAlign center/right and textBaseline "middle" —
      // pdf-lib's drawText always anchors at the baseline's LEFT edge, so both the
      // horizontal alignment and the middle-vs-baseline vertical offset need an explicit
      // correction here to land in the same visual place.
      const alignShiftPx = style.align === "center" ? lineWidthPx / 2 : style.align === "right" ? lineWidthPx : 0;
      const unrotated = { x: anchorXPx - alignShiftPx, y: startY + i * lineStep };
      const rotated = form.rotation ? rotateAroundPx(unrotated, bubbleCenterPx, rotationRad) : unrotated;
      const { x, y } = toPdfXY(rotated.x, rotated.y);
      // ~0.32 * fontSize approximates the gap between a "middle" baseline (canvas) and
      // an alphabetic baseline (PDF) for typical Latin/CJK metrics — not exact per-font,
      // but close enough that text sits visually centered in its line, matching the preview.
      const baselineCorrectionPt = fontSize * PT_PER_PX * 0.32;

      page.drawText(line.text, {
        x,
        y: y - baselineCorrectionPt,
        size: fontSize * PT_PER_PX,
        font,
        color: rgb(r, g, b),
        // PDF page rotation is counter-clockwise; this app's bubble.rotation (and canvas
        // ctx.rotate) is clockwise-positive — negate to match.
        rotate: degrees(-form.rotation),
      });
    });
  }

  // Freestanding "text on a Bézier path" — same drawing order as renderPageToPng.ts
  // (drawn after bubbles, sitting visually on top). Each character becomes its OWN small
  // PDF text object with its own rotation (matching the curve's local tangent) — more
  // objects than a normal text line, but every one stays genuine affine vector text
  // (a per-character rotation is exact; only Quad's whole-shape PROJECTIVE warp is
  // impossible in PDF, see this module's — and the plan's — documented format limit).
  for (const el of layout.curvedTexts) {
    const text = el.text[languageCode];
    const flat = text ? text.replace(/\n/g, " ") : "";
    if (!flat.trim()) continue;
    const style = resolveCurvedTextStyle(el, languageCode, presets);
    const font = await embedFontFor(style.fontFamily);
    if (!font) continue;

    const fitted = fitCurvedText(measureCtx, flat, style.fontFamily, el.points, style.fontSize);
    const total = totalArcLength(fitted.table);
    const startDist =
      style.align === "left" ? 0 : style.align === "right" ? total - fitted.totalTextWidth : (total - fitted.totalTextWidth) / 2;
    const [r, g, b] = hexToRgb01(style.color);
    const baselineCorrectionPx = fitted.fontSize * 0.32;

    let dist = startDist;
    for (const ch of [...flat]) {
      const chWidthPx = font.widthOfTextAtSize(ch, fitted.fontSize);
      const { point, angle } = pointAtArcLength(el.points, fitted.table, dist + chWidthPx / 2);
      // Canvas draws each glyph centered (textAlign "center" + textBaseline "middle") at
      // `point` after translate+rotate — PDF anchors at baseline-left, so shift left by
      // half the glyph's own width and down by the same baseline approximation used for
      // bubble text, both expressed in the glyph's own rotated local frame.
      const offset = rotateVector(-chWidthPx / 2, baselineCorrectionPx, angle);
      const { x, y } = toPdfXY(point.x + offset.x, point.y + offset.y);
      page.drawText(ch, {
        x,
        y,
        size: fitted.fontSize * PT_PER_PX,
        font,
        color: rgb(r, g, b),
        rotate: degrees((-angle * 180) / Math.PI),
      });
      dist += chWidthPx;
    }
  }

  const iccProfileBytes = await loadConfiguredIccProfile();
  const { pdfxStamped } = applyPdfXMetadata(pdfDoc, page, {
    version: opts.pdfxVersion,
    iccProfileBytes,
    pageWidthPt,
    pageHeightPt,
  });

  return { bytes: Buffer.from(await pdfDoc.save()), pdfxStamped };
}
