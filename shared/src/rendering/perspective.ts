import type { Point, TextAlign, TextDirection, TextGradient, TextOutline } from "../layoutSchema.js";
import { fitHorizontalText } from "./textLayout.js";
import { drawVerticalText, fitVerticalText } from "./verticalTypesetting.js";
import { applyTextFillStyle, drawStyledText, type TextFillStyle } from "./textEffects.js";
import { pointInQuad } from "./geometry.js";
import { createOffscreenCanvas } from "./canvasFactory.js";

export { pointInQuad };

export type Mat3 = [number, number, number, number, number, number, number, number, number];

/**
 * 3x3 homography mapping the unit square (0,0)-(1,0)-(1,1)-(0,1) onto the
 * given quad (TL, TR, BR, BL order). Standard general-quad projective mapping
 * (see e.g. Paul Heckbert's thesis, "Fundamentals of Texture Mapping").
 * Exported (alongside invert3/apply/pointInQuad) purely so it's unit-testable
 * independent of Konva/canvas — this is the actual math behind every quad
 * bubble/image's perspective warp, with zero DOM dependency of its own.
 */
export function unitSquareToQuad(q: Point[]): Mat3 {
  const [p0, p1, p2, p3] = q;
  const dx1 = p1.x - p2.x;
  const dx2 = p3.x - p2.x;
  const dx3 = p0.x - p1.x + p2.x - p3.x;
  const dy1 = p1.y - p2.y;
  const dy2 = p3.y - p2.y;
  const dy3 = p0.y - p1.y + p2.y - p3.y;

  let a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number;
  if (Math.abs(dx3) < 1e-9 && Math.abs(dy3) < 1e-9) {
    // Already a parallelogram — pure affine, no perspective term needed.
    a = p1.x - p0.x;
    b = p2.x - p1.x;
    c = p0.x;
    d = p1.y - p0.y;
    e = p2.y - p1.y;
    f = p0.y;
    g = 0;
    h = 0;
  } else {
    const den = dx1 * dy2 - dx2 * dy1;
    g = den === 0 ? 0 : (dx3 * dy2 - dx2 * dy3) / den;
    h = den === 0 ? 0 : (dx1 * dy3 - dx3 * dy1) / den;
    a = p1.x - p0.x + g * p1.x;
    b = p3.x - p0.x + h * p3.x;
    c = p0.x;
    d = p1.y - p0.y + g * p1.y;
    e = p3.y - p0.y + h * p3.y;
    f = p0.y;
  }
  return [a, b, c, d, e, f, g, h, 1];
}

export function invert3(m: Mat3): Mat3 {
  const [a, b, c, d, e, f, g, h, i] = m;
  const A = e * i - f * h;
  const B = -(d * i - f * g);
  const C = d * h - e * g;
  const D = -(b * i - c * h);
  const E = a * i - c * g;
  const F = -(a * h - b * g);
  const G = b * f - c * e;
  const H = -(a * f - c * d);
  const I = a * e - b * d;
  const det = a * A + b * B + c * C;
  if (Math.abs(det) < 1e-12) return [1, 0, 0, 0, 1, 0, 0, 0, 1];
  const invDet = 1 / det;
  return [A * invDet, D * invDet, G * invDet, B * invDet, E * invDet, H * invDet, C * invDet, F * invDet, I * invDet];
}

export function apply(m: Mat3, x: number, y: number): { x: number; y: number } {
  const [a, b, c, d, e, f, g, h, i] = m;
  const w = g * x + h * y + i;
  return { x: (a * x + b * y + c) / w, y: (d * x + e * y + f) / w };
}

function bilinearSample(data: Uint8ClampedArray, w: number, h: number, x: number, y: number): [number, number, number, number] {
  const x0 = Math.floor(x),
    y0 = Math.floor(y);
  const x1 = Math.min(x0 + 1, w - 1),
    y1 = Math.min(y0 + 1, h - 1);
  const cx0 = Math.max(0, Math.min(x0, w - 1)),
    cy0 = Math.max(0, Math.min(y0, h - 1));
  const fx = x - x0,
    fy = y - y0;
  const at = (px: number, py: number) => {
    const idx = (py * w + px) * 4;
    return [data[idx], data[idx + 1], data[idx + 2], data[idx + 3]];
  };
  const c00 = at(cx0, cy0);
  const c10 = at(x1, cy0);
  const c01 = at(cx0, y1);
  const c11 = at(x1, y1);
  const lerp = (v0: number, v1: number, t: number) => v0 + (v1 - v0) * t;
  const top = c00.map((v, i) => lerp(v, c10[i], fx));
  const bottom = c01.map((v, i) => lerp(v, c11[i], fx));
  const out = top.map((v, i) => lerp(v, bottom[i], fy));
  return [out[0], out[1], out[2], out[3]];
}

/**
 * Warps an already-rendered source canvas into `quad` with a true projective
 * transform (converging edges, not just skew) — the shared core used by both
 * text warping (renders text to a flat canvas first) and image placement
 * (uses the uploaded image directly as the source). Returns a canvas sized to
 * the quad's bounding box (transparent outside the quad) plus that box's
 * top-left offset, ready to be composited with drawImage. `srcCanvas`/the
 * returned `.canvas` are typed as HTMLCanvasElement for browser call sites'
 * convenience — server-side callers (pageRaster.ts) pass/receive a
 * @napi-rs/canvas Canvas instead, cast at that boundary (see canvasFactory.ts).
 */
function warpCanvasIntoQuad(
  quad: Point[],
  srcCanvas: HTMLCanvasElement,
  opacity = 1
): { canvas: HTMLCanvasElement; x: number; y: number } | null {
  const minX = Math.min(...quad.map((p) => p.x));
  const minY = Math.min(...quad.map((p) => p.y));
  const maxX = Math.max(...quad.map((p) => p.x));
  const maxY = Math.max(...quad.map((p) => p.y));
  const bboxW = Math.max(1, Math.ceil(maxX - minX));
  const bboxH = Math.max(1, Math.ceil(maxY - minY));
  const srcW = srcCanvas.width;
  const srcH = srcCanvas.height;
  if (srcW === 0 || srcH === 0) return null;
  const srcData = srcCanvas.getContext("2d")!.getImageData(0, 0, srcW, srcH).data;

  // Homography: unit square -> quad (relative to the bbox origin), then we
  // sample by inverse-mapping each destination pixel back into source space.
  const localQuad = quad.map((p) => ({ x: p.x - minX, y: p.y - minY }));
  const forward = unitSquareToQuad(localQuad);
  const inverse = invert3(forward);

  const destCanvas = createOffscreenCanvas(bboxW, bboxH) as unknown as HTMLCanvasElement;
  const dctx = destCanvas.getContext("2d")!;
  const destImage = dctx.createImageData(bboxW, bboxH);
  const destData = destImage.data;

  for (let py = 0; py < bboxH; py++) {
    for (let px = 0; px < bboxW; px++) {
      const dp = { x: px + 0.5, y: py + 0.5 };
      if (!pointInQuad(dp, localQuad)) continue;
      const uv = apply(inverse, dp.x, dp.y);
      if (uv.x < 0 || uv.x > 1 || uv.y < 0 || uv.y > 1) continue;
      const sx = uv.x * (srcW - 1);
      const sy = uv.y * (srcH - 1);
      const [r, g, b, a] = bilinearSample(srcData, srcW, srcH, sx, sy);
      if (a === 0) continue;
      const di = (py * bboxW + px) * 4;
      destData[di] = r;
      destData[di + 1] = g;
      destData[di + 2] = b;
      destData[di + 3] = a * opacity;
    }
  }
  dctx.putImageData(destImage, 0, 0);
  return { canvas: destCanvas, x: minX, y: minY };
}

const MAX_IMAGE_SOURCE_DIM = 2200;

/**
 * Warps an uploaded raster image (with its transparency intact) into `quad`
 * — for poster/sign patches the text tool can't cover. Free scale/rotate is
 * just a special case of the quad; true perspective works the same as text.
 */
export function warpImageIntoQuad(
  quad: Point[],
  image: HTMLImageElement,
  opacity: number
): { canvas: HTMLCanvasElement; x: number; y: number } | null {
  const naturalW = image.naturalWidth || image.width;
  const naturalH = image.naturalHeight || image.height;
  if (!naturalW || !naturalH) return null;
  const capScale = Math.min(1, MAX_IMAGE_SOURCE_DIM / Math.max(naturalW, naturalH));
  const srcCanvas = createOffscreenCanvas(
    Math.max(1, Math.round(naturalW * capScale)),
    Math.max(1, Math.round(naturalH * capScale))
  ) as unknown as HTMLCanvasElement;
  const sctx = srcCanvas.getContext("2d")!;
  sctx.drawImage(image, 0, 0, srcCanvas.width, srcCanvas.height);
  return warpCanvasIntoQuad(quad, srcCanvas, opacity);
}

export interface PerspectiveTextOptions {
  text: string;
  fontFamily: string;
  fontSize: number;
  lineHeight: number;
  align: CanvasTextAlign;
  color: string;
  outline?: TextOutline;
  gradient?: TextGradient;
  direction?: TextDirection;
}

/**
 * Renders `text` flat, then warps it with a true projective transform so it
 * sits inside `quad` exactly the way perspective lettering on a sign/door
 * would — converging edges, not just a skew. Returns a small canvas sized to
 * the quad's bounding box (transparent outside the quad) plus that box's
 * top-left offset, ready to be composited with drawImage.
 */
export function renderPerspectiveText(
  quad: Point[],
  opts: PerspectiveTextOptions
): { canvas: HTMLCanvasElement; x: number; y: number } | null {
  if (!opts.text.trim()) return null;

  // "Flattened" size of the quad — average of the two horizontal and the two
  // vertical edge lengths — used as the undistorted layout box for the text.
  const edgeLen = (a: Point, b: Point) => Math.hypot(b.x - a.x, b.y - a.y);
  const flatWidth = Math.max(8, (edgeLen(quad[0], quad[1]) + edgeLen(quad[3], quad[2])) / 2);
  const flatHeight = Math.max(8, (edgeLen(quad[0], quad[3]) + edgeLen(quad[1], quad[2])) / 2);

  // Render text into a source canvas at that flattened size (oversampled a
  // bit for sharper sampling after the warp), then fit + draw it centered.
  const oversample = Math.min(3, Math.max(1, 600 / Math.max(flatWidth, flatHeight)));
  const srcW = Math.max(1, Math.round(flatWidth * oversample));
  const srcH = Math.max(1, Math.round(flatHeight * oversample));
  const srcCanvas = createOffscreenCanvas(srcW, srcH) as unknown as HTMLCanvasElement;
  const sctx = srcCanvas.getContext("2d")!;
  const padX = srcW * 0.06;
  const padY = srcH * 0.1;

  if (opts.direction === "vertical-rl") {
    const vBoxWidth = srcW - padX * 2;
    const fittedV = fitVerticalText(opts.text, opts.lineHeight, vBoxWidth, srcH - padY * 2, opts.fontSize * oversample);
    drawVerticalText(sctx, fittedV, srcW / 2, srcH / 2, vBoxWidth, {
      fontFamily: opts.fontFamily,
      color: opts.color,
      align: opts.align as TextAlign,
      outline: opts.outline,
      gradient: opts.gradient,
      scale: oversample,
    });
  } else {
    const fitted = fitHorizontalText(
      sctx,
      opts.text,
      opts.fontFamily,
      opts.lineHeight,
      srcW - padX * 2,
      srcH - padY * 2,
      opts.fontSize * oversample
    );
    sctx.font = `${fitted.fontSize}px "${opts.fontFamily}"`;
    sctx.textBaseline = "middle";
    sctx.textAlign = opts.align;
    sctx.direction = opts.direction === "rtl" ? "rtl" : "ltr";
    const anchorX = opts.align === "left" ? padX : opts.align === "right" ? srcW - padX : srcW / 2;
    const startY = srcH / 2 - fitted.blockHeight / 2 + fitted.lineStep / 2;
    const fillStyle: TextFillStyle = { color: opts.color, outline: opts.outline, gradient: opts.gradient };
    applyTextFillStyle(sctx, fillStyle, padX, startY - fitted.lineStep / 2, srcW - padX * 2, fitted.blockHeight, oversample);
    fitted.lines.forEach((line, i) => {
      drawStyledText(sctx, line.text, anchorX, startY + i * fitted.lineStep, fillStyle);
    });
  }
  return warpCanvasIntoQuad(quad, srcCanvas);
}
