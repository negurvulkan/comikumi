import { z } from "zod";
import type { Bubble } from "../../../../shared/src/layoutSchema";
import { resolveBubbleForm, resolveBubbleStyle } from "../../../../shared/src/layoutSchema";
import type { LanguageDef } from "../../../../shared/src/languages";
import type { LetteringPreset } from "../../../../shared/src/presets";
import { fitHorizontalText, textBoxFor } from "../../../../shared/src/rendering/textLayout";
import { fitVerticalText } from "../../../../shared/src/rendering/verticalTypesetting";
import { extractJsonFence } from "./actionUtils";

export const FIX_OVERFLOW_ACTION = "fix_bubble_overflow" as const;

export const FixOverflowSchema = z.object({
  action: z.literal(FIX_OVERFLOW_ACTION),
  patches: z.array(
    z.object({
      bubbleId: z.string(),
      language: z.string(),
      width: z.number().positive(),
      height: z.number().positive(),
      fontSize: z.number().positive(),
      note: z.string(),
    })
  ),
});
export type FixOverflowAction = z.infer<typeof FixOverflowSchema>;

export interface OverflowTarget {
  bubbleId: string;
  language: string;
  text: string;
  width: number;
  height: number;
  fontSize: number;
  imageWidth: number;
  imageHeight: number;
}

// Reused across scans purely for canvas text-metric measurement (never drawn) — same
// module-level singleton idea as BubbleShape.tsx's own getMeasureCtx(), just a second
// instance since the two files don't share module state.
let measureCtx: CanvasRenderingContext2D | null = null;
function getMeasureCtx(): CanvasRenderingContext2D {
  if (!measureCtx) measureCtx = document.createElement("canvas").getContext("2d")!;
  return measureCtx;
}

/** Bubbles whose CURRENT text still doesn't fit its box even after the normal
 * shrink-to-fit algorithm (see shared/src/rendering/textLayout.ts) has shrunk the font
 * all the way to its minimum — the exact same "overflows" check BubbleShape.tsx makes
 * live for the warning icon, just run here over every bubble/language up front instead
 * of one bubble at render time. Scoped to rect/oval bubbles with no per-language
 * formOverride for that language (a "quad" bubble's warped text-fit is a different
 * computation this doesn't replicate, and a bubble that already has a dedicated
 * per-language form is presumably already deliberately sized for that language) — same
 * "keep the first version narrow" scoping as every other action's target-finder. */
export function findOverflowTargets(bubbles: Bubble[], languages: LanguageDef[], presets: LetteringPreset[], imageWidth: number, imageHeight: number): OverflowTarget[] {
  const ctx = getMeasureCtx();
  const targets: OverflowTarget[] = [];
  for (const bubble of bubbles) {
    if (bubble.shape === "quad" || bubble.isEffect) continue;
    for (const lang of languages) {
      const text = bubble.text[lang.code]?.trim();
      if (!text || bubble.formOverride?.[lang.code]) continue;
      const form = resolveBubbleForm(bubble, lang.code, presets);
      const style = resolveBubbleStyle(bubble, lang.code, presets);
      const box = textBoxFor(form.bubbleStyle, bubble.shape, form, 1);
      const boxWidth = Math.max(1, box.width);
      const boxHeight = Math.max(1, box.height);
      const overflows =
        style.direction === "vertical-rl"
          ? fitVerticalText(text, style.lineHeight, boxWidth, boxHeight, style.fontSize).blockWidth > boxWidth
          : fitHorizontalText(ctx, text, style.fontFamily, style.lineHeight, boxWidth, boxHeight, style.fontSize).blockHeight > boxHeight;
      if (!overflows) continue;
      targets.push({ bubbleId: bubble.id, language: lang.code, text, width: form.width, height: form.height, fontSize: style.fontSize, imageWidth, imageHeight });
    }
  }
  return targets;
}

export function buildFixOverflowPrompt(targets: OverflowTarget[], languages: LanguageDef[]): string {
  if (targets.length === 0) return "";
  const lines: string[] = [
    "Wenn der Nutzer dich bittet, Textüberlauf zu beheben, antworte AUSSCHLIESSLICH mit genau einem ```json-Codeblock in diesem Format (kein Text davor oder danach):",
    "```json",
    '{"action":"fix_bubble_overflow","patches":[{"bubbleId":"<id>","language":"<Sprachcode>","width":<neue Breite in px>,"height":<neue Höhe in px>,"fontSize":<neue Schriftgröße in px>,"note":"<kurze Begründung>"}]}',
    "```",
    "Vergrößere width/height nur so viel wie nötig (Seitenmaße als Obergrenze beachten) und wähle fontSize lesbar, nicht winzig. `note` erklärt kurz, was geändert wurde. Bei jeder anderen Frage antworte ganz normal, ohne JSON.",
    "",
    "Bubbles, deren Text auch bei minimaler Schriftgröße nicht in die Box passt:",
  ];
  for (const target of targets) {
    const label = languages.find((l) => l.code === target.language)?.label ?? target.language;
    lines.push(
      `- bubbleId=${target.bubbleId} | Sprache "${target.language}" (${label}) | aktuell ${Math.round(target.width)}x${Math.round(target.height)}px @ ${Math.round(target.fontSize)}px | Seite ${target.imageWidth}x${target.imageHeight}px | Text: "${target.text}"`
    );
  }
  return lines.join("\n");
}

export function parseFixOverflowAction(rawText: string, validTargets: OverflowTarget[]): FixOverflowAction | null {
  const json = extractJsonFence(rawText);
  if (!json) return null;
  const parsed = FixOverflowSchema.safeParse(json);
  if (!parsed.success) return null;
  const validKeys = new Set(validTargets.map((t) => `${t.bubbleId}:${t.language}`));
  const patches = parsed.data.patches.filter((p) => validKeys.has(`${p.bubbleId}:${p.language}`));
  if (patches.length === 0) return null;
  return { ...parsed.data, patches };
}
