import { z } from "zod";

/**
 * A projectwide term the translator wants to render consistently across volumes —
 * e.g. an invented word, a title, or a recurring phrase. `translations` mirrors
 * Bubble.text's shape (language code -> string); an entry only needs a translation for
 * the languages it's actually been decided for. Referenced only by matching text content
 * (BubbleInspector's glossary highlighting), never by id — there's no `glossaryId` field
 * anywhere in layout data.
 */
export const GlossaryEntrySchema = z.object({
  id: z.string(),
  term: z.string().trim().min(1).max(60),
  translations: z.record(z.string(), z.string()).default({}),
  /** Furigana reading for a translation, keyed the same way as `translations` — only
   *  meaningful for a language actually rendered with vertical Japanese typesetting, but
   *  kept per-language (not a single flat field) for the same reason `translations` is:
   *  a term's Japanese reading is independent of its translation into any other language.
   *  Used by BubbleInspector.tsx's "Furigana" toolbar button to pre-fill `{term|reading}`
   *  instead of leaving the reading for the translator to type by hand. */
  readings: z.record(z.string(), z.string()).default({}),
  /** Free-text usage notes — when to use this translation, alternatives to avoid, etc. */
  note: z.string().default(""),
});
export type GlossaryEntry = z.infer<typeof GlossaryEntrySchema>;

export const GlossaryListSchema = z.array(GlossaryEntrySchema);
