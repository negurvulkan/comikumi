import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** .../comikumi/server/src/lib -> .../comikumi/server */
const SERVER_ROOT = path.resolve(__dirname, "..", "..");

/**
 * Base directory for the shared/global "data" folder (fonts/images/bubble-svgs/
 * thumbnails caches, app-state.json, legacy migration files) — normally
 * `<SERVER_ROOT>/data`, but overridable via LETTERING_DATA_DIR so integration tests
 * can point it at a throwaway temp directory instead of touching the real repo's
 * server/data. Must be set (via a test's env stub) before this module is first
 * imported in a process, since the constants below are computed once at module load.
 */
const DATA_DIR = process.env.LETTERING_DATA_DIR ?? path.join(SERVER_ROOT, "data");

/**
 * First-run fallback for ProjectSettings.scanRoot, derived from the
 * env var this project used before settings became live-editable —
 * kept only so an existing "Keito no Sei" checkout keeps working with zero
 * configuration. Once server/data/settings.json exists, that file is the
 * source of truth (see settingsStore.ts), not this constant.
 */
const DEFAULT_PROJECT_ROOT = process.env.COMIC_PROJECT_ROOT ?? path.resolve(SERVER_ROOT, "..", "..");
export const DEFAULT_SCAN_ROOT = path.join(DEFAULT_PROJECT_ROOT, "04_Comic_Production");

export const FONTS_DIR = path.join(DATA_DIR, "fonts");
export const IMAGES_DIR = path.join(DATA_DIR, "images");
export const BUBBLE_SVGS_DIR = path.join(DATA_DIR, "bubble-svgs");
export const THUMBNAILS_DIR = path.join(DATA_DIR, "thumbnails");

/** Pre-multi-project settings/languages files — read once, at most, during the
 * one-time legacy migration in projectStore.ts. Never written to anymore. */
export const LEGACY_SETTINGS_FILE = path.join(DATA_DIR, "settings.json");
export const LEGACY_LANGUAGES_FILE = path.join(DATA_DIR, "languages.json");

/** Where a migrated legacy project gets written to on first run (see projectStore.ts). */
export const LEGACY_PROJECT_FILE = path.join(DATA_DIR, "legacy-project.json");

/** Tracks which project file is currently open + a short recent-projects history —
 * a pointer, not project data itself (that lives in the project's own file). */
export const APP_STATE_FILE = path.join(DATA_DIR, "app-state.json");

/** e.g. "volume_01" + "_empty" -> "volume_01_empty" */
export function emptyFolderName(bookFolderName: string, emptySuffix: string): string {
  return `${bookFolderName}${emptySuffix}`;
}

export function letteringFolderName(bookFolderName: string, letteringSuffix: string): string {
  return `${bookFolderName}${letteringSuffix}`;
}

/** Rejects any single-segment file name that could escape its storage directory
 * (path separators, "..", or ".") — used by every "/file/:fileName" route before
 * joining it onto a fixed storage dir, so a request can't read arbitrary files
 * elsewhere on disk. */
export function isSafeFileName(name: string): boolean {
  if (!name || name === "." || name === "..") return false;
  return path.basename(name) === name;
}

/** Interpolates {key} placeholders in `template` from `vars`; unknown keys are left as literal text. */
export function renderTemplate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) => vars[key] ?? match);
}

export function languageFolderName(bookFolderName: string, folderSuffix: string, exportFolderTemplate: string): string {
  return renderTemplate(exportFolderTemplate, { book: bookFolderName, folderSuffix });
}
