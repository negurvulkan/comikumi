import fs from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { ProjectFileSchema, type ProjectFile } from "../../../shared/src/project.js";
import { ProjectSettingsSchema, type ProjectSettings } from "../../../shared/src/settings.js";
import { LanguageListSchema, DEFAULT_LANGUAGES, type LanguageDef } from "../../../shared/src/languages.js";
import type { Character } from "../../../shared/src/characters.js";
import type { GlossaryEntry } from "../../../shared/src/glossary.js";
import type { LetteringPreset } from "../../../shared/src/presets.js";
import type { ProjectMember } from "../../../shared/src/users.js";
import { APP_STATE_FILE, LEGACY_SETTINGS_FILE, LEGACY_LANGUAGES_FILE, LEGACY_PROJECT_FILE } from "./paths.js";

/** Thrown by readSettings/readLanguages/getActiveProject when no project file
 * is open yet — routes turn this into a 409 so the client can redirect to the
 * project switcher instead of crashing. */
export class NoActiveProjectError extends Error {
  constructor() {
    super("No active project is currently open.");
    this.name = "NoActiveProjectError";
  }
}

interface ActiveProject {
  filePath: string;
  data: ProjectFile;
}

const AppStateSchema = z.object({
  lastOpenedProjectFile: z.string().nullable().default(null),
  recentProjectFiles: z.array(z.string()).default([]),
  /** Projects the user explicitly archived from the switcher — hidden from the main
   * "recent" list but still recoverable (unarchiveProject) rather than forgotten
   * outright, unlike removeRecentProject/deleteProjectFile. Additive field: old
   * app-state.json files without it simply default to an empty archive. */
  archivedProjectFiles: z.array(z.string()).default([]),
});
type AppState = z.infer<typeof AppStateSchema>;

let active: ActiveProject | null = null;
// Resolves once the startup migration/auto-open attempt has run, so concurrent
// early requests all await the same attempt instead of racing each other.
let initPromise: Promise<void> | null = null;

/** Test-only escape hatch: clears the in-memory active-project singleton (and the
 * memoized init attempt) so a test file's later cases don't see state left behind by
 * earlier ones. Vitest's default per-file module isolation already gives each test
 * file a fresh copy of this module, but this exists as an explicit safety net for
 * tests that intentionally open/create multiple projects within the same file. */
export function resetActiveProjectForTests(): void {
  active = null;
  initPromise = null;
}

async function readAppState(): Promise<AppState> {
  try {
    const raw = await fs.readFile(APP_STATE_FILE, "utf-8");
    return AppStateSchema.parse(JSON.parse(raw));
  } catch {
    return AppStateSchema.parse({});
  }
}

async function writeAppState(state: AppState): Promise<void> {
  await fs.mkdir(path.dirname(APP_STATE_FILE), { recursive: true });
  await fs.writeFile(APP_STATE_FILE, JSON.stringify(state, null, 2), "utf-8");
}

async function rememberRecent(filePath: string): Promise<void> {
  const state = await readAppState();
  const recentProjectFiles = [filePath, ...state.recentProjectFiles.filter((p) => p !== filePath)].slice(0, 10);
  await writeAppState({ ...state, lastOpenedProjectFile: filePath, recentProjectFiles });
}

async function readProjectFile(filePath: string): Promise<ProjectFile> {
  const raw = await fs.readFile(filePath, "utf-8");
  return ProjectFileSchema.parse(JSON.parse(raw));
}

async function writeProjectFile(filePath: string, data: ProjectFile): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(data, null, 2), "utf-8");
}

/** One-time migration for checkouts still on the pre-multi-project layout:
 * turns the old global settings.json + languages.json into a real project
 * file, without touching or deleting the originals. Returns null on a fresh
 * install with no legacy data at all. */
async function migrateLegacyProject(): Promise<ActiveProject | null> {
  let legacySettings: ProjectSettings;
  try {
    const raw = await fs.readFile(LEGACY_SETTINGS_FILE, "utf-8");
    legacySettings = ProjectSettingsSchema.parse(JSON.parse(raw));
  } catch {
    return null;
  }
  let languages: LanguageDef[] = DEFAULT_LANGUAGES;
  try {
    const raw = await fs.readFile(LEGACY_LANGUAGES_FILE, "utf-8");
    languages = LanguageListSchema.parse(JSON.parse(raw));
  } catch {
    // no legacy languages.json — keep defaults
  }
  const data = ProjectFileSchema.parse({ ...legacySettings, name: "Migriertes Projekt", languages });
  await writeProjectFile(LEGACY_PROJECT_FILE, data);
  await rememberRecent(LEGACY_PROJECT_FILE);
  return { filePath: LEGACY_PROJECT_FILE, data };
}

async function ensureInitialized(): Promise<void> {
  if (active) return;
  if (!initPromise) {
    initPromise = (async () => {
      const state = await readAppState();
      if (state.lastOpenedProjectFile) {
        try {
          const data = await readProjectFile(state.lastOpenedProjectFile);
          active = { filePath: state.lastOpenedProjectFile, data };
          return;
        } catch {
          // file moved/deleted/corrupted — fall through to migration/empty
        }
      }
      active = await migrateLegacyProject();
    })();
  }
  await initPromise;
}

async function getActiveProject(): Promise<ActiveProject> {
  await ensureInitialized();
  if (!active) throw new NoActiveProjectError();
  return active;
}

export async function getCurrentProjectInfo(): Promise<{
  filePath: string;
  name: string;
  readingDirection: "ltr" | "rtl";
  coverImagePath: string;
} | null> {
  await ensureInitialized();
  return active
    ? { filePath: active.filePath, name: active.data.name, readingDirection: active.data.readingDirection, coverImagePath: active.data.coverImagePath }
    : null;
}

/** Resolved project-specific asset subfolder for the given kind, or null if no project
 * is open or it hasn't configured an assetsDir — callers fall back to the global dir in
 * that case. Reads `active` directly (non-throwing) rather than via getActiveProject()
 * so the asset routers keep working with no project open at all, exactly like today. */
export async function getActiveProjectAssetDir(kind: "fonts" | "images" | "bubble-svgs"): Promise<string | null> {
  await ensureInitialized();
  if (!active || !active.data.assetsDir) return null;
  return path.join(active.data.assetsDir, kind);
}

/** Non-throwing scanRoot + retention lookup for the background trash-purge sweep in
 * index.ts — that sweep runs on a timer with no request/route context, so it must
 * tolerate "no project open" (returns null) instead of catching NoActiveProjectError
 * at every call site, mirroring getActiveProjectAssetDir()'s direct `active` read. */
export async function getActiveScanRootForTrash(): Promise<{ scanRoot: string; trashRetentionDays: number } | null> {
  await ensureInitialized();
  if (!active) return null;
  return { scanRoot: active.data.scanRoot, trashRetentionDays: active.data.trashRetentionDays };
}

/** Resolved thumbnail-cache folder: the explicit `thumbnailsDir` setting if configured,
 * else a "thumbnails" folder next to the project file itself, else (no project open at
 * all) the caller's global fallback dir. Unlike fonts/images/bubble-svgs, this is pure
 * cache rather than a shared/curated library, so it doesn't nest under assetsDir and
 * every project gets its own by default, whether or not assetsDir is set. */
export async function getThumbnailsDir(globalFallback: string): Promise<string> {
  await ensureInitialized();
  if (!active) return globalFallback;
  if (active.data.thumbnailsDir) return active.data.thumbnailsDir;
  return path.join(path.dirname(active.filePath), "thumbnails");
}

export interface ListedProject {
  filePath: string;
  /** Missing when the file itself couldn't be read anymore (moved/deleted). */
  name?: string;
  coverImagePath?: string;
}

export async function listRecentProjects(): Promise<ListedProject[]> {
  const state = await readAppState();
  return resolveProjectNames(state.recentProjectFiles);
}

export async function listArchivedProjects(): Promise<ListedProject[]> {
  const state = await readAppState();
  return resolveProjectNames(state.archivedProjectFiles);
}

async function resolveProjectNames(filePaths: string[]): Promise<ListedProject[]> {
  const results: ListedProject[] = [];
  for (const filePath of filePaths) {
    try {
      const data = await readProjectFile(filePath);
      results.push({ filePath, name: data.name, coverImagePath: data.coverImagePath || undefined });
    } catch {
      results.push({ filePath });
    }
  }
  return results;
}

/** Removes a project from the "recent" overview only — the project file itself is
 * left untouched on disk, and (unlike archiveProject) it isn't moved anywhere
 * recoverable; the only way back is reopening it again by its file path. */
export async function removeRecentProject(filePath: string): Promise<void> {
  const state = await readAppState();
  await writeAppState({ ...state, recentProjectFiles: state.recentProjectFiles.filter((p) => p !== filePath) });
}

/** Moves a project from "recent" into the hidden "archived" list — reversible via
 * unarchiveProject, distinct from removeRecentProject's one-way forgetting. */
export async function archiveProject(filePath: string): Promise<void> {
  const state = await readAppState();
  await writeAppState({
    ...state,
    recentProjectFiles: state.recentProjectFiles.filter((p) => p !== filePath),
    archivedProjectFiles: [filePath, ...state.archivedProjectFiles.filter((p) => p !== filePath)],
  });
}

export async function unarchiveProject(filePath: string): Promise<void> {
  const state = await readAppState();
  await writeAppState({
    ...state,
    archivedProjectFiles: state.archivedProjectFiles.filter((p) => p !== filePath),
    recentProjectFiles: [filePath, ...state.recentProjectFiles.filter((p) => p !== filePath)],
  });
}

/** Deletes only the project's own JSON file from disk — never the scanRoot folder of
 * scanned pages/artwork it points at, which the app treats as the user's original,
 * irreplaceable source material and never removes on its own. Also drops the file
 * from both the recent and archived lists, wherever it happened to be. */
export async function deleteProjectFile(filePath: string): Promise<void> {
  await fs.unlink(filePath);
  const state = await readAppState();
  await writeAppState({
    ...state,
    recentProjectFiles: state.recentProjectFiles.filter((p) => p !== filePath),
    archivedProjectFiles: state.archivedProjectFiles.filter((p) => p !== filePath),
  });
}

export async function openProject(filePath: string): Promise<ProjectFile> {
  const data = await readProjectFile(filePath);
  active = { filePath, data };
  await rememberRecent(filePath);
  return data;
}

export interface CreateProjectInit {
  name: string;
  scanRoot: string;
  /** If true and scanRoot doesn't exist yet, create it (recursive mkdir) before writing
   * the project file — lets the new-project wizard offer "create this folder" instead
   * of requiring it to pre-exist. */
  createScanRootIfMissing?: boolean;
  emptySuffix?: string;
  letteringSuffix?: string;
  scriptSuffix?: string;
  exportFolderTemplate?: string;
  languages?: LanguageDef[];
  readingDirection?: "ltr" | "rtl";
}

export async function createProject(filePath: string, init: CreateProjectInit): Promise<ProjectFile> {
  if (init.createScanRootIfMissing) {
    await fs.mkdir(init.scanRoot, { recursive: true });
  }
  const data = ProjectFileSchema.parse({
    name: init.name,
    scanRoot: init.scanRoot,
    ...(init.emptySuffix !== undefined && { emptySuffix: init.emptySuffix }),
    ...(init.letteringSuffix !== undefined && { letteringSuffix: init.letteringSuffix }),
    ...(init.scriptSuffix !== undefined && { scriptSuffix: init.scriptSuffix }),
    ...(init.exportFolderTemplate !== undefined && { exportFolderTemplate: init.exportFolderTemplate }),
    ...(init.readingDirection !== undefined && { readingDirection: init.readingDirection }),
    languages: init.languages ?? DEFAULT_LANGUAGES,
  });
  await writeProjectFile(filePath, data);
  active = { filePath, data };
  await rememberRecent(filePath);
  return data;
}

// --- Signature-compatible drop-in replacements for the old settingsStore/languagesStore,
// so routes/settings.ts and routes/languages.ts don't need to change at all. ---

export async function readSettings(): Promise<ProjectSettings> {
  const { data } = await getActiveProject();
  const {
    scanRoot,
    assetsDir,
    thumbnailsDir,
    emptySuffix,
    letteringSuffix,
    scriptSuffix,
    commentsSuffix,
    exportFolderTemplate,
    description,
    coverImagePath,
    autosaveEnabled,
    autosaveIntervalSeconds,
    readingDirection,
    trashRetentionDays,
  } = data;
  return {
    scanRoot,
    assetsDir,
    thumbnailsDir,
    emptySuffix,
    letteringSuffix,
    scriptSuffix,
    commentsSuffix,
    exportFolderTemplate,
    description,
    coverImagePath,
    autosaveEnabled,
    autosaveIntervalSeconds,
    readingDirection,
    trashRetentionDays,
  };
}

export async function writeSettings(settings: ProjectSettings): Promise<void> {
  const project = await getActiveProject();
  project.data = { ...project.data, ...settings };
  await writeProjectFile(project.filePath, project.data);
}

export async function readLanguages(): Promise<LanguageDef[]> {
  const { data } = await getActiveProject();
  return data.languages;
}

export async function writeLanguages(languages: LanguageDef[]): Promise<void> {
  const project = await getActiveProject();
  project.data = { ...project.data, languages };
  await writeProjectFile(project.filePath, project.data);
}

export async function readCharacters(): Promise<Character[]> {
  const { data } = await getActiveProject();
  return data.characters;
}

export async function writeCharacters(characters: Character[]): Promise<void> {
  const project = await getActiveProject();
  project.data = { ...project.data, characters };
  await writeProjectFile(project.filePath, project.data);
}

export async function readGlossary(): Promise<GlossaryEntry[]> {
  const { data } = await getActiveProject();
  return data.glossary;
}

export async function writeGlossary(glossary: GlossaryEntry[]): Promise<void> {
  const project = await getActiveProject();
  project.data = { ...project.data, glossary };
  await writeProjectFile(project.filePath, project.data);
}

export async function readPresets(): Promise<LetteringPreset[]> {
  const { data } = await getActiveProject();
  return data.presets;
}

export async function writePresets(presets: LetteringPreset[]): Promise<void> {
  const project = await getActiveProject();
  project.data = { ...project.data, presets };
  await writeProjectFile(project.filePath, project.data);
}

export async function readMembers(): Promise<ProjectMember[]> {
  const { data } = await getActiveProject();
  return data.members;
}

export async function writeMembers(members: ProjectMember[]): Promise<void> {
  const project = await getActiveProject();
  project.data = { ...project.data, members };
  await writeProjectFile(project.filePath, project.data);
}

export async function readMembersByPath(filePath: string): Promise<ProjectMember[]> {
  const data = await readProjectFile(filePath);
  return data.members;
}

export async function writeMembersByPath(filePath: string, members: ProjectMember[]): Promise<void> {
  const data = await readProjectFile(filePath);
  data.members = members;
  await writeProjectFile(filePath, data);
  if (active && active.filePath === filePath) {
    active.data.members = members;
  }
}


/** Non-throwing variant of readMembers() for server/src/lib/auth.ts's
 * requireProjectRole() — a missing active project should 404/409 further down the
 * request (e.g. an unknown volume id), not be swallowed here as "no members". */
export async function getActiveProjectMembers(): Promise<ProjectMember[] | null> {
  await ensureInitialized();
  return active ? active.data.members : null;
}

/** Reads a project file's `members` list WITHOUT making it the active project — used by
 * routes/project.ts's POST /open to check "is this caller allowed to open this
 * specific project file" before actually switching the server's active project (a
 * non-member should never even briefly activate a project they can't access). Returns
 * null if the file can't be read/parsed (caller treats that as "not found", same
 * openProject() would eventually surface anyway). */
export async function peekProjectMembers(filePath: string): Promise<ProjectMember[] | null> {
  try {
    const data = await readProjectFile(filePath);
    return data.members;
  } catch {
    return null;
  }
}
