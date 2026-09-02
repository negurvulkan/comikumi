import { z } from "zod";
import type { Bubble } from "../../../../shared/src/layoutSchema";
import type { Character } from "../../../../shared/src/characters";
import { extractJsonFence } from "./actionUtils";

export const ASSIGN_CHARACTERS_ACTION = "assign_characters" as const;

export const AssignCharactersSchema = z.object({
  action: z.literal(ASSIGN_CHARACTERS_ACTION),
  patches: z.array(z.object({ bubbleId: z.string(), characterId: z.string(), note: z.string() })),
});
export type AssignCharactersAction = z.infer<typeof AssignCharactersSchema>;

export interface AssignCharacterTarget {
  bubbleId: string;
  text: string;
}

/** Bubbles with no character assigned yet, that actually carry dialogue — an effect
 * (SFX) bubble is never "said" by anyone (see Bubble.isEffect), and an empty bubble has
 * nothing to attribute. Only meaningful once the project actually has a cast to choose
 * from. */
export function findAssignCharacterTargets(bubbles: Bubble[], characters: Character[]): AssignCharacterTarget[] {
  if (characters.length === 0) return [];
  return bubbles
    .filter((b) => !b.characterId && !b.isEffect && Object.values(b.text).some((t) => t.trim()))
    .map((b) => ({ bubbleId: b.id, text: Object.values(b.text).find((t) => t.trim()) ?? "" }));
}

export function buildAssignCharactersPrompt(targets: AssignCharacterTarget[], characters: Character[]): string {
  if (targets.length === 0 || characters.length === 0) return "";
  const lines: string[] = [
    "Wenn der Nutzer dich bittet, Charaktere zu Sprechblasen zuzuweisen, antworte AUSSCHLIESSLICH mit genau einem ```json-Codeblock in diesem Format (kein Text davor oder danach):",
    "```json",
    '{"action":"assign_characters","patches":[{"bubbleId":"<id>","characterId":"<id>","note":"<kurze Begründung>"}]}',
    "```",
    "Verwende ausschließlich characterId-Werte aus der Liste unten. Schlage nur Blasen vor, bei denen du dir aufgrund von Text/Kontext einigermaßen sicher bist — bei Unsicherheit lass die Blase weg. Bei jeder anderen Frage antworte ganz normal, ohne JSON.",
    "",
    "Verfügbare Charaktere:",
  ];
  for (const c of characters) {
    lines.push(`- id=${c.id} | ${c.name}${c.voiceNotes.trim() ? ` (${c.voiceNotes.trim()})` : ""}`);
  }
  lines.push("", "Sprechblasen ohne Charakter-Zuweisung auf dieser Seite:");
  for (const target of targets) {
    lines.push(`- bubbleId=${target.bubbleId} | Text: "${target.text}"`);
  }
  return lines.join("\n");
}

export function parseAssignCharactersAction(rawText: string, validTargets: AssignCharacterTarget[], characters: Character[]): AssignCharactersAction | null {
  const json = extractJsonFence(rawText);
  if (!json) return null;
  const parsed = AssignCharactersSchema.safeParse(json);
  if (!parsed.success) return null;
  const validBubbleIds = new Set(validTargets.map((t) => t.bubbleId));
  const validCharacterIds = new Set(characters.map((c) => c.id));
  const patches = parsed.data.patches.filter((p) => validBubbleIds.has(p.bubbleId) && validCharacterIds.has(p.characterId));
  if (patches.length === 0) return null;
  return { ...parsed.data, patches };
}
