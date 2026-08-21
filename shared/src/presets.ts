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
