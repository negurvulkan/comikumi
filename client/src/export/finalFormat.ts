export type LengthUnit = "mm" | "inch";

/** Converts a physical length into pixels at the given export resolution. */
export function toPx(value: number, unit: LengthUnit, dpi: number): number {
  return unit === "mm" ? (value * dpi) / 25.4 : value * dpi;
}

/** A small fixed list of common print trim sizes — there are no page-format presets
 * anywhere else in the codebase, so these exist purely as a convenience starting point;
 * width/height stay freely editable afterwards. */
export const COMIC_PAGE_PRESETS: { labelKey: string; widthMm: number; heightMm: number }[] = [
  { labelKey: "presetComicUs", widthMm: 168, heightMm: 260 },
  { labelKey: "presetMangaTankobon", widthMm: 128, heightMm: 182 },
  { labelKey: "presetA4", widthMm: 210, heightMm: 297 },
];

/**
 * Places `source` centered inside a targetWidthPx×targetHeightPx canvas, scaled down
 * (never up) to fit within the printable area left after subtracting `marginPx` from
 * every side — the classic print page model (page size, margin, live area). Unlike
 * uniformFormat.ts's "pad" fit mode (which only pads whichever single axis the source
 * falls short on relative to the *full* target), this guarantees at least `marginPx` of
 * background on all four sides by construction, since the fit is computed against the
 * shrunk (page size minus 2×margin) area rather than the full canvas.
 */
export function placeInFinalFormat(
  source: CanvasImageSource,
  sourceWidth: number,
  sourceHeight: number,
  targetWidthPx: number,
  targetHeightPx: number,
  marginPx: number,
  backgroundColor: string = "#ffffff"
): HTMLCanvasElement {
  const availableWidth = targetWidthPx - 2 * marginPx;
  const availableHeight = targetHeightPx - 2 * marginPx;
  if (availableWidth <= 0 || availableHeight <= 0) {
    throw new Error("Seitenrand ist für dieses Endformat zu groß");
  }

  const canvas = document.createElement("canvas");
  canvas.width = targetWidthPx;
  canvas.height = targetHeightPx;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("2D-Canvas-Kontext konnte nicht erstellt werden");

  ctx.fillStyle = backgroundColor;
  ctx.fillRect(0, 0, targetWidthPx, targetHeightPx);

  const fitScale = Math.min(availableWidth / sourceWidth, availableHeight / sourceHeight);
  const drawWidth = sourceWidth * fitScale;
  const drawHeight = sourceHeight * fitScale;
  const offsetX = (targetWidthPx - drawWidth) / 2;
  const offsetY = (targetHeightPx - drawHeight) / 2;
  ctx.drawImage(source, offsetX, offsetY, drawWidth, drawHeight);

  return canvas;
}
