import { z } from "zod";
import { ProjectSettingsSchema } from "./settings.js";
import { LanguageListSchema, DEFAULT_LANGUAGES } from "./languages.js";
import { CharacterListSchema } from "./characters.js";
import { GlossaryListSchema } from "./glossary.js";
import { LetteringPresetListSchema } from "./presets.js";
import { ProjectMemberListSchema } from "./users.js";
import { EntityListSchema, EntityRelationListSchema } from "./entities.js";

/**
 * The full contents of a project file — everything a project needs to work
 * independently of any other project: where to scan, folder-naming
 * conventions, and its own language list. Lives wherever the user saves it
 * (typically alongside the project's own folders), not inside this app's
 * data directory — that's what makes projects portable/switchable.
 */
export const ProjectFileSchema = ProjectSettingsSchema.extend({
  /** Stable identifier used to address this project in project-scoped API routes
   * (`/api/p/:projectId/...`, see server/src/lib/projectContext.ts) — a dedicated ID
   * instead of the file path itself, since a path is neither URL-safe nor something you
   * want to expose/guess. Optional at the schema level so older project files without
   * one still validate; server/src/lib/projectStore.ts assigns one on first load and
   * writes it back (same "migrate on load" pattern as the legacy settings/languages
   * migration). */
  id: z.string().min(1).optional(),
  name: z.string().min(1),
  languages: LanguageListSchema.default(DEFAULT_LANGUAGES),
  /** Legacy recurring-cast list, referenced by Bubble.characterId — see characters.ts.
   * Migrated into `entities` (type "character", same ids) on first load by
   * server/src/lib/projectStore.ts's loadProjectWithId(); stays in the schema only so
   * that migration can still read pre-migration project files. Left empty (not
   * removed from the schema) after migration — nothing writes to it anymore. */
  characters: CharacterListSchema.default([]),
  /** Generic worldbuilding/story-bible records (characters, locations, items, ...) —
   * see entities.ts. Character-type entries here ARE the Bubble.characterId targets,
   * not a separate list (see characters field's doc comment above). */
  entities: EntityListSchema.default([]),
  /** Directed labeled links between entities — see entities.ts. */
  entityRelations: EntityRelationListSchema.default([]),
  /** Projectwide term list for consistent translations — see glossary.ts. */
  glossary: GlossaryListSchema.default([]),
  /** Projectwide live-linked style presets — see presets.ts. */
  presets: LetteringPresetListSchema.default([]),
  /** Who may see/edit this project, and with which role — see shared/src/users.ts.
   * Portable: travels with the project file. A UserAccount with isSystemAdmin needs
   * no entry here (bypass, see server/src/lib/auth.ts's requireProjectRole()). */
  members: ProjectMemberListSchema.default([]),
});
export type ProjectFile = z.infer<typeof ProjectFileSchema>;
