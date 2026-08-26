import { z } from "zod";

/**
 * A generic worldbuilding/story-bible record — a character, location, item, faction,
 * or any other kind of narrative entity a project wants to keep reference material
 * and notes on. `type` is free text (not a fixed enum) so the system stays generic;
 * the client offers a datalist of suggestions (character/location/item/faction plus
 * whatever types already exist in the project) instead of a closed set.
 *
 * `type === "character"` entities are the SAME records used for Bubble.characterId
 * tagging (see server/src/lib/projectStore.ts's readCharacters/writeCharacters, which
 * present a thin Character-shaped compatibility view over the character-type subset of
 * this list) — not a separate, loosely-linked list. Ids are shared 1:1 with the legacy
 * `Character.id`, so a project migrated from the old `characters` array keeps every
 * existing Bubble.characterId reference working unchanged.
 */
export const EntitySchema = z.object({
  id: z.string(),
  /** Free text, e.g. "character", "location", "item", "faction". Defaults to
   * "character" since that's both the most common case and what a migrated legacy
   * Character record always gets. */
  type: z.string().trim().min(1).max(40).default("character"),
  name: z.string().trim().min(1).max(80),
  /** Quick-scan color chip, same convention as the legacy Character.color. */
  color: z.string().default("#6c8cff"),
  /** Short one-liner shown in the entity list. */
  summary: z.string().max(200).default(""),
  /** Free-text profile — personality/voice notes for a character, description for a
   * location/item/etc. Replaces the legacy Character.voiceNotes field name (same
   * free-text convention, just generalized beyond "voice"). */
  notes: z.string().default(""),
});
export type Entity = z.infer<typeof EntitySchema>;
export const EntityListSchema = z.array(EntitySchema);

/**
 * A directed, labeled link between two entities (e.g. "ist Schwester von"). Tolerates
 * dangling `fromId`/`toId` the same way Bubble.characterId/panelId/presetId do — no
 * referential-integrity enforcement beyond the cascade-delete in
 * server/src/routes/entities.ts's DELETE /:id (which proactively removes relations
 * referencing the deleted entity, since this list is small and cheap to keep clean,
 * unlike Bubble.characterId which lives scattered across many page layout files).
 */
export const EntityRelationSchema = z.object({
  id: z.string(),
  fromId: z.string(),
  toId: z.string(),
  label: z.string().trim().min(1).max(60),
});
export type EntityRelation = z.infer<typeof EntityRelationSchema>;
export const EntityRelationListSchema = z.array(EntityRelationSchema);
