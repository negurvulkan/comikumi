import { z } from "zod";
import { ProjectSettingsSchema } from "./settings.js";
import { LanguageListSchema, DEFAULT_LANGUAGES } from "./languages.js";
import { CharacterListSchema } from "./characters.js";
import { GlossaryListSchema } from "./glossary.js";
import { LetteringPresetListSchema } from "./presets.js";
import { ProjectMemberListSchema } from "./users.js";

/**
 * The full contents of a project file — everything a project needs to work
 * independently of any other project: where to scan, folder-naming
 * conventions, and its own language list. Lives wherever the user saves it
 * (typically alongside the project's own folders), not inside this app's
 * data directory — that's what makes projects portable/switchable.
 */
export const ProjectFileSchema = ProjectSettingsSchema.extend({
  name: z.string().min(1),
  languages: LanguageListSchema.default(DEFAULT_LANGUAGES),
  /** Recurring cast, referenced by Bubble.characterId — see characters.ts. */
  characters: CharacterListSchema.default([]),
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
