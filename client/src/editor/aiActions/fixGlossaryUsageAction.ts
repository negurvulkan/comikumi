import { z } from "zod";
import type { Bubble } from "../../../../shared/src/layoutSchema";
import type { LanguageDef } from "../../../../shared/src/languages";
import type { GlossaryEntry } from "../../../../shared/src/glossary";
import { runQaChecks } from "../qaChecks";
import { extractJsonFence } from "./actionUtils";

/** Same `{action, language, translations}` envelope as aiTranslateAction.ts's
 * translate_missing_bubbles — a different eligibility scan (glossary terms left
 * untranslated, see qaChecks.ts's "untranslatedGlossaryTerm" category) and a different
 * `action` discriminator, but the same patch shape and the same
 * applyBubbleTextPatches() apply-side, so it reuses BubbleTextPatchReviewPanel.tsx too. */
export const FIX_GLOSSARY_USAGE_ACTION = "fix_glossary_usage" as const;

export const FixGlossaryUsageSchema = z.object({
  action: z.literal(FIX_GLOSSARY_USAGE_ACTION),
  language: z.string(),
  translations: z.array(z.object({ bubbleId: z.string(), text: z.string() })),
});
export type FixGlossaryUsageAction = z.infer<typeof FixGlossaryUsageSchema>;

export interface GlossaryUsageTarget {
  bubbleId: string;
  language: string;
  currentText: string;
  term: string;
  approvedTranslation: string;
}

/** Reuses qaChecks.ts's own "untranslatedGlossaryTerm" rule rather than re-implementing
 * it — a bubble's text contains a glossary term's own (untranslated) source word in a
 * language where the glossary already has an approved translation for it. Only
 * meaningful for the current page, same single-page-batch convention as
 * findMissingTranslationTargets() in aiTranslateAction.ts. */
export function findGlossaryUsageTargets(bubbles: Bubble[], languages: LanguageDef[], glossary: GlossaryEntry[]): GlossaryUsageTarget[] {
  const issues = runQaChecks([{ page: "current", bubbles }], languages, glossary, []);
  const targets: GlossaryUsageTarget[] = [];
  for (const issue of issues) {
    if (issue.category !== "untranslatedGlossaryTerm" || !issue.bubbleId) continue;
    const bubble = bubbles.find((b) => b.id === issue.bubbleId);
    const lang = languages.find((l) => l.label === issue.params.language);
    if (!bubble || !lang) continue;
    targets.push({
      bubbleId: bubble.id,
      language: lang.code,
      currentText: bubble.text[lang.code] ?? "",
      term: issue.params.term,
      approvedTranslation: issue.params.translation,
    });
  }
  return targets;
}

export function buildFixGlossaryUsagePrompt(targets: GlossaryUsageTarget[], languages: LanguageDef[]): string {
  if (targets.length === 0) return "";
  const byLanguage = new Map<string, GlossaryUsageTarget[]>();
  for (const target of targets) {
    if (!byLanguage.has(target.language)) byLanguage.set(target.language, []);
    byLanguage.get(target.language)!.push(target);
  }
  const lines: string[] = [
    "Wenn der Nutzer dich bittet, Glossar-Begriffe konsistent zu verwenden, antworte AUSSCHLIESSLICH mit genau einem ```json-Codeblock in diesem Format (kein Text davor oder danach):",
    "```json",
    '{"action":"fix_glossary_usage","language":"<Sprachcode>","translations":[{"bubbleId":"<id>","text":"<korrigierter Text>"}]}',
    "```",
    "Ersetze im Text den unübersetzt gebliebenen Begriff durch die vorgegebene Glossar-Übersetzung, ohne sonst am Satz etwas zu ändern. Verwende ausschließlich bubbleId-Werte aus der Liste, für genau eine Sprache pro Antwort. Bei jeder anderen Frage antworte ganz normal, ohne JSON.",
    "",
    "Blasen, die einen Glossar-Begriff unübersetzt lassen:",
  ];
  for (const [langCode, list] of byLanguage) {
    const label = languages.find((l) => l.code === langCode)?.label ?? langCode;
    lines.push(`Sprache "${langCode}" (${label}):`);
    for (const target of list) {
      lines.push(`- bubbleId=${target.bubbleId} | Begriff "${target.term}" → sollte "${target.approvedTranslation}" sein | aktueller Text: "${target.currentText}"`);
    }
  }
  return lines.join("\n");
}

export function parseFixGlossaryUsageAction(rawText: string, validTargets: GlossaryUsageTarget[]): FixGlossaryUsageAction | null {
  const json = extractJsonFence(rawText);
  if (!json) return null;
  const parsed = FixGlossaryUsageSchema.safeParse(json);
  if (!parsed.success) return null;
  const validIds = new Set(validTargets.filter((t) => t.language === parsed.data.language).map((t) => t.bubbleId));
  const translations = parsed.data.translations.filter((t) => validIds.has(t.bubbleId) && t.text.trim());
  if (translations.length === 0) return null;
  return { ...parsed.data, translations };
}
