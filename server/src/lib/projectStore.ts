import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { ProjectFileSchema, type ProjectFile } from "../../../shared/src/project.js";
import { ProjectSettingsSchema, type ProjectSettings } from "../../../shared/src/settings.js";
import { LanguageListSchema, DEFAULT_LANGUAGES, type LanguageDef } from "../../../shared/src/languages.js";
import type { Character } from "../../../shared/src/characters.js";
import type { Entity, EntityRelation } from "../../../shared/src/entities.js";
import type { GlossaryEntry } from "../../../shared/src/glossary.js";
import type { LetteringPreset } from "../../../shared/src/presets.js";
import type { ProjectMember } from "../../../shared/src/users.js";
import { APP_STATE_FILE, LEGACY_SETTINGS_FILE, LEGACY_LANGUAGES_FILE, LEGACY_PROJECT_FILE } from "./paths.js";
import { withFileLock } from "./fileLock.js";

/** Thrown by readSettings/readLanguages/getActiveProject when no project file
 * is open yet — routes turn this into a 409 so the client can redirect to the
 * project switcher instead of crashing. */
export class NoActiveProjectError extends Error {
  constructor() {
    super("No active project is currently open.");
    this.name = "NoActiveProjectError";
  }
}

/** Thrown by getOrLoadProjectById() for a project id that isn't in the index (never
 * registered, or the app-state.json entry was lost) — routes/lib/projectContext.ts
 * turns this into a 404, same "unknown id" shape as every other resource lookup. */
export class ProjectNotFoundError extends Error {
  constructor() {
    super("No project is registered under this id.");
    this.name = "ProjectNotFoundError";
  }
}

export interface ActiveProject {
  id: string;
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
  /** Project id -> file path, so a project-scoped request (`/api/p/:projectId/...`,
   * see projectContext.ts) can find a project's file without scanning every known
   * project file. Populated whenever a project is created/opened/loaded — see
   * registerProjectId(). Additive field, old app-state.json files default to {}. */
  projectIndex: z.record(z.string(), z.string()).default({}),
});
type AppState = z.infer<typeof AppStateSchema>;

/**
 * Multiple projects can be loaded in memory at once (see getOrLoadProjectById(), used
 * by the project-scoped `/api/p/:projectId/...` routes) — this replaced a single
 * `active` singleton. `legacyActiveId`, when set, is exactly what `active` used to mean:
 * "the one implicit project" every un-scoped route (still the majority of routes as of
 * this writing — see docs/FEATURES.md's Mehrbenutzerbetrieb section) reads and writes
 * through getActiveProject(). Capped so a server that gets pointed at many different
 * projects over a long uptime doesn't accumulate them forever; the legacy-active entry
 * is never evicted, since un-scoped routes require it to always be resolvable once
 * initialized, exactly like before.
 */
const projectCache = new Map<string, ActiveProject>();
let legacyActiveId: string | null = null;
const MAX_CACHED_PROJECTS = 8;

// Resolves once the startup migration/auto-open attempt has run, so concurrent
// early requests all await the same attempt instead of racing each other.
let initPromise: Promise<void> | null = null;

/** Test-only escape hatch: clears the in-memory project cache (and the memoized init
 * attempt) so a test file's later cases don't see state left behind by earlier ones.
 * Vitest's default per-file module isolation already gives each test file a fresh copy
 * of this module, but this exists as an explicit safety net for tests that
 * intentionally open/create multiple projects within the same file. */
export function resetActiveProjectForTests(): void {
  projectCache.clear();
  legacyActiveId = null;
  initPromise = null;
}

function legacyActive(): ActiveProject | null {
  return legacyActiveId ? (projectCache.get(legacyActiveId) ?? null) : null;
}

/** Inserts/refreshes a cache entry and bumps it to most-recently-used (Map iteration
 * order = insertion order, so delete+re-set is enough to move an existing key to the
 * end) — then evicts the least-recently-used entry if over the cap, skipping
 * `legacyActiveId` (see the cache's own doc comment for why that one's never evicted). */
function touchCache(entry: ActiveProject): void {
  projectCache.delete(entry.id);
  projectCache.set(entry.id, entry);
  while (projectCache.size > MAX_CACHED_PROJECTS) {
    let victim: string | undefined;
    for (const key of projectCache.keys()) {
      if (key !== legacyActiveId) {
        victim = key;
        break;
      }
    }
    if (!victim) break; // everything left is the legacy-active entry — nothing safe to evict
    projectCache.delete(victim);
  }
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

/** Records where a project id's file lives, so getOrLoadProjectById() can find it later
 * without scanning every known project. Idempotent no-op write avoidance: skips the
 * write entirely when the index already has the correct entry. */
async function registerProjectId(id: string, filePath: string): Promise<void> {
  const state = await readAppState();
  if (state.projectIndex[id] === filePath) return;
  await writeAppState({ ...state, projectIndex: { ...state.projectIndex, [id]: filePath } });
}

async function readProjectFile(filePath: string): Promise<ProjectFile> {
  const raw = await fs.readFile(filePath, "utf-8");
  return ProjectFileSchema.parse(JSON.parse(raw));
}

async function writeProjectFile(filePath: string, data: ProjectFile): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(data, null, 2), "utf-8");
}

/** One-time migration for project files still on the pre-Story-Bible `characters`
 * array: converts every legacy Character into an Entity (type "character", SAME id —
 * so every existing Bubble.characterId reference across every page's layout JSON keeps
 * resolving unchanged, since those only ever store an id, never the character itself),
 * clears `characters` (nothing writes to it anymore afterwards). Returns the same
 * object reference untouched when there's nothing to migrate (already migrated, or a
 * project that never had any characters), so loadProjectWithId() can tell whether a
 * write is needed via a simple reference check. */
function migrateCharactersToEntities(data: ProjectFile): ProjectFile {
  if (data.entities.length > 0 || data.characters.length === 0) return data;
  const entities: Entity[] = data.characters.map((c) => ({
    id: c.id,
    type: "character",
    name: c.name,
    color: c.color,
    summary: "",
    notes: c.voiceNotes,
  }));
  return { ...data, entities, characters: [] };
}

/** Reads a project file, assigning it a fresh id (and writing that back) if it doesn't
 * have one yet — the migrate-on-load path for every project file that existed before
 * the `id` field did, mirroring migrateLegacyProject()'s "upgrade in place" approach for
 * the pre-multi-project settings.json/languages.json layout. Also runs the
 * characters-to-entities migration (see migrateCharactersToEntities()) and registers the
 * (possibly newly assigned) id in the app-state index. Both migrations share a single
 * write when both apply, so a project that predates both `id` and `entities` still only
 * gets written once. */
async function loadProjectWithId(filePath: string): Promise<ActiveProject> {
  const loaded = await readProjectFile(filePath);
  const id = loaded.id ?? randomUUID();
  const withId: ProjectFile = loaded.id ? loaded : { ...loaded, id };
  const data = migrateCharactersToEntities(withId);
  if (!loaded.id || data !== withId) await writeProjectFile(filePath, data);
  await registerProjectId(id, filePath);
  return { id, filePath, data };
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
  const data = ProjectFileSchema.parse({ ...legacySettings, id: randomUUID(), name: "Migriertes Projekt", languages });
  await writeProjectFile(LEGACY_PROJECT_FILE, data);
  await registerProjectId(data.id!, LEGACY_PROJECT_FILE);
  await rememberRecent(LEGACY_PROJECT_FILE);
  return { id: data.id!, filePath: LEGACY_PROJECT_FILE, data };
}

async function ensureInitialized(): Promise<void> {
  if (legacyActive()) return;
  if (!initPromise) {
    initPromise = (async () => {
      const state = await readAppState();
      if (state.lastOpenedProjectFile) {
        try {
          const entry = await loadProjectWithId(state.lastOpenedProjectFile);
          legacyActiveId = entry.id;
          touchCache(entry);
          return;
        } catch {
          // file moved/deleted/corrupted — fall through to migration/empty
        }
      }
      const migrated = await migrateLegacyProject();
      if (migrated) {
        legacyActiveId = migrated.id;
        touchCache(migrated);
      }
    })();
  }
  await initPromise;
}

export async function getActiveProject(): Promise<ActiveProject> {
  await ensureInitialized();
  const project = legacyActive();
  if (!project) throw new NoActiveProjectError();
  return project;
}

/** Resolves (loading from disk and caching if not already cached) the project
 * registered under `id` — the entry point for every project-scoped route
 * (`/api/p/:projectId/...`, see lib/projectContext.ts). Throws ProjectNotFoundError for
 * an id with no index entry. Does NOT change legacyActiveId — scoped access never
 * affects what the un-scoped legacy routes see. */
export async function getOrLoadProjectById(id: string): Promise<ActiveProject> {
  const cached = projectCache.get(id);
  if (cached) {
    touchCache(cached);
    return cached;
  }
  const state = await readAppState();
  const filePath = state.projectIndex[id];
  if (!filePath) throw new ProjectNotFoundError();
  const entry = await loadProjectWithId(filePath);
  touchCache(entry);
  return entry;
}

export async function getCurrentProjectInfo(ctx?: ActiveProject): Promise<{
  filePath: string;
  id: string;
  name: string;
  readingDirection: "ltr" | "rtl";
  coverImagePath: string;
} | null> {
  if (ctx) {
    return { filePath: ctx.filePath, id: ctx.id, name: ctx.data.name, readingDirection: ctx.data.readingDirection, coverImagePath: ctx.data.coverImagePath };
  }
  await ensureInitialized();
  const project = legacyActive();
  return project
    ? { filePath: project.filePath, id: project.id, name: project.data.name, readingDirection: project.data.readingDirection, coverImagePath: project.data.coverImagePath }
    : null;
}

/** Resolved project-specific asset subfolder for the given kind, or null if no project
 * is open or it hasn't configured an assetsDir — callers fall back to the global dir in
 * that case. Reads the legacy-active entry directly (non-throwing) rather than via
 * getActiveProject() so the asset routers keep working with no project open at all,
 * exactly like today. */
export async function getActiveProjectAssetDir(
  kind: "fonts" | "images" | "bubble-svgs" | "entity-images",
  ctx?: ActiveProject
): Promise<string | null> {
  if (!ctx) await ensureInitialized();
  const project = ctx ?? legacyActive();
  if (!project || !project.data.assetsDir) return null;
  return path.join(project.data.assetsDir, kind);
}

/** Non-throwing scanRoot + retention lookup for the background trash-purge sweep in
 * index.ts — that sweep runs on a timer with no request/route context, so it must
 * tolerate "no project open" (returns null) instead of catching NoActiveProjectError
 * at every call site, mirroring getActiveProjectAssetDir()'s direct read. */
export async function getActiveScanRootForTrash(): Promise<{ scanRoot: string; trashRetentionDays: number } | null> {
  await ensureInitialized();
  const project = legacyActive();
  if (!project) return null;
  return { scanRoot: project.data.scanRoot, trashRetentionDays: project.data.trashRetentionDays };
}

/** Resolved thumbnail-cache folder: the explicit `thumbnailsDir` setting if configured,
 * else a "thumbnails" folder next to the project file itself, else (no project open at
 * all) the caller's global fallback dir. Unlike fonts/images/bubble-svgs, this is pure
 * cache rather than a shared/curated library, so it doesn't nest under assetsDir and
 * every project gets its own by default, whether or not assetsDir is set. */
export async function getThumbnailsDir(globalFallback: string): Promise<string> {
  await ensureInitialized();
  const project = legacyActive();
  if (!project) return globalFallback;
  if (project.data.thumbnailsDir) return project.data.thumbnailsDir;
  return path.join(path.dirname(project.filePath), "thumbnails");
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
  const entry = await loadProjectWithId(filePath);
  legacyActiveId = entry.id;
  touchCache(entry);
  await rememberRecent(filePath);
  return entry.data;
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
    id: randomUUID(),
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
  await registerProjectId(data.id!, filePath);
  const entry: ActiveProject = { id: data.id!, filePath, data };
  legacyActiveId = entry.id;
  touchCache(entry);
  await rememberRecent(filePath);
  return data;
}

// --- Signature-compatible drop-in replacements for the old settingsStore/languagesStore,
// so routes/settings.ts and routes/languages.ts don't need to change at all. Every
// function below takes an optional trailing `ctx` — pass a project resolved by
// lib/projectContext.ts's resolveProjectParam (req.activeProject) from an already-
// migrated, project-scoped route; omit it (every not-yet-migrated route, unchanged) to
// keep reading/writing through the legacy singleton, exactly like before. See
// docs/FEATURES.md's Mehrbenutzerbetrieb section and the multi-project rollout plan. ---

export async function readSettings(ctx?: ActiveProject): Promise<ProjectSettings> {
  const { data } = ctx ?? (await getActiveProject());
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

export async function writeSettings(settings: ProjectSettings, ctx?: ActiveProject): Promise<void> {
  const project = ctx ?? (await getActiveProject());
  // Locked per project file, not just the write call — closes the window where two
  // concurrent writers to *any* of this project's fields (settings/languages/
  // characters/glossary/presets/members, all sharing the same underlying file) could
  // interleave their read-merge-write sequences (see fileLock.ts).
  await withFileLock(project.filePath, async () => {
    project.data = { ...project.data, ...settings };
    await writeProjectFile(project.filePath, project.data);
  });
}

export async function readLanguages(ctx?: ActiveProject): Promise<LanguageDef[]> {
  const { data } = ctx ?? (await getActiveProject());
  return data.languages;
}

export async function writeLanguages(languages: LanguageDef[], ctx?: ActiveProject): Promise<void> {
  const project = ctx ?? (await getActiveProject());
  await withFileLock(project.filePath, async () => {
    project.data = { ...project.data, languages };
    await writeProjectFile(project.filePath, project.data);
  });
}

/** Thin compatibility view over `entities` (type === "character") — the legacy
 * Character shape (id/name/color/voiceNotes) is exactly what server/src/routes/
 * characters.ts and every client caller (CharacterManager.tsx, the bubble inspector's
 * character dropdown, reportUtils.ts, VolumeReportModal.tsx, TranslatorContextPanel.tsx)
 * already expect — keeping this signature/shape unchanged means none of that code needs
 * to know entities.ts exists. See migrateCharactersToEntities() for how a pre-Story-Bible
 * project's `characters` array becomes these same entities on first load. */
export async function readCharacters(ctx?: ActiveProject): Promise<Character[]> {
  const entities = await readEntities(ctx);
  return entities
    .filter((e) => e.type === "character")
    .map((e) => ({ id: e.id, name: e.name, color: e.color, voiceNotes: e.notes }));
}

/** Writes the full desired character list back, merging it into `entities`: replaces
 * every character-type entity, leaves every other entity untouched, and preserves each
 * character entity's `summary` (a Story-Bible-only field the legacy Character shape
 * doesn't carry) when its id already existed. Always pins `type: "character"`, so
 * editing via the legacy characters API can't leave an entity in a different type. */
export async function writeCharacters(characters: Character[], ctx?: ActiveProject): Promise<void> {
  const entities = await readEntities(ctx);
  const others = entities.filter((e) => e.type !== "character");
  const next: Entity[] = characters.map((c) => ({
    id: c.id,
    type: "character",
    name: c.name,
    color: c.color,
    summary: entities.find((e) => e.id === c.id)?.summary ?? "",
    notes: c.voiceNotes,
  }));
  await writeEntities([...others, ...next], ctx);
}

export async function readEntities(ctx?: ActiveProject): Promise<Entity[]> {
  const { data } = ctx ?? (await getActiveProject());
  return data.entities;
}

export async function writeEntities(entities: Entity[], ctx?: ActiveProject): Promise<void> {
  const project = ctx ?? (await getActiveProject());
  await withFileLock(project.filePath, async () => {
    project.data = { ...project.data, entities };
    await writeProjectFile(project.filePath, project.data);
  });
}

export async function readEntityRelations(ctx?: ActiveProject): Promise<EntityRelation[]> {
  const { data } = ctx ?? (await getActiveProject());
  return data.entityRelations;
}

export async function writeEntityRelations(entityRelations: EntityRelation[], ctx?: ActiveProject): Promise<void> {
  const project = ctx ?? (await getActiveProject());
  await withFileLock(project.filePath, async () => {
    project.data = { ...project.data, entityRelations };
    await writeProjectFile(project.filePath, project.data);
  });
}

export async function readGlossary(ctx?: ActiveProject): Promise<GlossaryEntry[]> {
  const { data } = ctx ?? (await getActiveProject());
  return data.glossary;
}

export async function writeGlossary(glossary: GlossaryEntry[], ctx?: ActiveProject): Promise<void> {
  const project = ctx ?? (await getActiveProject());
  await withFileLock(project.filePath, async () => {
    project.data = { ...project.data, glossary };
    await writeProjectFile(project.filePath, project.data);
  });
}

export async function readPresets(ctx?: ActiveProject): Promise<LetteringPreset[]> {
  const { data } = ctx ?? (await getActiveProject());
  return data.presets;
}

export async function writePresets(presets: LetteringPreset[], ctx?: ActiveProject): Promise<void> {
  const project = ctx ?? (await getActiveProject());
  await withFileLock(project.filePath, async () => {
    project.data = { ...project.data, presets };
    await writeProjectFile(project.filePath, project.data);
  });
}

export async function readMembers(ctx?: ActiveProject): Promise<ProjectMember[]> {
  const { data } = ctx ?? (await getActiveProject());
  return data.members;
}

export async function writeMembers(members: ProjectMember[], ctx?: ActiveProject): Promise<void> {
  const project = ctx ?? (await getActiveProject());
  await withFileLock(project.filePath, async () => {
    project.data = { ...project.data, members };
    await writeProjectFile(project.filePath, project.data);
  });
}

export async function readMembersByPath(filePath: string): Promise<ProjectMember[]> {
  const data = await readProjectFile(filePath);
  return data.members;
}

export async function writeMembersByPath(filePath: string, members: ProjectMember[]): Promise<void> {
  await withFileLock(filePath, async () => {
    const data = await readProjectFile(filePath);
    data.members = members;
    await writeProjectFile(filePath, data);
    // Keep any cached copy of this exact project (legacy-active or not) consistent —
    // mirrors the old single-singleton "if this is the active one, update it too".
    for (const entry of projectCache.values()) {
      if (entry.filePath === filePath) entry.data.members = members;
    }
  });
}

/** Non-throwing variant of readMembers() for server/src/lib/auth.ts's
 * requireProjectRole() — a missing active project should 404/409 further down the
 * request (e.g. an unknown volume id), not be swallowed here as "no members". */
export async function getActiveProjectMembers(): Promise<ProjectMember[] | null> {
  await ensureInitialized();
  const project = legacyActive();
  return project ? project.data.members : null;
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
