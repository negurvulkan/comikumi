import { z } from "zod";

/**
 * A semantic classification label for a bubble / curved text — "what IS this element"
 * (dialogue, narration, thought, whisper, shout, SFX, sign, …), orthogonal to a
 * {@link LetteringPreset} ("how should it LOOK") and to a Character ("who says it").
 * Projectwide (like characters/glossary/presets), referenced by `tagIds` on
 * Bubble/CurvedTextElement — never inlined into layout data, so renaming or recoloring a
 * tag never touches a single page.
 *
 * The first, concrete payoff is tag-based bulk restyling: "assign preset X to every
 * element tagged `sfx` across the whole volume" in one step, without hand-selecting them
 * page by page (see the volume tag-restyle route in server/src/routes/layout.ts). Tags are
 * deliberately a free, project-defined list (no fixed enum) — a studio invents exactly the
 * buckets its workflow uses.
 */
export const TagSchema = z.object({
  id: z.string(),
  name: z.string().trim().min(1).max(60),
  /** Quick-scan color chip in the tag picker / manager, same convention as Character.color. */
  color: z.string().default("#6c8cff"),
  /** Semantic behavior flags (the "tags drive the workspace" integration). Optional/defaulted
   * so older tags and the plain `{name,color}` create payload still validate. */
  /** A bubble carrying this tag is treated as non-dialogue for the QA checks — skipped by
   * the missing-translation and untranslated-glossary-term checks, the same way the
   * per-bubble `isEffect` flag already is (e.g. an "sfx" tag). */
  excludeFromQa: z.boolean().default(false),
  /** A bubble carrying this tag is expected to have a character assigned; the QA check
   * flags it (category "missingCharacter") when it has text but no `characterId` (e.g. a
   * "dialogue" tag). Ignored for bubbles also excluded via `excludeFromQa`. */
  requiresCharacter: z.boolean().default(false),
});
export type Tag = z.infer<typeof TagSchema>;

export const TagListSchema = z.array(TagSchema);

/** True if any of `tagIds` resolves to a tag whose `excludeFromQa` flag is set — the
 * tag-driven counterpart to a bubble's own `isEffect` flag. A stale id (tag deleted) is
 * simply ignored. */
export function tagsExcludeFromQa(tagIds: string[] | undefined, tags: Tag[]): boolean {
  if (!tagIds?.length) return false;
  return tagIds.some((id) => tags.find((t) => t.id === id)?.excludeFromQa);
}

/** True if any of `tagIds` resolves to a tag whose `requiresCharacter` flag is set. */
export function tagsRequireCharacter(tagIds: string[] | undefined, tags: Tag[]): boolean {
  if (!tagIds?.length) return false;
  return tagIds.some((id) => tags.find((t) => t.id === id)?.requiresCharacter);
}

/** Whether a bubble should be treated as non-dialogue — either its own per-bubble
 * `isEffect` flag, or an `excludeFromQa`-flagged tag (see tagsExcludeFromQa). Single
 * source of truth for "not spoken dialogue" across the QA checks, the who-says-what
 * reports, and generated script dialogue lines, so a tag can stand in for `isEffect`
 * everywhere those treat SFX specially. Typed structurally to avoid a tags→layoutSchema
 * import cycle. */
export function isNonDialogueBubble(bubble: { isEffect?: boolean; tagIds?: string[] }, tags: Tag[]): boolean {
  return !!bubble.isEffect || tagsExcludeFromQa(bubble.tagIds, tags);
}
