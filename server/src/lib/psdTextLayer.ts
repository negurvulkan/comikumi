import type { Justification, LayerTextData, TextStyle } from "ag-psd";
import type { Bubble, resolveBubbleStyle } from "../../../shared/src/layoutSchema.js";
import type { Box, FitResult } from "../../../shared/src/rendering/textLayout.js";

/** `{r,g,b}`, 0-255 each — ag-psd's Color shape (see its README's writing-text-layers
 * examples), NOT the 0-1 float range buildPdfPage.ts's own hexToRgb01 uses for pdf-lib. */
function hexToRgb255(hex: string): { r: number; g: number; b: number } {
  const clean = hex.replace("#", "");
  const full = clean.length === 3 ? clean.split("").map((c) => c + c).join("") : clean;
  const value = parseInt(full, 16) || 0;
  return { r: (value >> 16) & 255, g: (value >> 8) & 255, b: value & 255 };
}

const JUSTIFICATION_BY_ALIGN: Record<"left" | "center" | "right", Justification> = {
  left: "left",
  center: "center",
  right: "right",
};

export interface PsdTextLayerInput {
  bubble: Bubble;
  style: ReturnType<typeof resolveBubbleStyle>;
  fitted: FitResult;
  box: Box;
  /** From resolvePsdFontName() — `null` means "not safe enough for a real text layer,"
   * see that function's own doc comment. */
  postscriptName: string | null;
}

/**
 * Builds the `LayerTextData` for a real, Photoshop-Type-tool-editable PSD text layer —
 * or `null` when the bubble uses a feature Photoshop's native text engine can't
 * represent (see the plan's capability matrix), in which case the caller keeps the
 * existing raster-only layer unchanged. Reuses the SAME wrapped lines
 * (`fitted.lines`)/font size/line step already computed for the raster draw — no second
 * wrap pass, so the editable layer's line breaks match the raster exactly (until the
 * user edits it in Photoshop, at which point Photoshop's own paragraph engine takes
 * over within `boxBounds` — see the plan's "Update dialog" note).
 */
export function buildPsdTextLayerData(input: PsdTextLayerInput): LayerTextData | null {
  const { bubble, style, fitted, box, postscriptName } = input;

  if (bubble.shape !== "rect" && bubble.shape !== "oval") return null; // quad: no affine transform can represent its perspective warp
  if (style.direction === "vertical-rl") return null; // ag-psd: writing vertical orientation can crash Photoshop on open
  if (style.direction === "rtl") return null; // characterDirection support is unverified — stay conservative
  if (style.textGradient.enabled) return null; // TextStyle has no gradient fill field
  if (bubble.mergeGroupId != null) return null; // merged outline is a polygon union, not a rectangle boxBounds can represent
  if (!postscriptName) return null; // font not resolvable to a real file/PostScript name

  const textStyle: TextStyle = {
    font: { name: postscriptName },
    fontSize: fitted.fontSize,
    // autoLeading (ag-psd default: true) would let Photoshop recompute line spacing
    // from the font's own metrics instead of the exact value the raster already used
    // — explicitly off, matching the one confirmed-working reference implementation
    // (manga-typesetter's psd.js) found for this same ag-psd writer.
    autoLeading: false,
    leading: fitted.lineStep,
    fauxBold: false,
    fauxItalic: false,
    fillColor: hexToRgb255(style.color),
    // Always present (not just when an outline is active) — same defensive pattern
    // manga-typesetter's psd.js uses; strokeFlag (default false, see ag-psd's
    // defaultStyle) is what actually gates whether it's drawn, not its mere presence.
    strokeColor: hexToRgb255(style.textOutline.enabled ? style.textOutline.color : style.color),
  };
  if (style.textOutline.enabled) {
    textStyle.outlineWidth = style.textOutline.widthPx;
    textStyle.fillFlag = true;
    textStyle.strokeFlag = true;
    textStyle.fillFirst = true;
  }

  return {
    text: fitted.lines.map((line) => line.text).join("\n"),
    transform: [1, 0, 0, 1, box.x, box.y],
    orientation: "horizontal",
    // Explicit (ag-psd has no built-in default for this field) — matches the same
    // reference implementation; leaving it unset risks Photoshop substituting its own
    // anti-aliasing choice on the next redraw.
    antiAlias: "smooth",
    shapeType: "box",
    boxBounds: [0, 0, box.width, box.height],
    style: textStyle,
    paragraphStyle: { justification: JUSTIFICATION_BY_ALIGN[style.align] },
  };
}
