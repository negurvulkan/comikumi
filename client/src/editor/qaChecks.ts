import type { Bubble } from "../../../shared/src/layoutSchema";
import type { LanguageDef } from "../../../shared/src/languages";
import type { GlossaryEntry } from "../../../shared/src/glossary";
import type { LetteringPreset } from "../../../shared/src/presets";

export type QaCategory = "missingTranslation" | "duplicatePreset" | "untranslatedGlossaryTerm";

export interface QaIssue {
  id: string;
  category: QaCategory;
  page?: string;
  bubbleId?: string;
  /** Interpolation data for the i18n message template keyed by `category` (see
   * QaCheckModal.tsx's `qaChecker.issue.<category>` translations) — kept structured
   * instead of a pre-rendered string so the modal can translate/pluralize properly. */
  params: Record<string, string>;
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Whole-word, case-insensitive search for `term` inside `text` — used by the
 * untranslated-glossary-term check below. Plain `includes()` would also match inside
 * a longer unrelated word (e.g. "cat" inside "catalog"), which isn't what "left the
 * source term untranslated" means. */
function containsWholeWord(text: string, term: string): boolean {
  if (!term.trim()) return false;
  return new RegExp(`\\b${escapeRegExp(term.trim())}\\b`, "iu").test(text);
}

/**
 * Runs every QA check over one volume's worth of pages (same `{ page, bubbles }[]`
 * shape VolumeReportModal.tsx already fetches via api.getVolumeReport) plus the
 * project's languages/glossary/presets. Pure function, no i18n inside — QaCheckModal.tsx
 * turns each issue's `category`+`params` into a localized message so this stays testable
 * without a react-i18next context.
 *
 * Deliberately three checks, matching the TODO's original scope:
 * - missingTranslation: a bubble has text in at least one project language but is
 *   empty/missing in another configured language — "started but not finished".
 * - duplicatePreset: two or more presets share the same name (trimmed,
 *   case-insensitive) — usually an accidental duplicate from "add from library"
 *   or copy-pasting a similar style.
 * - untranslatedGlossaryTerm: a glossary entry's own term appears, whole-word, inside
 *   a bubble's text in a language the entry HAS a (different) approved translation
 *   for — the translator likely forgot to use it.
 */
export function runQaChecks(
  pages: { page: string; bubbles: Bubble[] }[],
  languages: LanguageDef[],
  glossary: GlossaryEntry[],
  presets: LetteringPreset[]
): QaIssue[] {
  const issues: QaIssue[] = [];

  for (const { page, bubbles } of pages) {
    for (const bubble of bubbles) {
      // Effect (SFX) bubbles aren't dialogue and aren't meaningfully checked for
      // translation completeness or glossary usage here — see Bubble.isEffect.
      if (bubble.isEffect) continue;
      const hasAnyText = Object.values(bubble.text).some((t) => t.trim());
      if (!hasAnyText) continue; // an entirely empty bubble isn't "missing a translation", it's just unused

      for (const lang of languages) {
        if (!bubble.text[lang.code]?.trim()) {
          issues.push({
            id: `missing-${page}-${bubble.id}-${lang.code}`,
            category: "missingTranslation",
            page,
            bubbleId: bubble.id,
            params: { page, language: lang.label },
          });
        }
      }

      for (const entry of glossary) {
        for (const lang of languages) {
          const translation = entry.translations[lang.code]?.trim();
          const text = bubble.text[lang.code];
          if (!translation || !text || translation.toLowerCase() === entry.term.trim().toLowerCase()) continue;
          if (containsWholeWord(text, entry.term)) {
            issues.push({
              id: `glossary-${page}-${bubble.id}-${lang.code}-${entry.id}`,
              category: "untranslatedGlossaryTerm",
              page,
              bubbleId: bubble.id,
              params: { page, language: lang.label, term: entry.term, translation },
            });
          }
        }
      }
    }
  }

  const byName = new Map<string, LetteringPreset[]>();
  for (const preset of presets) {
    const key = preset.name.trim().toLowerCase();
    if (!byName.has(key)) byName.set(key, []);
    byName.get(key)!.push(preset);
  }
  for (const group of byName.values()) {
    if (group.length < 2) continue;
    issues.push({
      id: `duplicate-preset-${group.map((p) => p.id).join("-")}`,
      category: "duplicatePreset",
      params: { name: group[0].name, count: String(group.length) },
    });
  }

  return issues;
}
