import { z } from "zod";
import type { Bubble } from "../../../../shared/src/layoutSchema";
import type { LanguageDef } from "../../../../shared/src/languages";
import type { GlossaryEntry } from "../../../../shared/src/glossary";
import { extractJsonFence } from "./actionUtils";

export const EXTRACT_GLOSSARY_ACTION = "extract_glossary_terms" as const;

export const ExtractGlossarySchema = z.object({
  action: z.literal(EXTRACT_GLOSSARY_ACTION),
  terms: z.array(z.object({ term: z.string().trim().min(1).max(60), translations: z.record(z.string(), z.string()) })),
});
export type ExtractGlossaryAction = z.infer<typeof ExtractGlossarySchema>;

/** Only offered once the page has dialogue AT ALL — the eligibility check is
 * deliberately loose (no attempt to pre-detect "candidate terms" client-side, unlike
 * every other action's target-finder) since recognizing a recurring name/invented word
 * worth glossing is exactly the judgment call being delegated to the model; the
 * concrete proposals are what gets reviewed, not the trigger condition. Existing terms
 * are still passed to the prompt so the model doesn't re-propose them. */
export function hasGlossaryExtractionTargets(bubbles: Bubble[]): boolean {
  return bubbles.some((b) => !b.isEffect && Object.values(b.text).some((t) => t.trim()));
}

export function buildExtractGlossaryPrompt(bubbles: Bubble[], languages: LanguageDef[], glossary: GlossaryEntry[]): string {
  if (!hasGlossaryExtractionTargets(bubbles)) return "";
  const lines: string[] = [
    "Wenn der Nutzer dich bittet, neue Glossar-Begriffe aus dieser Seite vorzuschlagen (z.B. wiederkehrende Namen, erfundene Wörter, feste Ausdrücke), antworte AUSSCHLIESSLICH mit genau einem ```json-Codeblock in diesem Format (kein Text davor oder danach):",
    "```json",
    '{"action":"extract_glossary_terms","terms":[{"term":"<Originalbegriff>","translations":{"<Sprachcode>":"<Übersetzung>"}}]}',
    "```",
    `Nutze nur die Sprachcodes ${languages.map((l) => l.code).join(", ")}. Schlage nur Begriffe vor, die noch NICHT im Glossar unten stehen. Bei jeder anderen Frage antworte ganz normal, ohne JSON.`,
    "",
    "Dialogtexte dieser Seite:",
  ];
  for (const bubble of bubbles) {
    if (bubble.isEffect) continue;
    const text = Object.values(bubble.text).find((t) => t.trim());
    if (text) lines.push(`- "${text}"`);
  }
  if (glossary.length > 0) {
    lines.push("", "Bereits im Glossar (nicht erneut vorschlagen):");
    for (const entry of glossary.slice(0, 200)) lines.push(`- ${entry.term}`);
  }
  return lines.join("\n");
}

export function parseExtractGlossaryAction(rawText: string, existingGlossary: GlossaryEntry[]): ExtractGlossaryAction | null {
  const json = extractJsonFence(rawText);
  if (!json) return null;
  const parsed = ExtractGlossarySchema.safeParse(json);
  if (!parsed.success) return null;
  const existingTerms = new Set(existingGlossary.map((e) => e.term.trim().toLowerCase()));
  const terms = parsed.data.terms.filter((t) => !existingTerms.has(t.term.trim().toLowerCase()));
  if (terms.length === 0) return null;
  return { ...parsed.data, terms };
}
