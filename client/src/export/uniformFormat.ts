export type UniformFitMode = "stretch" | "pad" | "crop";

/** Below this, stretching a page to the target aspect ratio is close enough to
 * unnoticeable that it's applied automatically without asking — above it, the page
 * gets flagged for a manual pad/crop/stretch-anyway/skip decision (see
 * NormalizePreviewDialog.tsx). Not user-configurable in v1; a plain code constant
 * kept in one place so the number is easy to find and tune later. */
export const DISTORTION_WARNING_THRESHOLD = 0.06;

/** Median width/height across the volume's pages — used as the default target size
 * proposal in the "uniform format" export dialog. Median (not mean) so one oddly
 * sized page (e.g. an accidental double-page scan) doesn't skew the suggestion. */
export function suggestUniformTarget(pages: { width: number; height: number }[]): { width: number; height: number } {
  if (pages.length === 0) return { width: 0, height: 0 };
  const widths = pages.map((p) => p.width).sort((a, b) => a - b);
  const heights = pages.map((p) => p.height).sort((a, b) => a - b);
  const mid = Math.floor(pages.length / 2);
  const median = (sorted: number[]) => (sorted.length % 2 === 0 ? Math.round((sorted[mid - 1] + sorted[mid]) / 2) : sorted[mid]);
  return { width: median(widths), height: median(heights) };
}

/** How far a page's aspect ratio deviates from the target's — 0 means the page can be
 * stretched onto the target size with no shape change at all. */
export function computeDistortion(sourceWidth: number, sourceHeight: number, targetWidth: number, targetHeight: number): number {
  const sourceAspect = sourceWidth / sourceHeight;
  const targetAspect = targetWidth / targetHeight;
  return Math.abs(sourceAspect / targetAspect - 1);
}

/** Renders `source` onto a fresh targetWidth×targetHeight canvas using the given fit
 * mode. "pad"/"crop" mirror the min/max fitScale formula already used for Cut-Panel
 * "contain" replacement images (see shared/src/rendering/cutPanel.ts's
 * drawCutPanelForeground) — min() letterboxes with visible background, max() fills
 * the frame and lets the canvas clip whatever overflows. */
export function resizeToUniformFormat(
  source: CanvasImageSource,
  sourceWidth: number,
  sourceHeight: number,
  targetWidth: number,
  targetHeight: number,
  fitMode: UniformFitMode,
  backgroundColor: string = "#ffffff"
): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = targetWidth;
  canvas.height = targetHeight;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("2D-Canvas-Kontext konnte nicht erstellt werden");

  if (fitMode === "stretch") {
    ctx.drawImage(source, 0, 0, targetWidth, targetHeight);
    return canvas;
  }

  const fitScale = fitMode === "pad" ? Math.min(targetWidth / sourceWidth, targetHeight / sourceHeight) : Math.max(targetWidth / sourceWidth, targetHeight / sourceHeight);
  const drawWidth = sourceWidth * fitScale;
  const drawHeight = sourceHeight * fitScale;
  const offsetX = (targetWidth - drawWidth) / 2;
  const offsetY = (targetHeight - drawHeight) / 2;

  if (fitMode === "pad") {
    ctx.fillStyle = backgroundColor;
    ctx.fillRect(0, 0, targetWidth, targetHeight);
  }
  ctx.drawImage(source, offsetX, offsetY, drawWidth, drawHeight);
  return canvas;
}
