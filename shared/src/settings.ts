import { z } from "zod";

/**
 * Project-level configuration: where to scan for volumes and which folder-
 * naming convention to use. Lets the tool point at any project's folder
 * layout instead of the "Keito no Sei"-specific convention being hardcoded —
 * live-editable via the Settings UI, no server restart or env var needed.
 */
export const ProjectSettingsSchema = z.object({
  /** Absolute path to the folder to scan for "<book><emptySuffix>" volumes. */
  scanRoot: z.string().min(1),
  /** Optional project-specific folder for fonts/bubble-svgs/images, additive on top of
   * the shared server/data library (project-scoped files win on filename collision).
   * Empty string = not configured, i.e. today's global-only behavior. */
  assetsDir: z.string().default(""),
  /** Optional, separately configurable folder for the page-thumbnail cache. Empty
   * string = not configured — falls back to a "thumbnails" folder next to the project
   * file itself (not nested under assetsDir, since it's pure cache, not a shared/
   * curated asset library, and every project needs one whether or not it also has an
   * assetsDir). */
  thumbnailsDir: z.string().default(""),
  emptySuffix: z.string().min(1).default("_empty"),
  letteringSuffix: z.string().min(1).default("_lettering"),
  /** Suffix for the per-volume script-planning JSON file (see shared/src/script.ts),
   * e.g. "volume_01" + "_script" -> "volume_01_script.json". */
  scriptSuffix: z.string().min(1).default("_script"),
  /** Suffix for the per-volume review-comments JSON file (see shared/src/comments.ts),
   * e.g. "volume_01" + "_comments" -> "volume_01_comments.json". */
  commentsSuffix: z.string().min(1).default("_comments"),
  /** Export folder name template; {book} and {folderSuffix} get interpolated. */
  exportFolderTemplate: z.string().min(1).default("{book}_{folderSuffix}"),
  /** Free-text notes about the project, editable in the Settings dialog. */
  description: z.string().default(""),
  /** Optional absolute path to a cover image/logo shown on this project's card in the
   * project switcher (recent/archived lists). Empty string = no cover configured, i.e.
   * today's plain text-only card. */
  coverImagePath: z.string().default(""),
  /** Whether the editor should automatically call save() on an interval while there
   * are unsaved changes, instead of only on an explicit "Speichern" click. */
  autosaveEnabled: z.boolean().default(false),
  /** How often to autosave, in seconds, while autosaveEnabled is on. */
  autosaveIntervalSeconds: z.number().int().min(5).max(3600).default(30),
  /** Physical panel/bubble reading order on the page — "rtl" (Japanese manga
   * convention, the default/status quo) or "ltr" (Western). Independent of
   * Bubble.direction (per-bubble TEXT layout within a single bubble) — this is about
   * the SEQUENCE of multiple panels/bubbles relative to each other. */
  readingDirection: z.enum(["ltr", "rtl"]).default("rtl"),
  /** Days a deleted page's source image stays recoverable in the "_trash" folder
   * (under scanRoot) before an automatic sweep permanently removes it — see
   * server/src/lib/trash.ts. Deletion is never immediate/destructive; this only
   * controls how long the safety net lasts. */
  trashRetentionDays: z.number().int().positive().default(30),
});
export type ProjectSettings = z.infer<typeof ProjectSettingsSchema>;
