import type { IndexedBubble } from "./projectSearchIndex";

export interface FindReplaceMatch {
  id: string;
  volumeId: string;
  volumeLabel: string;
  page: string;
  bubbleId: string;
  language: string;
  before: string;
  after: string;
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Null for an empty search term (nothing to search for) rather than a regex that
 * matches everything — callers treat null as "no search active". */
export function buildSearchRegex(term: string, caseSensitive: boolean): RegExp | null {
  if (!term) return null;
  return new RegExp(escapeRegExp(term), caseSensitive ? "g" : "gi");
}

/** Every bubble-language pair across the whole project (see projectSearchIndex.ts)
 * whose text contains `searchTerm`, with a preview of what it would become after the
 * replacement — plain substring match (no regex/whole-word options), matching the
 * TODO's "Suche/Ersetzen" scope rather than a full-blown search-syntax feature. */
export function findMatches(index: IndexedBubble[], searchTerm: string, replaceTerm: string, caseSensitive: boolean): FindReplaceMatch[] {
  const re = buildSearchRegex(searchTerm, caseSensitive);
  if (!re) return [];
  const matches: FindReplaceMatch[] = [];
  for (const bubble of index) {
    for (const [language, text] of Object.entries(bubble.text)) {
      re.lastIndex = 0;
      if (!text || !re.test(text)) continue;
      matches.push({
        id: `${bubble.volumeId}::${bubble.page}::${bubble.bubbleId}::${language}`,
        volumeId: bubble.volumeId,
        volumeLabel: bubble.volumeLabel,
        page: bubble.page,
        bubbleId: bubble.bubbleId,
        language,
        before: text,
        after: text.replace(buildSearchRegex(searchTerm, caseSensitive)!, replaceTerm),
      });
    }
  }
  return matches;
}

/** Re-applies the same search/replace to a freshly-fetched bubble text at apply time —
 * deliberately NOT just writing back the previewed `after` string, so a page that
 * changed elsewhere between preview and apply (a concurrent edit to the SAME text,
 * outside the matched substring) doesn't get silently clobbered. */
export function applyReplacementToText(currentText: string, searchTerm: string, replaceTerm: string, caseSensitive: boolean): string {
  const re = buildSearchRegex(searchTerm, caseSensitive);
  if (!re) return currentText;
  return currentText.replace(re, replaceTerm);
}
