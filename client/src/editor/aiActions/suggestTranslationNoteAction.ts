import { z } from "zod";
import type { Bubble } from "../../../../shared/src/layoutSchema";
import { extractJsonFence } from "./actionUtils";

export const SUGGEST_TRANSLATION_NOTE_ACTION = "suggest_translation_note" as const;

export const SuggestTranslationNoteSchema = z.object({
  action: z.literal(SUGGEST_TRANSLATION_NOTE_ACTION),
  bubbleId: z.string().optional(),
  note: z.string().min(1),
});
export type SuggestTranslationNoteAction = z.infer<typeof SuggestTranslationNoteSchema>;

/** Always offered when the page has any dialogue — like extractGlossaryAction, this
 * deliberately leaves "is there actually something worth flagging" to the model's own
 * judgment rather than pre-filtering client-side (a tricky pun, an ambiguous honorific,
 * a joke that won't survive translation are exactly the kind of thing only the model
 * reading the text can notice). */
export function hasTranslationNoteTargets(bubbles: Bubble[]): boolean {
  return bubbles.some((b) => !b.isEffect && Object.values(b.text).some((t) => t.trim()));
}

export function buildSuggestTranslationNotePrompt(bubbles: Bubble[]): string {
  if (!hasTranslationNoteTargets(bubbles)) return "";
  const lines: string[] = [
    "Wenn der Nutzer dich bittet, eine Übersetzungsnotiz für Kolleg:innen zu formulieren (z.B. ein Wortspiel, eine Zweideutigkeit, ein kultureller Verweis, der schwer zu übertragen ist), antworte AUSSCHLIESSLICH mit genau einem ```json-Codeblock in diesem Format (kein Text davor oder danach):",
    "```json",
    '{"action":"suggest_translation_note","bubbleId":"<id, optional>","note":"<Notiztext>"}',
    "```",
    "`bubbleId` nur setzen, wenn sich die Notiz auf eine konkrete Blase aus der Liste unten bezieht, sonst weglassen (dann gilt die Notiz für die ganze Seite). Bei jeder anderen Frage antworte ganz normal, ohne JSON.",
    "",
    "Dialogtexte dieser Seite:",
  ];
  for (const bubble of bubbles) {
    if (bubble.isEffect) continue;
    const text = Object.values(bubble.text).find((t) => t.trim());
    if (text) lines.push(`- bubbleId=${bubble.id} | Text: "${text}"`);
  }
  return lines.join("\n");
}

export function parseSuggestTranslationNoteAction(rawText: string, validBubbleIds: string[]): SuggestTranslationNoteAction | null {
  const json = extractJsonFence(rawText);
  if (!json) return null;
  const parsed = SuggestTranslationNoteSchema.safeParse(json);
  if (!parsed.success) return null;
  if (parsed.data.bubbleId && !validBubbleIds.includes(parsed.data.bubbleId)) return { ...parsed.data, bubbleId: undefined };
  return parsed.data;
}
