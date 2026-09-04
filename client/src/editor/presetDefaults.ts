import type { PresetTextFields, PresetBackgroundFields } from "../../../shared/src/presets";

/** Seed values used when a PresetFieldToggle is first checked on (see
 * PresetFieldToggle.tsx) — shared between PresetPropertiesPanel.tsx and
 * PresetManager.tsx (empty-form / builtin-add bookkeeping). */
export const DEFAULT_TEXT: Required<PresetTextFields> = {
  fontFamily: "Anime Ace",
  fontSize: 24,
  lineHeight: 1.2,
  align: "center",
  direction: "ltr",
  balloonAwareWrap: true,
  color: "#000000",
  textOutline: { enabled: false, color: "#000000", widthPx: 4 },
  textGradient: { enabled: false, colorStart: "#ffffff", colorEnd: "#6c8cff", angleDeg: 0 },
  textGlow: { enabled: false, color: "#66e0ff", blurPx: 16 },
  textDropShadow: { enabled: false, color: "#000000", blurPx: 8, offsetXPx: 4, offsetYPx: 4 },
};

export const DEFAULT_BACKGROUND: Required<PresetBackgroundFields> = {
  bubbleStyle: "none",
  fillColor: "#ffffff",
  strokeColor: "#000000",
  strokeWidthPx: 6,
  strokeDashPattern: [],
  strokeDashOffsetPx: 0,
  backgroundGradientFill: { enabled: false, colorStart: "#ffffff", colorEnd: "#6c8cff", angleDeg: 0 },
  backgroundGlow: { enabled: false, color: "#66e0ff", blurPx: 16 },
  backgroundDropShadow: { enabled: false, color: "#000000", blurPx: 8, offsetXPx: 4, offsetYPx: 4 },
  backgroundBevel: {
    enabled: false,
    style: "inner",
    direction: "up",
    sizePx: 6,
    angleDeg: 120,
    softenPx: 4,
    highlightColor: "#ffffff",
    highlightOpacity: 0.75,
    shadowColor: "#000000",
    shadowOpacity: 0.6,
  },
  svgFileName: null,
  tailStyle: "point",
  tailChainSegmentShape: "circle",
  tailChainSegments: 3,
  tailChainSpacing: 1,
  paddingRatio: 0.15,
};
