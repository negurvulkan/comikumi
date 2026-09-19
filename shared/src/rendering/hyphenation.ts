/// <reference path="./vendor-hyphenation.d.ts" />
import Hypher from "hypher";
import enUs from "hyphenation.en-us";
import de from "hyphenation.de";
import fr from "hyphenation.fr";
import es from "hyphenation.es";
import it from "hyphenation.it";
import type { Hyphenate } from "./textLayout.js";

/**
 * Per-language hyphenation for the horizontal wrapper (see fitHorizontalText / wrapHorizontal
 * in textLayout.ts). Uses `hypher` (Liang's algorithm) with the bundled TeX pattern packages.
 * Only Latin-script languages ship patterns — Japanese/Korean/Chinese don't hyphenate this
 * way and simply get no hyphenator (the wrapper then behaves exactly as before).
 *
 * Runs synchronously (patterns are statically imported) so it can be called straight from
 * the shared layout core the live editor, PNG export, and server raster all share.
 */
const PATTERNS: Record<string, unknown> = {
  en: enUs,
  "en-us": enUs,
  "en-gb": enUs,
  de,
  fr,
  es,
  it,
};

/** Hypher instances are stateless once built; cache one per resolved pattern so repeated
 * layout passes (the editor re-renders constantly) don't rebuild the trie. `null` caches a
 * "no patterns for this language" result so an unsupported code isn't re-resolved. */
const cache = new Map<string, Hyphenate | null>();

/** Resolves a hyphenator for a project language code (e.g. "de", "en", "pt-br"), matching
 * the full code first, then its base subtag. Returns undefined for languages with no
 * bundled patterns — callers then simply don't hyphenate. */
export function hyphenatorFor(languageCode: string): Hyphenate | undefined {
  const key = languageCode.toLowerCase();
  if (!cache.has(key)) {
    const patterns = PATTERNS[key] ?? PATTERNS[key.split(/[-_]/)[0]];
    if (!patterns) {
      cache.set(key, null);
    } else {
      const hypher = new Hypher(patterns);
      cache.set(key, (word: string) => hypher.hyphenate(word));
    }
  }
  return cache.get(key) ?? undefined;
}

/** Whether ComiKumi ships hyphenation patterns for a given language — lets the inspector
 * only offer the hyphenation toggle where it can actually do something. */
export function hyphenationSupported(languageCode: string): boolean {
  return hyphenatorFor(languageCode) !== undefined;
}
