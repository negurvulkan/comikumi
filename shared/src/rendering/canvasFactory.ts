/**
 * The rendering modules in this folder are shared between the browser (live Konva
 * preview / client-side PNG export) and Node (server-side vector-PDF/PSD export,
 * see server/src/lib/pageRaster.ts) — everything here works against a plain
 * CanvasRenderingContext2D, but the handful of spots that need to CREATE an
 * offscreen canvas themselves (verticalTypesetting.ts's glyph ink-probe,
 * perspective.ts's warp source/destination canvases) can't call
 * `document.createElement("canvas")` directly, since `document` doesn't exist under
 * Node. This indirection lets each environment plug in its own canvas
 * implementation once at startup instead of every call site branching on
 * typeof window.
 */
export interface CanvasLike {
  width: number;
  height: number;
  getContext(id: "2d"): CanvasRenderingContext2D;
}

let factory: (width: number, height: number) => CanvasLike = (width, height) => {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  return canvas as unknown as CanvasLike;
};

/** Server-side bootstrap (e.g. server/src/lib/pageRaster.ts) calls this once with a
 * factory built on `@napi-rs/canvas`'s createCanvas — the browser default above
 * needs no explicit setup. */
export function setCanvasFactory(f: (width: number, height: number) => CanvasLike): void {
  factory = f;
}

export function createOffscreenCanvas(width: number, height: number): CanvasLike {
  return factory(width, height);
}
