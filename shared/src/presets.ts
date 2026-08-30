import { z } from "zod";
import {
  TextAlignSchema,
  TextDirectionSchema,
  TextOutlineSchema,
  TextGradientSchema,
  BubbleVisualStyleSchema,
  TailStyleSchema,
  TailChainSegmentShapeSchema,
} from "./layoutSchema.js";

/**
 * Sparse text-style fields a preset can define — every field is optional, and only the
 * ones actually set here are live-resolved into a linked Bubble/CurvedTextElement (see
 * resolveBubbleStyle/resolveCurvedTextStyle in layoutSchema.ts). A field left unset here
 * is entirely the linked element's own concern and is never touched by this preset —
 * that's what lets a preset define e.g. only fontFamily while every bubble keeps its own
 * fontSize.
 */
export const PresetTextFieldsSchema = z
  .object({
    fontFamily: z.string().optional(),
    fontSize: z.number().positive().optional(),
    lineHeight: z.number().positive().optional(),
    align: TextAlignSchema.optional(),
    direction: TextDirectionSchema.optional(),
    color: z.string().optional(),
    textOutline: TextOutlineSchema.optional(),
    textGradient: TextGradientSchema.optional(),
  })
  .default({});
export type PresetTextFields = z.infer<typeof PresetTextFieldsSchema>;

/**
 * Sparse bubble-background fields a preset can define — same all-optional/sparse idea as
 * PresetTextFieldsSchema. Deliberately excludes geometry (position/size/rotation) and
 * tail position/width/curve, which are per-instance concerns, not "style". Only relevant
 * to Bubble (CurvedTextElement has no bubble background).
 */
export const PresetBackgroundFieldsSchema = z
  .object({
    bubbleStyle: BubbleVisualStyleSchema.optional(),
    fillColor: z.string().optional(),
    strokeColor: z.string().optional(),
    strokeWidthPx: z.number().positive().optional(),
    svgFileName: z.string().nullable().optional(),
    tailStyle: TailStyleSchema.optional(),
    tailChainSegmentShape: TailChainSegmentShapeSchema.optional(),
    tailChainSegments: z.number().int().min(1).max(8).optional(),
    tailChainSpacing: z.number().positive().optional(),
    /** See BubbleFormSchema's identically-named field in layoutSchema.ts. */
    paddingRatio: z.number().min(0).max(0.9).optional(),
  })
  .default({});
export type PresetBackgroundFields = z.infer<typeof PresetBackgroundFieldsSchema>;

/**
 * A projectwide, live-linked style preset ("Bubble Style", "Character Style", "SFX
 * Style", etc. — `name` is free text, not an enforced category). Referenced by
 * Bubble.presetId / CurvedTextElement.presetId; editing a preset immediately updates
 * every element linked to it, for whichever fields the preset actually defines.
 */
export const LetteringPresetSchema = z.object({
  id: z.string(),
  name: z.string().trim().min(1).max(60),
  text: PresetTextFieldsSchema,
  background: PresetBackgroundFieldsSchema,
});
export type LetteringPreset = z.infer<typeof LetteringPresetSchema>;

export const LetteringPresetListSchema = z.array(LetteringPresetSchema);

/**
 * A small starter library of ready-to-use manga/comic style presets — offered as an
 * explicit "add from library" action in PresetManager.tsx rather than pre-populated at
 * project creation (unlike DEFAULT_LANGUAGES in languages.ts): a preset name is a
 * project-specific style bucket, not something every project equally wants. Each entry
 * omits `id` (assigned by the server, same as any manually created preset) — added via
 * the existing api.addPreset(...) call, no dedicated route needed.
 */
export const BUILTIN_PRESETS: { name: string; text: PresetTextFields; background: PresetBackgroundFields }[] = [
  {
    name: "Manga SFX",
    text: { fontSize: 64, color: "#ffffff", textOutline: { enabled: true, color: "#000000", widthPx: 8 } },
    background: { bubbleStyle: "none" },
  },
  {
    name: "Whisper",
    text: { fontSize: 16, color: "#555555" },
    background: { bubbleStyle: "thought", fillColor: "#fafafa", strokeColor: "#cccccc" },
  },
  {
    name: "Shout",
    text: { fontSize: 32, color: "#ffffff", textOutline: { enabled: true, color: "#000000", widthPx: 4 } },
    background: { bubbleStyle: "shout", fillColor: "#000000", strokeColor: "#000000" },
  },
];
