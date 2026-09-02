import { z } from "zod";
import type { Bubble } from "../../../shared/src/layoutSchema";
import type { LanguageDef } from "../../../shared/src/languages";
import type { GlossaryEntry } from "../../../shared/src/glossary";
import { runQaChecks } from "./qaChecks";
import { ACTION_FENCE_PREFIX, extractJsonFence } from "./aiActions/actionUtils";

export { ACTION_FENCE_PREFIX };

/** The one agentic action ComiKumi's AI assistant supports today — see
 * docs/FEATURES.md's KI-Assistent section. Deliberately prompted (a fenced ```json
 * block the model is instructed to emit) rather than any provider's native tool-
 * calling: OpenAI/Anthropic/Gemini/OpenRouter/Ollama all support tool-calling at the
 * wire level but each needs its own request/response wiring, and Codex (a subprocess
 * with `sandboxPolicy: readOnly, approvalPolicy: "never"`) has none available at all
 * today — plain text streaming works identically across all six. */
export const TRANSLATE_MISSING_ACTION = "translate_missing_bubbles" as const;

export const TranslateMissingBubblesSchema = z.object({
  action: z.literal(TRANSLATE_MISSING_ACTION),
  language: z.string(),
  translations: z.array(z.object({ bubbleId: z.string(), text: z.string() })),
});

export type TranslateMissingBubblesAction = z.infer<typeof TranslateMissingBubblesSchema>;

export interface MissingTranslationTarget {
  bubbleId: string;
  language: string;
  sourceLanguage: string;
  sourceText: string;
}

/** Reuses qaChecks.ts's own "missingTranslation" rule (not-SFX, has text in at least
 * one language, empty in another) rather than re-implementing it — see
 * client/src/editor/qaChecks.ts. Only meaningful for the current page: `runQaChecks`
 * is a per-page-batch function, called here with a single-page batch. Matches issues
 * back to a `LanguageDef` by label (the only language identifier `QaIssue.params`
 * carries) — safe in practice since a project's configured language labels are
 * effectively unique (shown as tabs in the editor), even though the type itself
 * doesn't enforce that. */
export function findMissingTranslationTargets(bubbles: Bubble[], languages: LanguageDef[]): MissingTranslationTarget[] {
  const issues = runQaChecks([{ page: "current", bubbles }], languages, [], []);
  const targets: MissingTranslationTarget[] = [];
  for (const issue of issues) {
    if (issue.category !== "missingTranslation" || !issue.bubbleId) continue;
    const bubble = bubbles.find((b) => b.id === issue.bubbleId);
    const lang = languages.find((l) => l.label === issue.params.language);
    if (!bubble || !lang) continue;
    // Source text: the first OTHER configured language (in project order) that
    // actually has text on this bubble — ambiguous with 3+ languages, but a
    // reasonable default or existing bubbles are almost always 1 source + N targets.
    const source = languages.find((l) => l.code !== lang.code && bubble.text[l.code]?.trim());
    if (!source) continue;
    targets.push({ bubbleId: bubble.id, language: lang.code, sourceLanguage: source.code, sourceText: bubble.text[source.code] });
  }
  return targets;
}

/** System-prompt text instructing the model on the JSON envelope and handing it the
 * exact bubbleIds it's allowed to use — kept out of AIPanel.tsx's own JSX-heavy file.
 * Returns "" (append nothing) when there's nothing missing, so a page with complete
 * translations never pays any extra prompt-context cost. */
export function buildTranslateActionPrompt(targets: MissingTranslationTarget[], languages: LanguageDef[], glossary: GlossaryEntry[]): string {
  if (targets.length === 0) return "";

  const byLanguage = new Map<string, MissingTranslationTarget[]>();
  for (const target of targets) {
    if (!byLanguage.has(target.language)) byLanguage.set(target.language, []);
    byLanguage.get(target.language)!.push(target);
  }

  const lines: string[] = [
    "Wenn der Nutzer dich bittet, fehlende Übersetzungen für eine der unten genannten Sprachen zu ergänzen, antworte AUSSCHLIESSLICH mit genau einem ```json-Codeblock in diesem Format (kein Text davor oder danach):",
    '```json',
    '{"action":"translate_missing_bubbles","language":"<Sprachcode>","translations":[{"bubbleId":"<id>","text":"<Übersetzung>"}]}',
    "```",
    "Verwende ausschließlich bubbleId-Werte aus der folgenden Liste, für genau eine Sprache pro Antwort. Bei jeder anderen Frage antworte ganz normal, ohne JSON.",
    "",
    "Fehlende Übersetzungen auf der aktuell offenen Seite:",
  ];
  for (const [langCode, list] of byLanguage) {
    const label = languages.find((l) => l.code === langCode)?.label ?? langCode;
    lines.push(`Sprache "${langCode}" (${label}):`);
    for (const target of list) {
      lines.push(`- bubbleId=${target.bubbleId} | Quelltext (${target.sourceLanguage}): "${target.sourceText}"`);
    }
  }

  // Full glossary term list capped at a sane count — good enough for v1 (typical
  // project glossaries are well under this), rather than filtering to only terms
  // that actually appear in the source texts above (qaChecks.ts's whole-word match
  // helper isn't exported for reuse here, and re-deriving it isn't worth it yet).
  if (glossary.length > 0) {
    lines.push("", "Glossar (falls zutreffend konsistent verwenden):");
    for (const entry of glossary.slice(0, 100)) {
      const translations = Object.entries(entry.translations)
        .filter(([, text]) => text.trim())
        .map(([code, text]) => `${code}=${text}`)
        .join(", ");
      if (translations) lines.push(`- ${entry.term}: ${translations}`);
    }
  }

  return lines.join("\n");
}

/** Extracts and validates a translate-action envelope from a completed (non-streaming)
 * assistant response — `null` for anything that isn't a well-formed, in-bounds action
 * (plain chat text, malformed JSON, wrong shape, or a hallucinated bubbleId/language),
 * so the caller can fall back to rendering the raw text as a normal chat message.
 * Unknown bubbleIds are silently dropped rather than rejecting the whole response —
 * same "don't let one bad item sink the batch" principle as Auto-Bubbles' regions. */
export function parseTranslateAction(rawText: string, validTargets: MissingTranslationTarget[]): TranslateMissingBubblesAction | null {
  const json = extractJsonFence(rawText);
  if (!json) return null;

  const parsed = TranslateMissingBubblesSchema.safeParse(json);
  if (!parsed.success) return null;

  const validIds = new Set(validTargets.filter((t) => t.language === parsed.data.language).map((t) => t.bubbleId));
  const translations = parsed.data.translations.filter((t) => validIds.has(t.bubbleId) && t.text.trim());
  if (translations.length === 0) return null;

  return { ...parsed.data, translations };
}
