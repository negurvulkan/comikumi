import type { BubbleShapeKind, BubbleVisualStyle } from "../layoutSchema.js";

export interface Line {
  text: string;
  width: number;
}

/**
 * Single source of truth for bubble padding, shared by the live Konva preview
 * (BubbleShape) and the PNG export (renderPageToPng) so both render identically.
 */
// "quad" bubbles never read this — their padding is handled inside
// perspective.ts — but the key is included so callers can index by any
// Bubble["shape"] without a type-narrowing cast.
export const PADDING_RATIO: Record<"rect" | "oval" | "quad", number> = { rect: 0.12, oval: 0.28, quad: 0 };
export const MIN_FONT_SIZE = 6;

// An arbitrary imported SVG contour has no single "safe" inset ratio the way
// a rect/oval does — a fixed, fairly generous default (confirmed acceptable
// over computing a tight inscribed rectangle, which would need real
// per-shape geometry analysis) keeps text comfortably inside most shapes.
export const SVG_BUBBLE_PADDING_RATIO = 0.3;

/** Text-box inset ratio for a bubble's resolved style/shape — SVG bubbles use a fixed ratio (their shape isn't one of the parametric PADDING_RATIO keys), everything else keeps the existing per-shape lookup. */
export function paddingRatioFor(bubbleStyle: BubbleVisualStyle, shape: BubbleShapeKind): number {
  if (bubbleStyle === "svg") return SVG_BUBBLE_PADDING_RATIO;
  return PADDING_RATIO[shape];
}

export interface FitResult {
  fontSize: number;
  lines: Line[];
  lineStep: number;
  blockHeight: number;
}

/**
 * Shrinks fontSize (down to MIN_FONT_SIZE) until the wrapped text fits within
 * boxWidth x boxHeight — the same algorithm used for the PNG export, so the
 * live editor preview can match it exactly.
 */
export function fitHorizontalText(
  ctx: CanvasRenderingContext2D,
  text: string,
  fontFamily: string,
  lineHeight: number,
  boxWidth: number,
  boxHeight: number,
  baseFontSize: number
): FitResult {
  let size = baseFontSize;
  let lines: Line[] = [];
  while (size >= MIN_FONT_SIZE) {
    ctx.font = `${size}px "${fontFamily}"`;
    lines = wrapHorizontal(ctx, text, boxWidth);
    const blockHeight = lines.length * size * lineHeight;
    if (blockHeight <= boxHeight || size === MIN_FONT_SIZE) break;
    size -= 1;
  }
  const lineStep = size * lineHeight;
  return { fontSize: size, lines, lineStep, blockHeight: lines.length * lineStep };
}

/** Greedy word-wrap for horizontal (ltr/rtl) text within maxWidth. */
export function wrapHorizontal(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): Line[] {
  const lines: Line[] = [];
  for (const paragraph of text.split("\n")) {
    const words = paragraph.split(/\s+/).filter(Boolean);
    if (words.length === 0) {
      lines.push({ text: "", width: 0 });
      continue;
    }
    let current = "";
    for (const word of words) {
      const candidate = current ? `${current} ${word}` : word;
      if (ctx.measureText(candidate).width > maxWidth && current) {
        lines.push({ text: current, width: ctx.measureText(current).width });
        current = word;
      } else {
        current = candidate;
      }
    }
    if (current) lines.push({ text: current, width: ctx.measureText(current).width });
  }
  return lines;
}

// Vertical (tategaki) text wrapping/fitting/drawing lives in
// verticalTypesetting.ts — it needs tokenization (ruby, tate-chū-yoko, forced
// breaks) that a plain character array can't represent.
