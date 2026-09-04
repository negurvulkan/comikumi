import { z } from "zod";
import type { LetteringPreset } from "./presets.js";

export const BubbleShapeSchema = z.enum(["rect", "oval", "quad"]);
export type BubbleShapeKind = z.infer<typeof BubbleShapeSchema>;

export const TextAlignSchema = z.enum(["left", "center", "right"]);
export type TextAlign = z.infer<typeof TextAlignSchema>;

export const TextDirectionSchema = z.enum(["ltr", "rtl", "vertical-rl"]);
export type TextDirection = z.infer<typeof TextDirectionSchema>;

export const PointSchema = z.object({ x: z.number(), y: z.number() });
export type Point = z.infer<typeof PointSchema>;

export const BubbleVisualStyleSchema = z.enum(["none", "speech", "thought", "shout", "svg"]);
export type BubbleVisualStyle = z.infer<typeof BubbleVisualStyleSchema>;

/**
 * How a bubble's tail connects to its body — independent of `bubbleStyle`
 * (any style with a tail can use any of these). "point" is the original
 * speech/shout behavior (seamlessly spliced into the outline); "chain" is
 * the original thought-bubble behavior generalized to configurable segment
 * shapes. See resolveEffectiveTailStyle() for the backward-compatible
 * fallback used when a saved Bubble predates this field.
 */
export const TailStyleSchema = z.enum(["point", "point-detached", "chain"]);
export type TailStyle = z.infer<typeof TailStyleSchema>;

export const TailChainSegmentShapeSchema = z.enum(["circle", "rect", "diamond"]);
export type TailChainSegmentShape = z.infer<typeof TailChainSegmentShapeSchema>;

/** tailStyle is optional on saved data — resolves the implicit pre-existing default (chain for thought bubbles, point for everything else) so old layouts render unchanged. */
export function resolveEffectiveTailStyle(bubbleStyle: BubbleVisualStyle, tailStyle: TailStyle | undefined): TailStyle {
  return tailStyle ?? (bubbleStyle === "thought" ? "chain" : "point");
}

/**
 * The two "which value actually applies" precedence chains reused across every
 * resolve*() function below (resolveBubbleStyle, resolveBubbleForm,
 * resolveCurvedTextStyle) — previously each field was hand-written as
 * `override?.[languageCode] ?? preset?.field ?? base.field` (or the two-tier variant
 * without a per-language override map), which meant the same three-way precedence had
 * to be re-typed correctly at every single field. Centralizing it here means a new
 * resolved field is one line, and can't accidentally get the precedence order wrong.
 */
/** Three-tier precedence: a per-language override map entry wins, then the linked
 * preset's value, then the entity's own base value. For fields that support a
 * per-language override (fontSize, align, textOutline, ...). */
function resolveLangField<T>(overrideMap: Record<string, T> | undefined, languageCode: string, presetValue: T | undefined, baseValue: T): T {
  return overrideMap?.[languageCode] ?? presetValue ?? baseValue;
}

/** Two-tier precedence: the linked preset's value wins, then the entity's own base
 * value. For fields with no per-language override (bubble background style fields —
 * geometry/tail-position skip preset resolution entirely, see resolveBubbleForm). */
function resolvePresetField<T>(presetValue: T | undefined, baseValue: T): T {
  return presetValue ?? baseValue;
}

/** Optional stroked border drawn around each glyph, behind the fill — same idea as strokeText/fillText layering. Per-language override available (e.g. a Latin translation wanting a heavier/lighter outline than the Japanese original) via textOutlineOverride on Bubble/CurvedTextElement. */
export const TextOutlineSchema = z.object({
  enabled: z.boolean().default(false),
  color: z.string().default("#000000"),
  widthPx: z.number().positive().default(4),
});
export type TextOutline = z.infer<typeof TextOutlineSchema>;

/** Optional linear gradient fill for the text, replacing the solid `color` when enabled. Per-language override available via textGradientOverride on Bubble/CurvedTextElement. */
export const TextGradientSchema = z.object({
  enabled: z.boolean().default(false),
  colorStart: z.string().default("#ffffff"),
  colorEnd: z.string().default("#6c8cff"),
  /** 0 = left-to-right, 90 = top-to-bottom. */
  angleDeg: z.number().default(0),
});
export type TextGradient = z.infer<typeof TextGradientSchema>;

/** Optional glow: a soft, unoffset colored shadow drawn as an underlay pass behind the
 * fill/stroke — see shared/src/rendering/shadowPasses.ts. Reused verbatim for text
 * (textGlow on Bubble/CurvedTextElement) and bubble backgrounds (backgroundGlow). */
export const EffectGlowSchema = z.object({
  enabled: z.boolean().default(false),
  color: z.string().default("#66e0ff"),
  blurPx: z.number().min(0).default(16),
});
export type EffectGlow = z.infer<typeof EffectGlowSchema>;

/** Optional drop shadow: an offset, blurred shadow drawn as an underlay pass behind the
 * fill/stroke — see shared/src/rendering/shadowPasses.ts. Reused verbatim for text
 * (textDropShadow) and bubble backgrounds (backgroundDropShadow). */
export const EffectShadowSchema = z.object({
  enabled: z.boolean().default(false),
  color: z.string().default("#000000"),
  blurPx: z.number().min(0).default(8),
  offsetXPx: z.number().default(4),
  offsetYPx: z.number().default(4),
});
export type EffectShadow = z.infer<typeof EffectShadowSchema>;

/** Optional linear gradient fill for a bubble's background, replacing the solid
 * fillColor when enabled — same shape as TextGradientSchema, kept separate since it's
 * background-only (never used on CurvedTextElement, which has no background). */
export const BubbleGradientFillSchema = z.object({
  enabled: z.boolean().default(false),
  colorStart: z.string().default("#ffffff"),
  colorEnd: z.string().default("#6c8cff"),
  angleDeg: z.number().default(0),
});
export type BubbleGradientFill = z.infer<typeof BubbleGradientFillSchema>;

export const BubbleBevelStyleSchema = z.enum(["inner", "outer", "emboss"]);
export type BubbleBevelStyle = z.infer<typeof BubbleBevelStyleSchema>;

export const BubbleBevelDirectionSchema = z.enum(["up", "down"]);
export type BubbleBevelDirection = z.infer<typeof BubbleBevelDirectionSchema>;

/** Optional bevel/emboss for a bubble's background — bubble-only (no text equivalent),
 * bubble-only (no per-language override, same as fillColor/backgroundGlow/etc).
 * Field names deliberately mirror ag-psd's real LayerEffectBevel (size/angle/style/
 * direction/highlightColor/shadowColor/highlightOpacity/shadowOpacity/soften) for a
 * possible future native-PSD-layer-effect exporter — `sizePx` not `depth`: Photoshop's
 * "Depth" is a separate 0-1000% intensity multiplier (ag-psd calls it `strength`), out
 * of scope for this v1's rendering. `style` covers 3 of Photoshop's 5 variants —
 * "pillow emboss" is approximated as `style: "emboss", direction: "down"`, and "stroke
 * emboss" is skipped (needs a stroke-effect concept this app doesn't have). See
 * drawBubbleBevel() in bubbleBackground.ts for how these render. */
export const BubbleBevelSchema = z.object({
  enabled: z.boolean().default(false),
  style: BubbleBevelStyleSchema.default("inner"),
  direction: BubbleBevelDirectionSchema.default("up"),
  sizePx: z.number().min(0).default(6),
  angleDeg: z.number().default(120),
  softenPx: z.number().min(0).default(4),
  highlightColor: z.string().default("#ffffff"),
  highlightOpacity: z.number().min(0).max(1).default(0.75),
  shadowColor: z.string().default("#000000"),
  shadowOpacity: z.number().min(0).max(1).default(0.6),
});
export type BubbleBevel = z.infer<typeof BubbleBevelSchema>;

export const BubbleScreentonePatternSchema = z.enum(["dots", "lines", "crosshatch"]);
export type BubbleScreentonePattern = z.infer<typeof BubbleScreentonePatternSchema>;

/** Procedural screentone/halftone fill ("Rastereffekt") — usable as a bubble's
 * background fill (backgroundScreentone on Bubble/BubbleForm) or as a text fill
 * (textScreentone on Bubble/CurvedTextElement, e.g. for halftone-styled SFX text). Same
 * schema shape either way — a screentone pattern is defined by the same params
 * regardless of what it fills. See shared/src/rendering/screentone.ts for how the tile
 * is generated and shared/src/rendering/textScreentone.ts for why text needs an
 * offscreen-mask composite in the two places glyphs are drawn with per-glyph rotation
 * (a CanvasPattern anchors to the CTM at fill() time, unlike CanvasGradient, which bakes
 * it in at creation time — see drawScreentoneMaskedGlyphs's doc comment). */
export const BubbleScreentoneSchema = z.object({
  enabled: z.boolean().default(false),
  pattern: BubbleScreentonePatternSchema.default("dots"),
  /** Tile size — distance between dot centers / line repeats, same schema units as
   * strokeWidthPx (scaled by `scale` at draw time like every other size field). */
  spacingPx: z.number().positive().default(8),
  /** 0-1 — dot radius or line thickness as a fraction of spacingPx. This IS the "tone
   * value": low = sparse/light, high = dense/dark, mirroring real screentone %. */
  sizeRatio: z.number().min(0).max(1).default(0.5),
  /** Classic screentone default is 45°. */
  angleDeg: z.number().default(45),
  dotColor: z.string().default("#000000"),
  backgroundColor: z.string().default("#ffffff"),
  opacity: z.number().min(0).max(1).default(1),
});
export type BubbleScreentone = z.infer<typeof BubbleScreentoneSchema>;

/**
 * Everything that defines a bubble's visible geometry + drawn background:
 * position/size/rotation plus (optionally) a real speech/thought/shout
 * bubble background the tool paints itself — for pages where the artist
 * forgot a bubble, or where the translated text needs more room than the
 * hand-drawn bubble has. Bundled into one type (rather than one Override map
 * per field) because these all change together — resizing a bubble for a
 * language usually means repositioning/restyling it too.
 */
export const BubbleFormSchema = z.object({
  x: z.number(),
  y: z.number(),
  width: z.number().positive(),
  height: z.number().positive(),
  rotation: z.number().default(0),
  bubbleStyle: BubbleVisualStyleSchema.default("none"),
  fillColor: z.string().default("#ffffff"),
  strokeColor: z.string().default("#000000"),
  strokeWidthPx: z.number().positive().default(6),
  /** Dash pattern for the border stroke, in the same units as strokeWidthPx — [] (default)
   * is a plain solid line, e.g. [8,4] a classic dash, [2,2] a dotted line. Passed straight
   * to ctx.setLineDash() (scaled) in bubbleBackground.ts; no `enabled` flag needed since an
   * empty array is already unambiguous. */
  strokeDashPattern: z.array(z.number().min(0)).default([]),
  /** Phase offset (same units) for where the dash pattern starts — ctx.lineDashOffset. */
  strokeDashOffsetPx: z.number().default(0),
  /** Linear gradient fill replacing the solid fillColor when enabled. */
  backgroundGradientFill: BubbleGradientFillSchema.default({ enabled: false, colorStart: "#ffffff", colorEnd: "#6c8cff", angleDeg: 0 }),
  /** Soft colored glow behind the bubble body. Only the main body silhouette casts it —
   * detached/chain tail styles don't (see drawBubbleBackground in bubbleBackground.ts). */
  backgroundGlow: EffectGlowSchema.default({ enabled: false, color: "#66e0ff", blurPx: 16 }),
  /** Offset drop shadow behind the bubble body. Same main-body-only scope as backgroundGlow. */
  backgroundDropShadow: EffectShadowSchema.default({ enabled: false, color: "#000000", blurPx: 8, offsetXPx: 4, offsetYPx: 4 }),
  backgroundBevel: BubbleBevelSchema.default({
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
  }),
  backgroundScreentone: BubbleScreentoneSchema.default({
    enabled: false,
    pattern: "dots",
    spacingPx: 8,
    sizeRatio: 0.5,
    angleDeg: 45,
    dotColor: "#000000",
    backgroundColor: "#ffffff",
    opacity: 1,
  }),
  /**
   * Speech/shout tail tip, or the thought-trail's target point — in LOCAL,
   * unrotated form coordinates (0,0 = this form's own top-left), so it moves
   * automatically with the bubble when it's dragged/resized/rotated instead
   * of needing separate rotation math (see BubbleShape.tsx's offsetX/offsetY
   * center-pivot comment for why local coords sidestep this).
   */
  tail: PointSchema.nullable().default(null),
  /**
   * Where on the bubble outline the tail attaches — LOCAL form coordinates,
   * same convention as `tail`. Null means "derive it automatically" (the
   * boundary point nearest to `tail`, the original/only behavior before this
   * field existed) — set once the user drags the anchor handle in
   * BubbleShape.tsx. Keeping this optional-via-null (rather than always
   * populating it) is what makes old saved bubbles render unchanged.
   */
  tailAnchor: PointSchema.nullable().default(null),
  /** Width (image px) of the tail's base where it meets the bubble outline — only relevant for tailStyle "point"/"point-detached", adjustable via two small handles either side of the tail tip. */
  tailWidth: z.number().positive().default(40),
  /** File name of an uploaded SVG contour under server/data/bubble-svgs — only used when bubbleStyle is "svg". */
  svgFileName: z.string().nullable().default(null),
  /** See resolveEffectiveTailStyle() for the fallback applied when unset. */
  tailStyle: TailStyleSchema.optional(),
  tailChainSegmentShape: TailChainSegmentShapeSchema.default("circle"),
  tailChainSegments: z.number().int().min(1).max(8).default(3),
  /** Multiplier on the gap between chain segments — 1 = original evenly-spread-to-the-tip spacing, <1 bunches segments closer to the bubble edge, >1 spreads them past that (possibly overshooting the tail tip). */
  tailChainSpacing: z.number().positive().default(1),
  /** Perpendicular bow amount (image px, same units as tailWidth) applied to the tail's edges — 0 = straight (default, unchanged behavior), positive/negative bows to either side. See bubbleBackground.ts's perpendicularOffset(). */
  tailCurve: z.number().default(0),
  /**
   * A straight clip line (through clipA/clipB, extended infinitely) that cuts the bubble
   * in half — everything on one side is not drawn, so the bubble can sit flush against a
   * panel border instead of overlapping it. Both points are LOCAL, unrotated form
   * coordinates, same convention as `tail`/`tailAnchor` (0,0 = this form's own top-left),
   * so the line moves automatically with the bubble on drag/resize/rotate. `null` on
   * either point means "no clip" — both must be set together (see clipHalfPlanePolygon in
   * bubbleBackground.ts, which no-ops when either is missing).
   */
  clipA: PointSchema.nullable().default(null),
  clipB: PointSchema.nullable().default(null),
  /** Which side of clipA/clipB is kept — false (default) keeps the side containing the
   * form's own center, true keeps the other side. */
  clipFlip: z.boolean().default(false),
  /** Overrides the automatic per-shape/style text-inset ratio (see paddingRatioFor in
   * shared/src/rendering/textLayout.ts) — null (default) keeps the automatic value; an
   * explicit 0-0.9 fraction lets the user dial in exactly how much breathing room text
   * has inside the bubble, instead of only the fixed rect/oval/SVG defaults. */
  paddingRatio: z.number().min(0).max(0.9).nullable().default(null),
});
export type BubbleForm = z.infer<typeof BubbleFormSchema>;

export const BubbleSchema = z.object({
  id: z.string(),
  shape: BubbleShapeSchema,
  x: z.number(),
  y: z.number(),
  width: z.number().positive(),
  height: z.number().positive(),
  rotation: z.number().default(0),
  /**
   * Only for shape "quad": the four corners (image-space px, order
   * top-left/top-right/bottom-right/bottom-left) that define a free-form
   * perspective quadrilateral — e.g. a door sign seen at an angle. Text is
   * warped via a projective transform (homography) to fit this quad, not
   * just rotated/skewed. x/y/width/height/rotation above still hold the
   * quad's bounding box for consistency but aren't used to render it.
   */
  corners: z.array(PointSchema).length(4).optional(),
  bubbleStyle: BubbleVisualStyleSchema.default("none"),
  fillColor: z.string().default("#ffffff"),
  strokeColor: z.string().default("#000000"),
  strokeWidthPx: z.number().positive().default(6),
  /** Dash pattern for the border stroke, in the same units as strokeWidthPx — [] (default)
   * is a plain solid line, e.g. [8,4] a classic dash, [2,2] a dotted line. Passed straight
   * to ctx.setLineDash() (scaled) in bubbleBackground.ts; no `enabled` flag needed since an
   * empty array is already unambiguous. */
  strokeDashPattern: z.array(z.number().min(0)).default([]),
  /** Phase offset (same units) for where the dash pattern starts — ctx.lineDashOffset. */
  strokeDashOffsetPx: z.number().default(0),
  backgroundGradientFill: BubbleGradientFillSchema.default({ enabled: false, colorStart: "#ffffff", colorEnd: "#6c8cff", angleDeg: 0 }),
  backgroundGlow: EffectGlowSchema.default({ enabled: false, color: "#66e0ff", blurPx: 16 }),
  backgroundDropShadow: EffectShadowSchema.default({ enabled: false, color: "#000000", blurPx: 8, offsetXPx: 4, offsetYPx: 4 }),
  backgroundBevel: BubbleBevelSchema.default({
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
  }),
  backgroundScreentone: BubbleScreentoneSchema.default({
    enabled: false,
    pattern: "dots",
    spacingPx: 8,
    sizeRatio: 0.5,
    angleDeg: 45,
    dotColor: "#000000",
    backgroundColor: "#ffffff",
    opacity: 1,
  }),
  tail: PointSchema.nullable().default(null),
  tailAnchor: PointSchema.nullable().default(null),
  tailWidth: z.number().positive().default(40),
  svgFileName: z.string().nullable().default(null),
  tailStyle: TailStyleSchema.optional(),
  tailChainSegmentShape: TailChainSegmentShapeSchema.default("circle"),
  tailChainSegments: z.number().int().min(1).max(8).default(3),
  tailChainSpacing: z.number().positive().default(1),
  tailCurve: z.number().default(0),
  /** See BubbleFormSchema's identically-named fields — same LOCAL/unrotated convention. */
  clipA: PointSchema.nullable().default(null),
  clipB: PointSchema.nullable().default(null),
  clipFlip: z.boolean().default(false),
  /** See BubbleFormSchema's identically-named field. */
  paddingRatio: z.number().min(0).max(0.9).nullable().default(null),
  /**
   * Non-destructive bubble merging: bubbles sharing the same `mergeGroupId` are drawn as
   * one continuous outline (the union of their individual boundaries) instead of
   * individually — see bubbleMerge.ts. Exactly one member per group should have
   * `mergePrimary: true`; that member's own `text`/tail fields are used for the whole
   * merged shape, the other members' `text`/tail are ignored while merged but kept as-is
   * in the data (un-merging just clears these two fields, restoring independent bubbles
   * with whatever text they still privately held). Deliberately NOT part of
   * BubbleFormSchema — this is a per-instance identity relationship, not a per-language
   * style/geometry bundle (same reasoning as `panelId`/`characterId` living here only).
   */
  mergeGroupId: z.string().nullable().default(null),
  mergePrimary: z.boolean().default(false),
  /**
   * Per-language replacement of this bubble's entire form (position, size,
   * rotation, visible background style) — e.g. a German translation needing
   * a bigger box than the Japanese original. Rect/oval only (not "quad",
   * whose corner-array geometry doesn't map onto x/y/width/height); missing
   * for a language simply falls back to the base fields above via
   * resolveBubbleForm().
   */
  formOverride: z.record(z.string(), BubbleFormSchema).optional(),
  fontFamily: z.string().default("Anime Ace"),
  fontSize: z.number().positive().default(24),
  lineHeight: z.number().positive().default(1.2),
  align: TextAlignSchema.default("center"),
  direction: TextDirectionSchema.default("ltr"),
  /** Opt-in per-row/per-column text width derived from the bubble's real outline instead
   * of one fixed inset rectangle — only has an effect for shape "oval" (see
   * ovalRowWidth/ovalColumnMaxRows in shared/src/rendering/textLayout.ts /
   * verticalTypesetting.ts). Off by default (undefined) so existing lettered pages keep
   * their current wrap unchanged; same optional/undefined-when-off convention as
   * `locked`/`isEffect` below rather than a defaulted boolean. Resolved through
   * resolveBubbleStyle (like align/direction below), NOT resolveBubbleForm — a bubble's
   * shape can't vary per language, but whether a given language's text should actually
   * use balloon-shaped wrapping can (e.g. a language whose translation runs long).
   * `balloonAwareWrapOverride` below is the matching per-language override map. */
  balloonAwareWrap: z.boolean().optional(),
  color: z.string().default("#000000"),
  textOutline: TextOutlineSchema.default({ enabled: false, color: "#000000", widthPx: 4 }),
  textGradient: TextGradientSchema.default({ enabled: false, colorStart: "#ffffff", colorEnd: "#6c8cff", angleDeg: 0 }),
  textGlow: EffectGlowSchema.default({ enabled: false, color: "#66e0ff", blurPx: 16 }),
  textDropShadow: EffectShadowSchema.default({ enabled: false, color: "#000000", blurPx: 8, offsetXPx: 4, offsetYPx: 4 }),
  textScreentone: BubbleScreentoneSchema.default({
    enabled: false,
    pattern: "dots",
    spacingPx: 8,
    sizeRatio: 0.5,
    angleDeg: 45,
    dotColor: "#000000",
    backgroundColor: "#ffffff",
    opacity: 1,
  }),
  text: z.record(z.string(), z.string()).default({}),
  /**
   * Per-language overrides — every field here falls back to the bubble's own
   * base value (fontSize/fontFamily/lineHeight/align/direction above) when a
   * language has no override set. Needed because scripts differ: Japanese
   * commonly wants a different font, tighter/looser line height, and
   * vertical-rl direction, while German/English stay horizontal ltr.
   */
  fontSizeOverride: z.record(z.string(), z.number().positive()).optional(),
  fontFamilyOverride: z.record(z.string(), z.string()).optional(),
  lineHeightOverride: z.record(z.string(), z.number().positive()).optional(),
  alignOverride: z.record(z.string(), TextAlignSchema).optional(),
  directionOverride: z.record(z.string(), TextDirectionSchema).optional(),
  balloonAwareWrapOverride: z.record(z.string(), z.boolean()).optional(),
  textOutlineOverride: z.record(z.string(), TextOutlineSchema).optional(),
  textGradientOverride: z.record(z.string(), TextGradientSchema).optional(),
  textGlowOverride: z.record(z.string(), EffectGlowSchema).optional(),
  textDropShadowOverride: z.record(z.string(), EffectShadowSchema).optional(),
  textScreentoneOverride: z.record(z.string(), BubbleScreentoneSchema).optional(),
  /** Manual assignment, not derived from geometry — which Panel (this page's
   * panels array) and which Character (project-wide) this bubble belongs to.
   * Null means unassigned; a stale id (panel/character deleted after being
   * assigned) is treated as unassigned by the report/inspector lookups. */
  panelId: z.string().nullable().default(null),
  characterId: z.string().nullable().default(null),
  /** Manual correction of this bubble's position within its reading-order group (its
   * panel, or the page's "unassigned" bucket if it has no panel) — absent means "use
   * the automatic Y-position sort". Only meaningful relative to sibling bubbles in the
   * same group at the moment it was set; see reportUtils.ts's moveBubbleInReadingOrder,
   * which renumbers the whole group on every manual reorder to keep values unambiguous. */
  readingOrderOverride: z.number().optional(),
  /** Live link to a projectwide LetteringPreset (shared/src/presets.ts) — for whichever
   * fields the preset defines, its value is resolved instead of this bubble's own base
   * field (see resolveBubbleStyle/resolveBubbleForm below), and updates immediately when
   * the preset changes. Null/stale (deleted preset) means unassigned, same convention as
   * panelId/characterId. */
  presetId: z.string().nullable().default(null),
  /** User-set protection against accidental drag/resize/rotate/reshape/delete/duplicate —
   * independent of the "translator" role's readOnly restriction. Deliberately `.optional()`
   * (not `.default(false)`): set to `true` when locked, `undefined` (not `false`) when
   * unlocked, so JSON.stringify drops the key entirely once unlocked — only ever written
   * to disk when the element was last locked. */
  locked: z.boolean().optional(),
  /** Markiert diese Bubble als Soundeffekt/Onomatopoetikum statt gesprochenen
   * Dialog — schließt sie aus Charakter-"wer sagt was"-Reports, generierten
   * Skript-Dialogzeilen und der Fehlende-Übersetzung-QA-Prüfung aus. NICHT
   * ausgeschlossen: Lesereihenfolge-Navigation, der Layers-Navigator und
   * Translation-Memory-Matching (SFX-Text bleibt dort ein normales Ziel). Same
   * `.optional()`/undefined-when-off convention as `locked` above. */
  isEffect: z.boolean().optional(),
  /** Explicit paint-order rank among ALL of the page's bubbles/images/curved texts —
   * unrelated to `readingOrderOverride` above (that's report/script/translation
   * sequencing; this is what's drawn on top of what). Absent means "use the default
   * type-based stacking" (see `pageLayerOrder()` below) — only ever set once an
   * element has been explicitly brought to front/sent to back via the Layers
   * navigator or the bubble context menu. */
  layerOrderOverride: z.number().optional(),
});
export type Bubble = z.infer<typeof BubbleSchema>;

/**
 * Shifts a bubble's position (and everything position-derived: quad corners, per-language
 * form overrides) by (dx, dy). Deliberately does NOT touch `tail`/`tailAnchor` — those are
 * already LOCAL, box-relative coordinates (see BubbleFormSchema doc comments above), so
 * they stay correct automatically when the box itself moves. This is also exactly the
 * conversion needed to re-parent a bubble to/from a Panel: since a child bubble's `x`/`y`
 * are relative to its panel's `origin` (see PanelPointsSchema.origin), attaching is
 * `offsetBubble(bubble, -origin.x, -origin.y)` and detaching is `offsetBubble(bubble,
 * +origin.x, +origin.y)` — the same field list applies either way. Shared between the
 * client editor store (drag/nudge/duplicate) and this file's own PageLayout migration
 * (below), which needs the identical field list on raw, not-yet-validated data.
 */
export function offsetBubble<T extends Pick<Bubble, "x" | "y" | "corners" | "formOverride">>(b: T, dx: number, dy: number): T {
  return {
    ...b,
    x: b.x + dx,
    y: b.y + dy,
    corners: b.corners ? b.corners.map((c) => ({ x: c.x + dx, y: c.y + dy })) : b.corners,
    formOverride: b.formOverride
      ? Object.fromEntries(Object.entries(b.formOverride).map(([lang, f]) => [lang, { ...f, x: f.x + dx, y: f.y + dy }]))
      : b.formOverride,
  };
}

/**
 * Resolves the effective font size/family/line-height/align/direction/color for a given
 * language — the per-language override if set, otherwise a field the bubble's linked
 * preset defines (see shared/src/presets.ts), otherwise the bubble's own base value.
 * Single source of truth used by the live preview, the PNG export, and the inspector so
 * they can never disagree on which value applies. `presets` defaults to `[]` so callers
 * that don't care about preset resolution (e.g. reportUtils.ts's position-only sort)
 * don't need to pass anything.
 */
export function resolveBubbleStyle(bubble: Bubble, languageCode: string, presets: LetteringPreset[] = []) {
  const preset = presets.find((p) => p.id === bubble.presetId);
  return {
    fontSize: resolveLangField(bubble.fontSizeOverride, languageCode, preset?.text.fontSize, bubble.fontSize),
    fontFamily: resolveLangField(bubble.fontFamilyOverride, languageCode, preset?.text.fontFamily, bubble.fontFamily),
    lineHeight: resolveLangField(bubble.lineHeightOverride, languageCode, preset?.text.lineHeight, bubble.lineHeight),
    align: resolveLangField(bubble.alignOverride, languageCode, preset?.text.align, bubble.align),
    direction: resolveLangField(bubble.directionOverride, languageCode, preset?.text.direction, bubble.direction),
    balloonAwareWrap: resolveLangField(bubble.balloonAwareWrapOverride, languageCode, preset?.text.balloonAwareWrap, bubble.balloonAwareWrap),
    color: resolvePresetField(preset?.text.color, bubble.color),
    textOutline: resolveLangField(bubble.textOutlineOverride, languageCode, preset?.text.textOutline, bubble.textOutline),
    textGradient: resolveLangField(bubble.textGradientOverride, languageCode, preset?.text.textGradient, bubble.textGradient),
    textGlow: resolveLangField(bubble.textGlowOverride, languageCode, preset?.text.textGlow, bubble.textGlow),
    textDropShadow: resolveLangField(bubble.textDropShadowOverride, languageCode, preset?.text.textDropShadow, bubble.textDropShadow),
    textScreentone: resolveLangField(bubble.textScreentoneOverride, languageCode, preset?.text.textScreentone, bubble.textScreentone),
  };
}

/**
 * Resolves the effective position/size/rotation/visible-background for a given
 * language — a per-language form override always wins if set (it's a deliberate,
 * complete replacement of the whole bundle); otherwise geometry/tail-position comes
 * straight from the bubble itself (never preset-driven — that's per-instance, not
 * "style"), while the background-style fields fall back through the bubble's linked
 * preset before the bubble's own base value. Single source of truth used by the live
 * preview, the PNG export, and the inspector.
 */
export function resolveBubbleForm(bubble: Bubble, languageCode: string, presets: LetteringPreset[] = []): BubbleForm {
  const override = bubble.formOverride?.[languageCode];
  if (override) return override;
  const preset = presets.find((p) => p.id === bubble.presetId);
  return {
    x: bubble.x,
    y: bubble.y,
    width: bubble.width,
    height: bubble.height,
    rotation: bubble.rotation,
    bubbleStyle: resolvePresetField(preset?.background.bubbleStyle, bubble.bubbleStyle),
    fillColor: resolvePresetField(preset?.background.fillColor, bubble.fillColor),
    strokeColor: resolvePresetField(preset?.background.strokeColor, bubble.strokeColor),
    strokeWidthPx: resolvePresetField(preset?.background.strokeWidthPx, bubble.strokeWidthPx),
    strokeDashPattern: resolvePresetField(preset?.background.strokeDashPattern, bubble.strokeDashPattern),
    strokeDashOffsetPx: resolvePresetField(preset?.background.strokeDashOffsetPx, bubble.strokeDashOffsetPx),
    backgroundGradientFill: resolvePresetField(preset?.background.backgroundGradientFill, bubble.backgroundGradientFill),
    backgroundGlow: resolvePresetField(preset?.background.backgroundGlow, bubble.backgroundGlow),
    backgroundDropShadow: resolvePresetField(preset?.background.backgroundDropShadow, bubble.backgroundDropShadow),
    backgroundBevel: resolvePresetField(preset?.background.backgroundBevel, bubble.backgroundBevel),
    backgroundScreentone: resolvePresetField(preset?.background.backgroundScreentone, bubble.backgroundScreentone),
    tail: bubble.tail,
    tailAnchor: bubble.tailAnchor,
    tailWidth: bubble.tailWidth,
    svgFileName: resolvePresetField(preset?.background.svgFileName, bubble.svgFileName),
    tailStyle: resolvePresetField(preset?.background.tailStyle, bubble.tailStyle),
    tailChainSegmentShape: resolvePresetField(preset?.background.tailChainSegmentShape, bubble.tailChainSegmentShape),
    tailChainSegments: resolvePresetField(preset?.background.tailChainSegments, bubble.tailChainSegments),
    tailChainSpacing: resolvePresetField(preset?.background.tailChainSpacing, bubble.tailChainSpacing),
    tailCurve: bubble.tailCurve,
    clipA: bubble.clipA,
    clipB: bubble.clipB,
    clipFlip: bubble.clipFlip,
    paddingRatio: resolvePresetField(preset?.background.paddingRatio, bubble.paddingRatio),
  };
}

/**
 * A placed raster image (e.g. a redrawn/translated poster or sign patch) —
 * for cases the text tool can't cover. Same free-form quad + perspective
 * warp as a "quad" bubble, just warping an uploaded image instead of text.
 * Position/opacity are shared across languages, but — same idea as
 * Bubble.text — the actual picture can differ per language (e.g. a poster
 * redrawn with German vs. Japanese lettering), keyed by language code.
 */
export const ImageElementSchema = z.object({
  id: z.string(),
  corners: z.array(PointSchema).length(4),
  opacity: z.number().min(0).max(1).default(1),
  /** language code -> file name of an uploaded image under server/data/images. */
  files: z.record(z.string(), z.string()).default({}),
  /** See Bubble.locked's doc comment — same semantics, same reason for `.optional()`
   * instead of `.default(false)`. */
  locked: z.boolean().optional(),
  /** See Bubble.layerOrderOverride's doc comment — same semantics. */
  layerOrderOverride: z.number().optional(),
});
export type ImageElement = z.infer<typeof ImageElementSchema>;

/** The file to show for a language, falling back to any other assigned file so a translated-poster element never just goes blank. */
export function imageFileForLanguage(element: ImageElement, languageCode: string): string | undefined {
  return element.files[languageCode] ?? Object.values(element.files)[0];
}

/**
 * A freestanding title/effect text element that follows a cubic Bézier curve
 * instead of wrapping inside a bubble box — e.g. a logo-style title or an
 * onomatopoeia ("BOOM!") arcing across a splash page. Architecturally a
 * sibling of `ImageElement` (own array in `PageLayout`, own 4 control
 * points in absolute image-space px, no enclosing box/rotation needed since
 * the points themselves define the shape) rather than a mode bolted onto
 * `Bubble` — curved text usually belongs to no speech bubble at all.
 * Deliberately single-line only (no direction/vertical, no quad-perspective
 * combination) to keep this a focused "title/effect" tool, not a second full
 * text-layout system.
 */
export const CurvedTextElementSchema = z.object({
  id: z.string(),
  /** 4 cubic-bezier control points, absolute image-space px (same convention as ImageElement.corners/Bubble quad corners). */
  points: z.array(PointSchema).length(4),
  fontFamily: z.string().default("Anime Ace"),
  fontSize: z.number().positive().default(48),
  align: TextAlignSchema.default("center"),
  color: z.string().default("#000000"),
  textOutline: TextOutlineSchema.default({ enabled: false, color: "#000000", widthPx: 4 }),
  textGradient: TextGradientSchema.default({ enabled: false, colorStart: "#ffffff", colorEnd: "#6c8cff", angleDeg: 0 }),
  textGlow: EffectGlowSchema.default({ enabled: false, color: "#66e0ff", blurPx: 16 }),
  textDropShadow: EffectShadowSchema.default({ enabled: false, color: "#000000", blurPx: 8, offsetXPx: 4, offsetYPx: 4 }),
  textScreentone: BubbleScreentoneSchema.default({
    enabled: false,
    pattern: "dots",
    spacingPx: 8,
    sizeRatio: 0.5,
    angleDeg: 45,
    dotColor: "#000000",
    backgroundColor: "#ffffff",
    opacity: 1,
  }),
  text: z.record(z.string(), z.string()).default({}),
  /** Same per-language override pattern as Bubble's fontSizeOverride etc. */
  fontSizeOverride: z.record(z.string(), z.number().positive()).optional(),
  fontFamilyOverride: z.record(z.string(), z.string()).optional(),
  alignOverride: z.record(z.string(), TextAlignSchema).optional(),
  textOutlineOverride: z.record(z.string(), TextOutlineSchema).optional(),
  textGradientOverride: z.record(z.string(), TextGradientSchema).optional(),
  textGlowOverride: z.record(z.string(), EffectGlowSchema).optional(),
  textDropShadowOverride: z.record(z.string(), EffectShadowSchema).optional(),
  textScreentoneOverride: z.record(z.string(), BubbleScreentoneSchema).optional(),
  /** Same live-preset-link idea as Bubble.presetId — only the text-style subset of a
   * preset applies (curved text has no bubble background). */
  presetId: z.string().nullable().default(null),
  /** See Bubble.locked's doc comment — same semantics, same reason for `.optional()`
   * instead of `.default(false)`. */
  locked: z.boolean().optional(),
  /** See Bubble.layerOrderOverride's doc comment — same semantics. */
  layerOrderOverride: z.number().optional(),
});
export type CurvedTextElement = z.infer<typeof CurvedTextElementSchema>;

/** Resolves the effective font/size/align/color/outline/gradient for a given language —
 * same precedence idea as resolveBubbleStyle (language override > linked preset > own
 * base value). `presets` defaults to `[]` for callers that don't care. */
export function resolveCurvedTextStyle(el: CurvedTextElement, languageCode: string, presets: LetteringPreset[] = []) {
  const preset = presets.find((p) => p.id === el.presetId);
  return {
    fontFamily: resolveLangField(el.fontFamilyOverride, languageCode, preset?.text.fontFamily, el.fontFamily),
    fontSize: resolveLangField(el.fontSizeOverride, languageCode, preset?.text.fontSize, el.fontSize),
    align: resolveLangField(el.alignOverride, languageCode, preset?.text.align, el.align),
    color: resolvePresetField(preset?.text.color, el.color),
    textOutline: resolveLangField(el.textOutlineOverride, languageCode, preset?.text.textOutline, el.textOutline),
    textGradient: resolveLangField(el.textGradientOverride, languageCode, preset?.text.textGradient, el.textGradient),
    textGlow: resolveLangField(el.textGlowOverride, languageCode, preset?.text.textGlow, el.textGlow),
    textDropShadow: resolveLangField(el.textDropShadowOverride, languageCode, preset?.text.textDropShadow, el.textDropShadow),
    textScreentone: resolveLangField(el.textScreentoneOverride, languageCode, preset?.text.textScreentone, el.textScreentone),
  };
}

export function createCurvedTextElement(partial: {
  id: string;
  points: Point[];
  fontFamily?: string;
  fontSize?: number;
}): CurvedTextElement {
  return CurvedTextElementSchema.parse({
    fontFamily: "Anime Ace",
    fontSize: 48,
    align: "center",
    color: "#000000",
    textOutline: { enabled: false, color: "#000000", widthPx: 4 },
    textGradient: { enabled: false, colorStart: "#ffffff", colorEnd: "#6c8cff", angleDeg: 0 },
    textGlow: { enabled: false, color: "#66e0ff", blurPx: 16 },
    textDropShadow: { enabled: false, color: "#000000", blurPx: 8, offsetXPx: 4, offsetYPx: 4 },
    textScreentone: { enabled: false, pattern: "dots", spacingPx: 8, sizeRatio: 0.5, angleDeg: 45, dotColor: "#000000", backgroundColor: "#ffffff", opacity: 1 },
    text: {},
    ...partial,
  });
}

/**
 * Rotates the axis-aligned corners of a box by `rotationDeg` around the box's own
 * center — same convention as the old center-anchored Konva Group rotation this
 * replaces. Used only to migrate legacy box-shaped panels (see PanelSchema below)
 * into their equivalent 4-corner polygon.
 */
function rotatedBoxCorners(x: number, y: number, width: number, height: number, rotationDeg: number): Point[] {
  const cx = x + width / 2;
  const cy = y + height / 2;
  const rad = (rotationDeg * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  return boxCorners(x, y, width, height).map((p) => {
    const dx = p.x - cx;
    const dy = p.y - cy;
    return { x: cx + dx * cos - dy * sin, y: cy + dx * sin + dy * cos };
  });
}

/**
 * A drawn reference region marking one comic panel on the page — purely an editing-time
 * annotation (dashed outline + label in the canvas preview) that bubbles can be manually
 * assigned to via Bubble.panelId, used to group the "wer sagt was in welchem Panel"-style
 * reports. Never drawn into the exported PNG. A freeform polygon (not just a rectangle)
 * since real manga panels are often diagonally cut or stepped, not strictly rectangular —
 * the shape is reformed by dragging/adding/removing individual vertices instead of via
 * rotate/scale handles.
 */
/** Cut-Panel behavior bundle — see PanelPointsSchema.cut's doc comment for the full
 * explanation. Extracted as a named schema so it can be reused both as a panel's base
 * cut state and inside a per-language `languageOverride` entry (see below). */
export const PanelCutSchema = z.object({
  cutOrigin: PointSchema,
  holeFill: z.object({
    mode: z.enum(["auto", "manual"]).default("auto"),
    /** Concrete hex color — always set, even in "auto" mode (sampled once from the
     * surrounding area at cut time, see holeFillColor.ts). Rendering only ever reads
     * this stored value, never re-samples live, so the editor preview and the PNG
     * export can never disagree. */
    color: z.string(),
  }),
  /** When true: the content is only ever painted over at its original spot (the
   * hole-fill), never redrawn anywhere — the panel is effectively removed from the
   * page. Structurally the panel record (geometry, child-bubble assignment) is
   * completely untouched and this is reversible any time by unchecking it — no file
   * or pixel is ever permanently changed. Counts as semantically absent for anything
   * that turns `layout.panels` into groups (script, reports, reading order) — see
   * existingPanels() in reportUtils.ts. Optional instead of `.default(false)`, same
   * reasoning as Bubble.locked: only stored when last set. */
  removed: z.boolean().optional(),
  /** Mirrors the panel's content left-right (around its own bounding-box center) before
   * drawing it — original cut-out or replacement image alike. Lives on the cut bundle (not
   * a separate per-panel field) so it naturally inherits the same per-language scoping as
   * everything else here: flipping only the "de" version while "ja" keeps showing the
   * original orientation is exactly a `languageOverride` entry with `flipHorizontal: true`.
   * Optional instead of `.default(false)`, same reasoning as `removed`. */
  flipHorizontal: z.boolean().optional(),
  /** Shows an uploaded replacement image instead of the original cut-out content —
   * same per-language file-map convention as ImageElement.files/imageFileForLanguage
   * (see cutPanelReplacementFileForLanguage below). Mutually exclusive with `removed`
   * in the UI (PanelInspector.tsx presents one three-way choice), but `removed` always
   * wins if both somehow end up set — see drawCutPanelContent() in cutPanel.ts. No
   * true 4-corner perspective warp (unlike ImageElement/quad bubbles): a Panel polygon
   * can have any number of vertices, not just 4, so a homography isn't well-defined —
   * the replacement image fills the polygon's bounding box (see `fit`), then gets
   * clipped to its actual (possibly non-quad) shape. */
  replacement: z
    .object({
      files: z.record(z.string(), z.string()).default({}),
      /** Only drawn when a replacement image is actually shown — unlike `Panel.color`
       * (pure editor outline, never exported), this border is rendered into the PNG. */
      border: z.object({ color: z.string(), widthPx: z.number().positive() }).optional(),
      /** How the replacement image fills the panel's bounding box — "stretch" (default,
       * original/only behavior before this field existed) distorts the image to match the
       * box exactly; "contain" scales it uniformly to fit inside instead, preserving its
       * own aspect ratio, and letterboxes the remaining space with `holeFill.color` (the
       * same color already used to cover this panel's vacated original spot). */
      fit: z.enum(["stretch", "contain"]).default("stretch"),
    })
    .optional(),
});
export type PanelCut = z.infer<typeof PanelCutSchema>;

export const PanelPointsSchema = z.object({
  id: z.string(),
  points: z.array(PointSchema).min(3),
  /** Empty means "show the auto-numbered label" (Panel {index+1} by array position). */
  label: z.string().default(""),
  color: z.string().default("#6c8cff"),
  /**
   * Anchor a child Bubble's coordinates are relative to (see Bubble.panelId) —
   * deliberately NOT recomputed from the live polygon's bounds. Set once at creation
   * (bounding-box top-left of the initial polygon) and moved only by a rigid whole-panel
   * translate (dragging the panel body, nudging/duplicating a selected panel) — a
   * single-vertex reshape never touches it. If it were derived from polygonBounds() on
   * every read instead, reshaping a corner that happens to be the bounding box's min
   * corner would silently drag every child bubble along with it, which is surprising:
   * reshaping the outline should never move its contents, only a deliberate move should.
   * Always the BASE anchor — unaffected by `languageOverride` (child-bubble coordinates
   * stay relative to this regardless of which language is active).
   */
  origin: PointSchema,
  /** See Bubble.locked's doc comment — same semantics, same reason for `.optional()`
   * instead of `.default(false)`. Deliberately base-wide, not per-language — a lock
   * should hold regardless of which language happens to be active. */
  locked: z.boolean().optional(),
  /** Only set when this Panel is a "Cut-Panel" (see FEATURES.md#cut-panel) — its content
   * is visually detached from the page's `_empty` source image and can be repositioned.
   * `cutOrigin` is `origin`'s value at the moment of cutting, never updated afterward; the
   * difference between it and the panel's *current* `origin` ("how far has it been moved
   * since cutting") together with the panel's *current* `points` (which change
   * independently on a vertex reshape) is enough to derive, at any time, exactly which
   * region of the original source image is shown here — see cutPanelDelta() in
   * client/src/export/cutPanel.ts, shared by the live editor preview and the PNG export.
   * No second polygon or persisted cropped asset is stored. This is the BASE/fallback
   * used for any language with no `languageOverride` entry — see resolvePanelForLanguage(). */
  cut: PanelCutSchema.optional(),
  /**
   * Same "full bundle replaces base, falls back to base when absent" pattern as
   * Bubble.formOverride — a language entry here replaces `points`+`origin`+`cut`
   * completely for that language; a language with no entry behaves exactly like the
   * base (see resolvePanelForLanguage() below). This is what lets the SAME panel be a
   * plain, untouched reference marker in "ja" (the base, no cut) while being
   * moved/removed/replaced in "de"/"en" (an override with its own `cut`) — one entity
   * for both roles, per language. Deliberately does NOT affect Bubble.panelId
   * coordinates, which always stay relative to the BASE `origin` above regardless of
   * which language is active — translators reposition bubbles per language
   * independently if needed, so the parent-child math doesn't need to become
   * language-aware too.
   */
  languageOverride: z
    .record(
      z.string(),
      z.object({
        points: z.array(PointSchema).min(3),
        origin: PointSchema,
        cut: PanelCutSchema.optional(),
      })
    )
    .optional(),
});

/** Bounding-box top-left of a polygon — the natural, deterministic default for a new
 * panel's `origin` (see PanelPointsSchema.origin doc comment). */
export function originFromPoints(points: Point[]): Point {
  const b = polygonBounds(points);
  return { x: b.minX, y: b.minY };
}

/**
 * Migrates a pre-polygon panel (`x/y/width/height/rotation`) into its equivalent 4-corner
 * polygon before validation, so old saved layouts keep rendering unchanged but become
 * freely reshapeable immediately. Zod strips the now-unknown legacy fields from the
 * parsed output automatically. Also backfills `origin` for any panel saved before that
 * field existed (both the legacy-box case and the already-`points` case) — derived from
 * the (possibly just-migrated) polygon's bounds, so re-saving preserves the exact same
 * visual layout under the new coordinate scheme. Panels that already have both `points`
 * and `origin` pass through untouched.
 */
export const PanelSchema = z.preprocess((raw) => {
  if (raw && typeof raw === "object") {
    if (!("points" in raw) && "width" in raw && "height" in raw) {
      const legacy = raw as { x: number; y: number; width: number; height: number; rotation?: number };
      const points = rotatedBoxCorners(legacy.x, legacy.y, legacy.width, legacy.height, legacy.rotation ?? 0);
      return { ...legacy, points, origin: originFromPoints(points) };
    }
    if ("points" in raw && !("origin" in raw)) {
      return { ...raw, origin: originFromPoints((raw as { points: Point[] }).points) };
    }
  }
  return raw;
}, PanelPointsSchema);
export type Panel = z.infer<typeof PanelPointsSchema>;

export function createPanel(partial: Partial<Panel> & Pick<Panel, "id" | "points">): Panel {
  return PanelPointsSchema.parse({ origin: originFromPoints(partial.points), ...partial });
}

/** The label to display for a panel — its custom label if set, otherwise "Panel N"
 * derived from its position in the page's panels array (1-based, reading/creation order). */
export function panelDisplayLabel(panel: Panel, index: number): string {
  return panel.label.trim() || `Panel ${index + 1}`;
}

/** Same per-language fallback convention as imageFileForLanguage() (falls back to
 * whichever language does have a file, rather than showing nothing) — for a Cut-Panel's
 * replacement image. Takes an already-*resolved* cut (see resolvePanelForLanguage() —
 * callers resolve the panel for the active language first, so a language with no active
 * cut at all — e.g. an untouched "ja" original — correctly shows no replacement rather
 * than falling back to some other language's file). Undefined when there's no
 * `cut.replacement` at all, or it has no files yet. */
export function cutPanelReplacementFileForLanguage(cut: PanelCut | undefined, languageCode: string): string | undefined {
  const files = cut?.replacement?.files;
  if (!files) return undefined;
  return files[languageCode] ?? Object.values(files)[0];
}

/** A panel's effective points/origin/cut for a given language — mirrors
 * resolveBubbleForm()'s precedence: a `languageOverride` entry for this language replaces
 * the whole bundle, otherwise the panel's base fields apply. This is the single place
 * every renderer/UI component should go through instead of reading
 * `panel.points`/`panel.origin`/`panel.cut` directly, so "which language is active"
 * always resolves consistently. Does NOT affect Bubble.panelId's coordinate anchor,
 * which always uses the base `origin` (see Panel.languageOverride's doc comment). */
export interface ResolvedPanel {
  points: Point[];
  origin: Point;
  cut?: PanelCut;
}
export function resolvePanelForLanguage(panel: Panel, languageCode: string): ResolvedPanel {
  const override = panel.languageOverride?.[languageCode];
  if (override) return { points: override.points, origin: override.origin, cut: override.cut };
  return { points: panel.points, origin: panel.origin, cut: panel.cut };
}

/** Axis-aligned bounding box of a polygon — used for panel label placement and
 * top-to-bottom sort order in the reports (reportUtils.ts). */
export function polygonBounds(points: Point[]): { minX: number; minY: number; maxX: number; maxY: number } {
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  return { minX: Math.min(...xs), minY: Math.min(...ys), maxX: Math.max(...xs), maxY: Math.max(...ys) };
}

const PageLayoutObjectSchema = z.object({
  page: z.string(),
  sourceImage: z.string(),
  imageWidth: z.number().positive(),
  imageHeight: z.number().positive(),
  bubbles: z.array(BubbleSchema),
  images: z.array(ImageElementSchema).default([]),
  curvedTexts: z.array(CurvedTextElementSchema).default([]),
  panels: z.array(PanelSchema).default([]),
  /** When true AND a cached cleaned (text-removed/inpainted) version of this page's
   * scan exists on the server, rendering (editor canvas, PNG/PSD/PDF export,
   * thumbnails) uses that instead of the raw scan as the base layer — see
   * server/src/lib/inpainting.ts and docs/inpainting-model-provenance.md. Silently
   * falls back to the raw scan if the cache is missing/invalidated (e.g. the scan was
   * replaced since cleaning) — never an error, same resilience principle as every
   * other derived-artifact cache in this app. */
  useCleanedBackground: z.boolean().default(false),
  /** Bumped to 2 the first time a layout is migrated for panel-relative bubble
   * coordinates (see the z.preprocess below) — everything saved by the app from that
   * point on carries schemaVersion 2 forward, so the migration only ever runs once. */
  schemaVersion: z.number().default(1),
});

/** Same box→points + origin derivation PanelSchema's own preprocess uses, applied here
 * to a raw (not-yet-validated) panel object — needed one level up so the PageLayout
 * migration below can resolve each panel's origin before the nested schemas run. */
function derivePanelOrigin(rawPanel: unknown): Point {
  if (rawPanel && typeof rawPanel === "object") {
    const p = rawPanel as Record<string, unknown>;
    if (!("points" in p) && "width" in p) {
      const legacy = p as { x: number; y: number; width: number; height: number; rotation?: number };
      return originFromPoints(rotatedBoxCorners(legacy.x, legacy.y, legacy.width, legacy.height, legacy.rotation ?? 0));
    }
    if (Array.isArray(p.points)) return originFromPoints(p.points as Point[]);
  }
  return { x: 0, y: 0 };
}

/**
 * Bubbles used to reference a Panel purely informationally (Bubble.panelId), with x/y
 * always absolute regardless — now that a child bubble's x/y/corners/formOverride are
 * relative to its panel's origin, an old saved layout with pre-existing panelId
 * assignments would be silently misinterpreted (its already-absolute coordinates read as
 * if they were relative). This preprocess runs once per file (guarded by
 * schemaVersion < 2): for every bubble whose panelId points at a real panel, it subtracts
 * that panel's derived origin from the bubble's x/y/corners/formOverride[*].x/y — the
 * exact same field list offsetBubble() shifts — on raw, pre-Zod data, then marks the file
 * as migrated. A bubble with no (or a stale) panelId is left untouched (already correctly
 * absolute). Mirrors the technique PanelSchema's own preprocess already uses one level
 * down (legacy box → polygon), just cross-referential across both arrays.
 */
export const PageLayoutSchema = z.preprocess((raw) => {
  if (!raw || typeof raw !== "object") return raw;
  const obj = raw as Record<string, unknown>;
  const version = typeof obj.schemaVersion === "number" ? obj.schemaVersion : 1;
  if (version >= 2) return obj;

  const rawPanels = Array.isArray(obj.panels) ? obj.panels : [];
  const originById = new Map<string, Point>(
    rawPanels
      .filter((p): p is Record<string, unknown> => !!p && typeof p === "object" && typeof (p as { id?: unknown }).id === "string")
      .map((p) => [(p as { id: string }).id, derivePanelOrigin(p)])
  );

  const rawBubbles = Array.isArray(obj.bubbles) ? obj.bubbles : [];
  const migratedBubbles = rawBubbles.map((b) => {
    if (!b || typeof b !== "object") return b;
    const bubbleObj = b as Record<string, unknown>;
    const panelId = bubbleObj.panelId as string | null | undefined;
    const origin = panelId ? originById.get(panelId) : undefined;
    if (!origin) return bubbleObj;
    return offsetBubble(bubbleObj as unknown as Bubble, -origin.x, -origin.y);
  });

  return { ...obj, bubbles: migratedBubbles, schemaVersion: 2 };
}, PageLayoutObjectSchema);
export type PageLayout = z.infer<typeof PageLayoutSchema>;

export function createEmptyLayout(page: string, sourceImage: string, imageWidth: number, imageHeight: number): PageLayout {
  return {
    page,
    sourceImage,
    imageWidth,
    imageHeight,
    bubbles: [],
    images: [],
    curvedTexts: [],
    panels: [],
    useCleanedBackground: false,
    schemaVersion: 2,
  };
}

/** One entry in a page's paint-order stack — see `pageLayerOrder()`. */
export interface LayerItem {
  type: "bubble" | "image" | "curvedText";
  id: string;
}

/** Effective bottom-to-top paint order for a page's bubbles/images/curved texts —
 * shared by the editor canvas (client/src/editor/PageCanvas.tsx), the PNG export
 * (client/src/export/renderPageToPng.ts), and the layered-PSD export
 * (server/src/lib/psdExport.ts) so all three always agree. Without any
 * `layerOrderOverride` set anywhere (the default for every page saved before this
 * feature existed): images, then bubbles, then curved texts, each in their own
 * array order — byte-for-byte the same result rendering already produced before
 * layer ordering was introduced. An element with `layerOrderOverride` set is
 * instead ranked by that value among everything else (`override ?? autoRank`,
 * same resolution pattern as reportUtils.ts's `sortBubblesByPosition`). Panels are
 * intentionally excluded — they're an editor-only reference layer, never exported,
 * always painted below everything else (see PanelShape.tsx). */
export function pageLayerOrder(layout: Pick<PageLayout, "bubbles" | "images" | "curvedTexts">): LayerItem[] {
  const defaultOrder: LayerItem[] = [
    ...layout.images.map((i): LayerItem => ({ type: "image", id: i.id })),
    ...layout.bubbles.map((b): LayerItem => ({ type: "bubble", id: b.id })),
    ...layout.curvedTexts.map((c): LayerItem => ({ type: "curvedText", id: c.id })),
  ];
  const overrideOf = (item: LayerItem): number | undefined => {
    if (item.type === "bubble") return layout.bubbles.find((b) => b.id === item.id)?.layerOrderOverride;
    if (item.type === "image") return layout.images.find((i) => i.id === item.id)?.layerOrderOverride;
    return layout.curvedTexts.find((c) => c.id === item.id)?.layerOrderOverride;
  };
  return defaultOrder
    .map((item, autoRank) => ({ item, key: overrideOf(item) ?? autoRank }))
    .sort((a, b) => a.key - b.key)
    .map((x) => x.item);
}

/** Writes `layerOrderOverride` as dense 0..n-1 ranks matching `order` onto every
 * bubble/image/curved text it contains — same "renumber the whole group" approach
 * as reportUtils.ts's `moveBubbleInReadingOrder`, just page-wide across all three
 * element types instead of per reading-order group. `order` must contain every
 * item `pageLayerOrder(layout)` would return (typically obtained by calling it,
 * then reordering); an item missing from `order` keeps its current override
 * untouched. Client-only need (the server only ever reads via pageLayerOrder) but
 * lives here next to it for symmetry. */
export function withLayerOrder(layout: PageLayout, order: LayerItem[]): PageLayout {
  const rankById = new Map<string, number>();
  order.forEach((item, rank) => rankById.set(`${item.type}:${item.id}`, rank));
  return {
    ...layout,
    bubbles: layout.bubbles.map((b) => {
      const rank = rankById.get(`bubble:${b.id}`);
      return rank === undefined ? b : { ...b, layerOrderOverride: rank };
    }),
    images: layout.images.map((i) => {
      const rank = rankById.get(`image:${i.id}`);
      return rank === undefined ? i : { ...i, layerOrderOverride: rank };
    }),
    curvedTexts: layout.curvedTexts.map((c) => {
      const rank = rankById.get(`curvedText:${c.id}`);
      return rank === undefined ? c : { ...c, layerOrderOverride: rank };
    }),
  };
}

export function createImageElement(partial: {
  id: string;
  corners: Point[];
  opacity?: number;
  files: Record<string, string>;
}): ImageElement {
  return ImageElementSchema.parse(partial);
}

/** Axis-aligned corners (TL, TR, BR, BL) for a box — the default quad shape before dragging. */
export function boxCorners(x: number, y: number, width: number, height: number): Point[] {
  return [
    { x, y },
    { x: x + width, y },
    { x: x + width, y: y + height },
    { x, y: y + height },
  ];
}

export function createBubble(partial: Partial<Bubble> & Pick<Bubble, "id" | "x" | "y" | "width" | "height">): Bubble {
  const shape = partial.shape ?? "rect";
  return BubbleSchema.parse({
    shape,
    rotation: 0,
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
    backgroundScreentone: { enabled: false, pattern: "dots", spacingPx: 8, sizeRatio: 0.5, angleDeg: 45, dotColor: "#000000", backgroundColor: "#ffffff", opacity: 1 },
    tail: null,
    tailWidth: 40,
    svgFileName: null,
    fontFamily: "Anime Ace",
    fontSize: 24,
    lineHeight: 1.2,
    align: "center",
    direction: "ltr",
    color: "#000000",
    textOutline: { enabled: false, color: "#000000", widthPx: 4 },
    textGradient: { enabled: false, colorStart: "#ffffff", colorEnd: "#6c8cff", angleDeg: 0 },
    textGlow: { enabled: false, color: "#66e0ff", blurPx: 16 },
    textDropShadow: { enabled: false, color: "#000000", blurPx: 8, offsetXPx: 4, offsetYPx: 4 },
    textScreentone: { enabled: false, pattern: "dots", spacingPx: 8, sizeRatio: 0.5, angleDeg: 45, dotColor: "#000000", backgroundColor: "#ffffff", opacity: 1 },
    text: {},
    corners: shape === "quad" ? boxCorners(partial.x, partial.y, partial.width, partial.height) : undefined,
    ...partial,
  });
}
