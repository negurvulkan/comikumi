import { z } from "zod";
import type { Bubble } from "../../../../shared/src/layoutSchema";
import type { LetteringPreset } from "../../../../shared/src/presets";
import { extractJsonFence } from "./actionUtils";

export const STYLE_SFX_ACTION = "style_sfx_bubbles" as const;

export const StyleSfxSchema = z.object({
  action: z.literal(STYLE_SFX_ACTION),
  patches: z.array(z.object({ bubbleId: z.string(), presetId: z.string(), rotation: z.number(), note: z.string() })),
});
export type StyleSfxAction = z.infer<typeof StyleSfxSchema>;

export interface StyleSfxTarget {
  bubbleId: string;
  text: string;
}

/** SFX bubbles (see Bubble.isEffect) that don't have a style preset linked yet — an
 * already-styled effect was presumably styled on purpose, so this only ever proposes a
 * FIRST style, never overrides an existing deliberate choice. */
export function findStyleSfxTargets(bubbles: Bubble[]): StyleSfxTarget[] {
  return bubbles
    .filter((b) => b.isEffect && !b.presetId && Object.values(b.text).some((t) => t.trim()))
    .map((b) => ({ bubbleId: b.id, text: Object.values(b.text).find((t) => t.trim()) ?? "" }));
}

export function buildStyleSfxPrompt(targets: StyleSfxTarget[], presets: LetteringPreset[]): string {
  if (targets.length === 0 || presets.length === 0) return "";
  const lines: string[] = [
    "Wenn der Nutzer dich bittet, Soundeffekt-Blasen zu stylen, antworte AUSSCHLIESSLICH mit genau einem ```json-Codeblock in diesem Format (kein Text davor oder danach):",
    "```json",
    '{"action":"style_sfx_bubbles","patches":[{"bubbleId":"<id>","presetId":"<id>","rotation":<Grad, z.B. -8>,"note":"<kurze Begründung>"}]}',
    "```",
    "Verwende ausschließlich presetId-Werte aus der Liste unten. `rotation` ist die Drehung in Grad (kleine Werte wie -15 bis 15 für dynamischen Effekt, 0 wenn keine Drehung passt). Bei jeder anderen Frage antworte ganz normal, ohne JSON.",
    "",
    "Verfügbare Presets:",
  ];
  for (const p of presets) lines.push(`- id=${p.id} | ${p.name}`);
  lines.push("", "Soundeffekt-Blasen ohne Preset auf dieser Seite:");
  for (const target of targets) lines.push(`- bubbleId=${target.bubbleId} | Text: "${target.text}"`);
  return lines.join("\n");
}

export function parseStyleSfxAction(rawText: string, validTargets: StyleSfxTarget[], presets: LetteringPreset[]): StyleSfxAction | null {
  const json = extractJsonFence(rawText);
  if (!json) return null;
  const parsed = StyleSfxSchema.safeParse(json);
  if (!parsed.success) return null;
  const validBubbleIds = new Set(validTargets.map((t) => t.bubbleId));
  const validPresetIds = new Set(presets.map((p) => p.id));
  const patches = parsed.data.patches.filter((p) => validBubbleIds.has(p.bubbleId) && validPresetIds.has(p.presetId));
  if (patches.length === 0) return null;
  return { ...parsed.data, patches };
}
