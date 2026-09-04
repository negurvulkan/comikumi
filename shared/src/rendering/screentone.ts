import type { BubbleScreentone } from "../layoutSchema.js";
import { createOffscreenCanvas } from "./canvasFactory.js";

/** Small, deliberately independent copy of bubbleBackground.ts's own hexToRgba — kept
 * separate rather than imported to avoid a circular import (bubbleBackground.ts needs
 * buildScreentonePattern from this file for its background-fill branch). Trivial enough
 * (6 lines, no state) that duplicating it is simpler than restructuring the dependency
 * graph. */
function hexToRgba(hex: string, opacity: number): string {
  const clean = hex.replace("#", "");
  const r = parseInt(clean.substring(0, 2), 16) || 0;
  const g = parseInt(clean.substring(2, 4), 16) || 0;
  const b = parseInt(clean.substring(4, 6), 16) || 0;
  return `rgba(${r}, ${g}, ${b}, ${opacity})`;
}

/**
 * Draws one axis-aligned repeating tile for a screentone pattern — deliberately NOT
 * rotated here (see buildScreentonePattern, which applies `angleDeg` via
 * CanvasPattern.setTransform() on the whole infinite tiling instead, avoiding messy
 * "sample a rotated grid into a square tile" math). `tileSize` is already scaled by the
 * caller (spacingPx * scale, clamped to at least 1px so a canvas is never created with a
 * zero/negative dimension at extreme zoom-out).
 */
function drawScreentoneTile(ctx: CanvasRenderingContext2D, tileSize: number, screentone: BubbleScreentone) {
  ctx.fillStyle = screentone.backgroundColor;
  ctx.fillRect(0, 0, tileSize, tileSize);
  ctx.fillStyle = hexToRgba(screentone.dotColor, screentone.opacity);

  const thickness = Math.max(0, tileSize * screentone.sizeRatio);
  if (screentone.pattern === "dots") {
    const radius = thickness / 2;
    if (radius > 0) {
      ctx.beginPath();
      ctx.arc(tileSize / 2, tileSize / 2, radius, 0, Math.PI * 2);
      ctx.fill();
    }
  } else if (screentone.pattern === "lines") {
    if (thickness > 0) ctx.fillRect(0, (tileSize - thickness) / 2, tileSize, thickness);
  } else {
    // crosshatch: a centered "+" (horizontal + vertical stripe) — a single rotation
    // transform on the resulting pattern then reads as a diagonal crosshatch.
    if (thickness > 0) {
      ctx.fillRect(0, (tileSize - thickness) / 2, tileSize, thickness);
      ctx.fillRect((tileSize - thickness) / 2, 0, thickness, tileSize);
    }
  }
}

/** Builds the offscreen tile canvas for a screentone pattern, scaled for the current
 * draw (editor zoom / export resolution) — `scale` is the same factor already threaded
 * through every other size field (strokeWidthPx, bevel's sizePx, etc). */
export function buildScreentoneTile(screentone: BubbleScreentone, scale: number) {
  const tileSize = Math.max(1, Math.round(screentone.spacingPx * scale));
  const canvas = createOffscreenCanvas(tileSize, tileSize);
  const ctx = canvas.getContext("2d");
  drawScreentoneTile(ctx, tileSize, screentone);
  return { canvas, tileSize };
}

/** Builds a repeating CanvasPattern for a screentone effect, rotated by `angleDeg` via
 * CanvasPattern.setTransform() (a plain rotation matrix around the pattern's own
 * origin) rather than baked into the tile — confirmed `@napi-rs/canvas` types both
 * `createPattern()` accepting its own `Canvas` type directly and `setTransform()` on the
 * resulting `CanvasPattern`. Callers assign the result straight to `ctx.fillStyle`. */
export function buildScreentonePattern(ctx: CanvasRenderingContext2D, screentone: BubbleScreentone, scale: number): CanvasPattern {
  const { canvas } = buildScreentoneTile(screentone, scale);
  const pattern = ctx.createPattern(canvas as unknown as HTMLCanvasElement, "repeat")!;
  if (screentone.angleDeg) {
    const rad = (screentone.angleDeg * Math.PI) / 180;
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);
    pattern.setTransform({ a: cos, b: sin, c: -sin, d: cos, e: 0, f: 0 });
  }
  return pattern;
}
