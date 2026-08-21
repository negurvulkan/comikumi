import { z } from "zod";

/**
 * A recurring character a bubble's dialogue can be attributed to — projectwide
 * (like languages), since the same cast usually spans every volume of a series.
 * Referenced by Bubble.characterId, never inlined into layout data, so renaming
 * a character or changing their color doesn't require touching every page.
 */
export const CharacterSchema = z.object({
  id: z.string(),
  name: z.string().trim().min(1).max(60),
  /** Used as a quick-scan color chip in dropdowns/reports. */
  color: z.string().default("#6c8cff"),
  /** Free-text notes on how this character speaks — personality, formality level,
   * catchphrases, honorifics — so translators keep their voice consistent across
   * volumes. Unconstrained free text, same convention as ProjectSettingsSchema's
   * `description` field (shared/src/settings.ts). */
  voiceNotes: z.string().default(""),
});
export type Character = z.infer<typeof CharacterSchema>;

export const CharacterListSchema = z.array(CharacterSchema);
