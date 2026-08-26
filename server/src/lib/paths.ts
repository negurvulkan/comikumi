import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** Walks up from this file's own directory until it finds the server package's own
 * package.json — robust against the two different depths this file actually runs
 * from: `server/src/lib` in dev (tsx, running .ts directly, 2 levels up) vs.
 * `server/dist/server/src/lib` when compiled (tsc has no explicit rootDir, so it
 * infers one spanning both server/src and shared/src, nesting the output one level
 * deeper — see server/tsconfig.json), which a fixed "resolve(__dirname, '..', '..')"
 * silently got wrong (resolved into server/dist/server instead of server/), breaking
 * every SERVER_ROOT-relative default (demo-seed/, server/data/) in the compiled/
 * Docker build specifically. */
function findServerRoot(startDir: string): string {
  let dir = startDir;
  while (!fs.existsSync(path.join(dir, "package.json"))) {
    const parent = path.dirname(dir);
    if (parent === dir) throw new Error(`Could not locate server/package.json above ${startDir}`);
    dir = parent;
  }
  return dir;
}

export const SERVER_ROOT = findServerRoot(__dirname);

/**
 * Base directory for the shared/global "data" folder (fonts/images/bubble-svgs/
 * thumbnails caches, app-state.json, legacy migration files) — normally
 * `<SERVER_ROOT>/data`, but overridable via LETTERING_DATA_DIR so integration tests
 * can point it at a throwaway temp directory instead of touching the real repo's
 * server/data. Must be set (via a test's env stub) before this module is first
 * imported in a process, since the constants below are computed once at module load.
 */
export const DATA_DIR = process.env.LETTERING_DATA_DIR ?? path.join(SERVER_ROOT, "data");

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
export const ENTITY_IMAGES_DIR = path.join(DATA_DIR, "entity-images");
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

/** Server-wide account list — see shared/src/users.ts, server/src/lib/authStore.ts.
 * Machine-level, not per-project (an account exists independent of which projects it
 * can see), so it lives here next to app-state.json rather than in any project file. */
export const USERS_FILE = path.join(DATA_DIR, "users.json");

/** HMAC secret for signing/verifying auth JWTs — auto-generated once (crypto.randomBytes)
 * on first use if missing, see authStore.ts's getOrCreateAuthSecret(). Matches this app's
 * "no required configuration" philosophy (e.g. PORT in index.ts is optional too). */
export const AUTH_SECRET_FILE = path.join(DATA_DIR, "auth-secret.txt");

/** e.g. "volume_01" + "_empty" -> "volume_01_empty" */
export function emptyFolderName(bookFolderName: string, emptySuffix: string): string {
  return `${bookFolderName}${emptySuffix}`;
}

export function letteringFolderName(bookFolderName: string, letteringSuffix: string): string {
  return `${bookFolderName}${letteringSuffix}`;
}

/** e.g. "volume_01" + "_script" -> "volume_01_script.json" — a single JSON file
 * (sibling of the <book><letteringSuffix> folder), not a folder, since a volume's
 * whole script is naturally viewed/edited together. */
export function scriptFileName(bookFolderName: string, scriptSuffix: string): string {
  return `${bookFolderName}${scriptSuffix}.json`;
}

/** e.g. "volume_01" + "_comments" -> "volume_01_comments.json" — same single-JSON-per-
 * volume convention as scriptFileName(), see shared/src/comments.ts. */
export function commentsFileName(bookFolderName: string, commentsSuffix: string): string {
  return `${bookFolderName}${commentsSuffix}.json`;
}

/** Rejects any single-segment file name that could escape its storage directory
 * (path separators, "..", or ".") — used by every "/file/:fileName" route before
 * joining it onto a fixed storage dir, so a request can't read arbitrary files
 * elsewhere on disk. */
export function isSafeFileName(name: string): boolean {
  if (!name || name === "." || name === "..") return false;
  return path.basename(name) === name;
}

/** Validates a "/"-joined relative folder path used by asset-router folder browsing
 * (images/bubble-svgs libraries) — "" means root. Rejects ".."/"." segments, empty
 * segments, leading/trailing slashes, and backslashes, so a validated folder can be
 * safely path.join()'d onto a fixed base directory without escaping it. */
export function isSafeFolderPath(folder: string): boolean {
  if (folder === "") return true;
  if (folder.includes("\\") || folder.startsWith("/") || folder.endsWith("/")) return false;
  return folder.split("/").every((seg) => seg.length > 0 && seg !== "." && seg !== "..");
}

/** Interpolates {key} placeholders in `template` from `vars`; unknown keys are left as literal text. */
export function renderTemplate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) => vars[key] ?? match);
}

export function languageFolderName(bookFolderName: string, folderSuffix: string, exportFolderTemplate: string): string {
  return renderTemplate(exportFolderTemplate, { book: bookFolderName, folderSuffix });
}
