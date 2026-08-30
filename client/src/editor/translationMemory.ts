import type { IndexedBubble } from "./projectSearchIndex";

export interface TranslationMemorySuggestion {
  bubbleId: string;
  page: string;
  volumeId: string;
  volumeLabel: string;
  text: string;
  /** Jaccard similarity (0–1) between the query's and this suggestion's token sets —
   * exposed mainly so tests can assert ordering; the UI just shows the text. */
  score: number;
}

/** Lowercased word/kanji/kana/digit tokens — `\p{L}\p{N}` (Unicode letter/number
 * categories) instead of `\w` so this works for Japanese text too, which `\w` doesn't
 * segment usefully (CJK has no ASCII word boundaries). Not real linguistic tokenization
 * (no proper Japanese word segmentation), just character-run splitting — good enough
 * for a similarity heuristic, not for anything that needs real segmentation. */
function tokenize(text: string): Set<string> {
  const matches = text.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
  return new Set(matches);
}

function jaccardSimilarity(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let intersection = 0;
  for (const token of a) if (b.has(token)) intersection++;
  const union = a.size + b.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

/**
 * Translation-memory search, scoped to ONE language at a time: "have I already
 * translated something like this into {{languageCode}} somewhere else in the project?"
 * — a self-consistency aid for recurring lines/SFX/catchphrases, not a cross-language
 * aligner (the data model has no concept of "source language" per bubble to align
 * against, see the module's own design note in the plan). Deliberately excludes
 * `excludeBubbleId` (the bubble currently being edited) and requires a minimum
 * similarity (`minScore`) so unrelated short lines don't flood the results — two short
 * bubbles sharing one common word would otherwise score deceptively high.
 */
export function findSimilarBubbles(
  index: IndexedBubble[],
  languageCode: string,
  queryText: string,
  excludeBubbleId: string,
  options: { limit?: number; minScore?: number } = {}
): TranslationMemorySuggestion[] {
  const { limit = 5, minScore = 0.2 } = options;
  const queryTokens = tokenize(queryText);
  if (queryTokens.size === 0) return [];

  const scored: TranslationMemorySuggestion[] = [];
  for (const bubble of index) {
    if (bubble.bubbleId === excludeBubbleId) continue;
    const text = bubble.text[languageCode];
    if (!text || !text.trim()) continue;
    const score = jaccardSimilarity(queryTokens, tokenize(text));
    if (score < minScore) continue;
    scored.push({ bubbleId: bubble.bubbleId, page: bubble.page, volumeId: bubble.volumeId, volumeLabel: bubble.volumeLabel, text, score });
  }
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limit);
}
