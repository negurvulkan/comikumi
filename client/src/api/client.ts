import type { PageLayout } from "../../../shared/src/layoutSchema";
import type { LanguageDef } from "../../../shared/src/languages";
import type { Character } from "../../../shared/src/characters";
import type { GlossaryEntry } from "../../../shared/src/glossary";
import type { LetteringPreset, PresetTextFields, PresetBackgroundFields } from "../../../shared/src/presets";
import type { ProjectSettings } from "../../../shared/src/settings";
import type { ProjectFile } from "../../../shared/src/project";
import type { ScriptDocument } from "../../../shared/src/script";
import type { ProjectRole, PublicUser } from "../../../shared/src/users";
import { apiUrl } from "./apiBase";
import { authFetch, authUrl } from "./authFetch";

/** Thrown for any non-ok API response whose body is the `{ error, params? }` shape
 * every server route now returns (see server/src/routes/*.ts) — `code` is a stable
 * snake_case key translatable via the client's `errors.*` i18n namespace
 * (see i18n/translateApiError.ts), `params` carries any interpolation values. */
export class ApiError extends Error {
  code: string;
  params?: Record<string, string>;

  constructor(code: string, params?: Record<string, string>) {
    super(code);
    this.code = code;
    this.params = params;
  }
}

async function throwApiError(res: Response): Promise<never> {
  const text = await res.text().catch(() => res.statusText);
  let body: { error?: string; params?: Record<string, string> } | undefined;
  try {
    body = JSON.parse(text) as { error?: string; params?: Record<string, string> };
  } catch {
    // Not JSON (network error page, etc.) — fall through to the generic Error below.
  }
  if (body?.error) throw new ApiError(body.error, body.params);
  throw new Error(`API-Fehler ${res.status}: ${text}`);
}

export interface CurrentProject {
  filePath: string;
  name: string;
  readingDirection: "ltr" | "rtl";
  coverImagePath: string;
  /** The caller's own resolved role in this project — "system-admin" for the bypass
   * case, "none" if authenticated but not a member, otherwise their ProjectRole. */
  myRole: ProjectRole | "system-admin" | "none";
}

export interface RecentProject {
  filePath: string;
  /** Missing when the file itself couldn't be read anymore (moved/deleted). */
  name?: string;
  /** Absolute path to an optional cover image/logo — pass to api.projectCoverUrl() to
   * render it. Missing/empty when the project has none configured. */
  coverImagePath?: string;
}

export interface BrowseEntry {
  name: string;
  path: string;
  isDirectory: boolean;
}

export interface BrowseResult {
  /** null only for the root drive listing (no `path` was passed). */
  path: string | null;
  parent: string | null;
  entries: BrowseEntry[];
}

export interface VolumeSummary {
  id: string;
  bookFolderName: string;
  existingLanguageFolders: string[];
  languages: LanguageDef[];
  /** Total scanned source pages (the "<book>_empty" folder). */
  pageCount: number;
  /** Sum of panel annotations across every saved lettering JSON in this volume. */
  panelCount: number;
  /** Sum of speech-bubble annotations across every saved lettering JSON, regardless of
   * language/translation state. */
  bubbleCount: number;
  /** Per project-language code: how many bubbles have non-empty text in that language,
   * across every saved lettering JSON — a rough translation-progress count. */
  bubbleCountByLanguage: Record<string, number>;
  /** First scanned page's name (for a card preview thumbnail), or null if the volume
   * has no scanned pages yet. */
  firstPage: string | null;
}

export interface ProjectMemberView {
  userId: string;
  role: ProjectRole;
  /** null if the account was deleted after being added as a member. */
  username: string | null;
}

export interface PageSummary {
  page: string;
  fileName: string;
  width: number;
  height: number;
}

export type AssetScope = "global" | "project";

export interface FontEntry {
  fileName: string;
  family: string;
  url: string;
  scope: AssetScope;
}

export interface ImageEntry {
  fileName: string;
  url: string;
  width: number;
  height: number;
  scope: AssetScope;
}

export interface BubbleSvgEntry {
  fileName: string;
  url: string;
  scope: AssetScope;
}

/** Folder-browsing response shape for images/bubble-svgs (fonts stay a flat array —
 * see server/src/lib/assetRouter.ts's `foldersEnabled` option). `folder` is the "/"-
 * joined path that was listed ("" = root); `subfolders` are the direct child folder
 * names at that level (merged across global + project, scope-agnostic); `files` are
 * the entries directly inside it. */
export interface AssetListing<T> {
  folder: string;
  subfolders: string[];
  files: T[];
}

async function json<T>(res: Response): Promise<T> {
  if (!res.ok) await throwApiError(res);
  return res.json() as Promise<T>;
}

/** Wraps every entry's server-emitted `url` field (already a root-relative "/api/..."
 * path, see server/src/lib/assetRouter.ts) through apiUrl() — these come back inside
 * JSON bodies, not built from a string literal here, so the api.* methods that fetch
 * them must rewrite them before handing them to a consumer, same as every other
 * "/api/..." path in this file. */
function withApiUrls<T extends { url: string }>(entries: T[]): T[] {
  return entries.map((e) => ({ ...e, url: authUrl(apiUrl(e.url)) }));
}

function withListingApiUrls<T extends { url: string }>(listing: AssetListing<T>): AssetListing<T> {
  return { ...listing, files: withApiUrls(listing.files) };
}

function folderQuery(folder: string): string {
  return folder ? `?folder=${encodeURIComponent(folder)}` : "";
}

/** Combines a folder and leaf name into the single "/"-joined relative-path string
 * that ImageElement.files/PanelCut replacement files store as their `fileName` value
 * (see imagesFileUrl()/bubbleSvgFileUrl() below, which split it back apart). */
function joinAssetPath(folder: string, fileName: string): string {
  return folder ? `${folder}/${fileName}` : fileName;
}

function splitAssetPath(relativePath: string): { folder: string; fileName: string } {
  const idx = relativePath.lastIndexOf("/");
  return idx === -1 ? { folder: "", fileName: relativePath } : { folder: relativePath.slice(0, idx), fileName: relativePath.slice(idx + 1) };
}

export const api = {
  listVolumes: () => authFetch(apiUrl("/api/volumes")).then((r) => json<VolumeSummary[]>(r)),

  listPages: (volumeId: string) =>
    authFetch(apiUrl(`/api/volumes/${encodeURIComponent(volumeId)}/pages`)).then((r) => json<PageSummary[]>(r)),

  pageImageUrl: (volumeId: string, page: string) =>
    authUrl(apiUrl(`/api/volumes/${encodeURIComponent(volumeId)}/pages/${encodeURIComponent(page)}/image`)),

  pageThumbnailUrl: (volumeId: string, page: string) =>
    authUrl(apiUrl(`/api/volumes/${encodeURIComponent(volumeId)}/pages/${encodeURIComponent(page)}/thumbnail`)),

  /** Uploads one or more page-scan images into the volume's source folder — lets a
   * client on a different machine than the server add pages without filesystem/
   * network-share access to scanRoot. `overwrite` names files the caller has already
   * confirmed replacing (the second call after a user approves a collision modal). */
  uploadPages: (volumeId: string, files: File[], overwrite?: string[]) => {
    const form = new FormData();
    files.forEach((f) => form.append("pages", f));
    if (overwrite && overwrite.length > 0) form.append("overwrite", JSON.stringify(overwrite));
    return authFetch(apiUrl(`/api/volumes/${encodeURIComponent(volumeId)}/pages`), { method: "POST", body: form }).then((r) =>
      json<{ written: string[]; conflicts: string[] }>(r)
    );
  },

  deletePage: (volumeId: string, page: string) =>
    authFetch(apiUrl(`/api/volumes/${encodeURIComponent(volumeId)}/pages/${encodeURIComponent(page)}`), {
      method: "DELETE",
    }).then((r) => json<{ ok: true }>(r)),

  getLayout: (volumeId: string, page: string) =>
    authFetch(apiUrl(`/api/volumes/${encodeURIComponent(volumeId)}/pages/${encodeURIComponent(page)}/layout`)).then((r) =>
      json<PageLayout>(r)
    ),

  saveLayout: (volumeId: string, page: string, layout: PageLayout) =>
    authFetch(apiUrl(`/api/volumes/${encodeURIComponent(volumeId)}/pages/${encodeURIComponent(page)}/layout`), {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(layout),
    }).then((r) => json<{ ok: true }>(r)),

  getScript: (volumeId: string) =>
    authFetch(apiUrl(`/api/volumes/${encodeURIComponent(volumeId)}/script`)).then((r) => json<ScriptDocument>(r)),

  saveScript: (volumeId: string, doc: ScriptDocument) =>
    authFetch(apiUrl(`/api/volumes/${encodeURIComponent(volumeId)}/script`), {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(doc),
    }).then((r) => json<{ ok: true }>(r)),

  listFonts: () => authFetch(apiUrl("/api/fonts")).then((r) => json<FontEntry[]>(r)).then(withApiUrls),

  uploadFont: (file: File) => {
    const form = new FormData();
    form.append("font", file);
    return authFetch(apiUrl("/api/fonts"), { method: "POST", body: form }).then((r) => json<{ ok: true; fileName: string; scope: AssetScope }>(r));
  },

  exportPage: (volumeId: string, page: string, folderSuffix: string, blob: Blob) => {
    const form = new FormData();
    form.append("png", blob, `${page}.png`);
    form.append("folderSuffix", folderSuffix);
    form.append("page", page);
    return authFetch(apiUrl(`/api/volumes/${encodeURIComponent(volumeId)}/export`), { method: "POST", body: form }).then((r) =>
      json<{ ok: true; path: string }>(r)
    );
  },

  exportPrintPage: (volumeId: string, page: string, folderSuffix: string, blob: Blob) => {
    const form = new FormData();
    form.append("png", blob, `${page}.png`);
    form.append("folderSuffix", folderSuffix);
    form.append("page", page);
    return authFetch(apiUrl(`/api/volumes/${encodeURIComponent(volumeId)}/export-print`), { method: "POST", body: form }).then((r) =>
      json<{ ok: true; path: string }>(r)
    );
  },

  exportLayoutsZip: async (volumeId: string) => {
    const res = await authFetch(apiUrl(`/api/volumes/${encodeURIComponent(volumeId)}/layouts/export-zip`));
    if (!res.ok) await throwApiError(res);
    return res.blob();
  },

  importLayoutsZip: (volumeId: string, file: File) => {
    const form = new FormData();
    form.append("zip", file);
    return authFetch(apiUrl(`/api/volumes/${encodeURIComponent(volumeId)}/layouts/import-zip`), { method: "POST", body: form }).then(
      (r) => json<{ ok: true; imported: string[]; skipped: { file: string; reason: string }[] }>(r)
    );
  },

  listImages: (folder = "") =>
    authFetch(apiUrl(`/api/images${folderQuery(folder)}`)).then((r) => json<AssetListing<ImageEntry>>(r)).then(withListingApiUrls),

  /** `relativePath` is a "/"-joined path as stored in ImageElement.files/PanelCut
   * replacement files ("" or no slash = root, "effects/boom.png" = inside a folder) —
   * split internally so every call site can keep passing just one string regardless of
   * which folder the image actually lives in. */
  imagesFileUrl: (relativePath: string) => {
    const { folder, fileName } = splitAssetPath(relativePath);
    return authUrl(apiUrl(`/api/images/file/${encodeURIComponent(fileName)}${folderQuery(folder)}`));
  },

  uploadImage: (file: File, folder = "") => {
    const form = new FormData();
    form.append("image", file);
    if (folder) form.append("folder", folder);
    return authFetch(apiUrl("/api/images"), { method: "POST", body: form }).then((r) =>
      json<{ ok: true; fileName: string; folder: string; width: number; height: number; scope: AssetScope }>(r)
    ).then((result) => ({ ...result, fileName: joinAssetPath(result.folder, result.fileName) }));
  },

  createImageFolder: (folder: string) =>
    authFetch(apiUrl("/api/images/folders"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ folder }),
    }).then((r) => json<{ ok: true; folder: string }>(r)),

  deleteImageFolder: (folder: string) =>
    authFetch(apiUrl(`/api/images/folders${folderQuery(folder)}`), { method: "DELETE" }).then((r) => json<{ ok: true }>(r)),

  moveImage: (fileName: string, fromFolder: string, toFolder: string) =>
    authFetch(apiUrl("/api/images/move"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fileName, fromFolder, toFolder }),
    }).then((r) => json<{ ok: true }>(r)),

  listBubbleSvgs: (folder = "") =>
    authFetch(apiUrl(`/api/bubble-svgs${folderQuery(folder)}`)).then((r) => json<AssetListing<BubbleSvgEntry>>(r)).then(withListingApiUrls),

  /** Same "/"-joined-full-path contract as imagesFileUrl() above. */
  bubbleSvgFileUrl: (relativePath: string) => {
    const { folder, fileName } = splitAssetPath(relativePath);
    return authUrl(apiUrl(`/api/bubble-svgs/file/${encodeURIComponent(fileName)}${folderQuery(folder)}`));
  },

  uploadBubbleSvg: (file: File, folder = "") => {
    const form = new FormData();
    form.append("svg", file);
    if (folder) form.append("folder", folder);
    return authFetch(apiUrl("/api/bubble-svgs"), { method: "POST", body: form }).then((r) =>
      json<{ ok: true; fileName: string; folder: string; scope: AssetScope }>(r)
    ).then((result) => ({ ...result, fileName: joinAssetPath(result.folder, result.fileName) }));
  },

  createBubbleSvgFolder: (folder: string) =>
    authFetch(apiUrl("/api/bubble-svgs/folders"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ folder }),
    }).then((r) => json<{ ok: true; folder: string }>(r)),

  deleteBubbleSvgFolder: (folder: string) =>
    authFetch(apiUrl(`/api/bubble-svgs/folders${folderQuery(folder)}`), { method: "DELETE" }).then((r) => json<{ ok: true }>(r)),

  moveBubbleSvg: (fileName: string, fromFolder: string, toFolder: string) =>
    authFetch(apiUrl("/api/bubble-svgs/move"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fileName, fromFolder, toFolder }),
    }).then((r) => json<{ ok: true }>(r)),

  listLanguages: () => authFetch(apiUrl("/api/languages")).then((r) => json<LanguageDef[]>(r)),

  addLanguage: (language: LanguageDef) =>
    authFetch(apiUrl("/api/languages"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(language),
    }).then((r) => json<LanguageDef[]>(r)),

  updateLanguage: (code: string, language: LanguageDef) =>
    authFetch(apiUrl(`/api/languages/${encodeURIComponent(code)}`), {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(language),
    }).then((r) => json<LanguageDef[]>(r)),

  deleteLanguage: (code: string) =>
    authFetch(apiUrl(`/api/languages/${encodeURIComponent(code)}`), { method: "DELETE" }).then((r) => json<LanguageDef[]>(r)),

  getSettings: () =>
    authFetch(apiUrl("/api/settings")).then((r) => json<ProjectSettings & { scanRootExists: boolean; assetsDirExists: boolean; thumbnailsDirExists: boolean }>(r)),

  updateSettings: (settings: ProjectSettings) =>
    authFetch(apiUrl("/api/settings"), {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(settings),
    }).then((r) => json<ProjectSettings & { scanRootExists: boolean; assetsDirExists: boolean; thumbnailsDirExists: boolean }>(r)),

  getCurrentProject: () => authFetch(apiUrl("/api/project/current")).then((r) => json<CurrentProject | null>(r)),

  listRecentProjects: () => authFetch(apiUrl("/api/project/recent")).then((r) => json<RecentProject[]>(r)),

  listArchivedProjects: () => authFetch(apiUrl("/api/project/archived")).then((r) => json<RecentProject[]>(r)),

  removeRecentProject: (filePath: string) =>
    authFetch(apiUrl("/api/project/recent/remove"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ filePath }),
    }).then((r) => json<{ ok: true }>(r)),

  archiveProject: (filePath: string) =>
    authFetch(apiUrl("/api/project/archive"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ filePath }),
    }).then((r) => json<{ ok: true }>(r)),

  unarchiveProject: (filePath: string) =>
    authFetch(apiUrl("/api/project/unarchive"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ filePath }),
    }).then((r) => json<{ ok: true }>(r)),

  deleteProjectFile: (filePath: string) =>
    authFetch(apiUrl("/api/project/delete-file"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ filePath }),
    }).then((r) => json<{ ok: true }>(r)),

  /** URL for a project's cover image/logo (settings.coverImagePath) — an absolute local
   * path, not a managed asset, so it's served through a dedicated route rather than the
   * fonts/images/bubble-svgs asset routers. */
  projectCoverUrl: (coverImagePath: string) => authUrl(apiUrl(`/api/project/cover?${new URLSearchParams({ path: coverImagePath })}`)),

  openProject: (filePath: string) =>
    authFetch(apiUrl("/api/project/open"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ filePath }),
    }).then((r) => json<{ filePath: string } & ProjectFile>(r)),

  createProject: (data: {
    filePath: string;
    name: string;
    scanRoot: string;
    createScanRootIfMissing?: boolean;
    emptySuffix?: string;
    letteringSuffix?: string;
    scriptSuffix?: string;
    exportFolderTemplate?: string;
    languages?: LanguageDef[];
    readingDirection?: "ltr" | "rtl";
  }) =>
    authFetch(apiUrl("/api/project/new"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    }).then((r) => json<{ filePath: string } & ProjectFile>(r)),

  getScanRootStatus: (scanRoot: string, emptySuffix: string) =>
    authFetch(apiUrl(`/api/project/scan-root-status?${new URLSearchParams({ scanRoot, emptySuffix })}`)).then((r) =>
      json<{ exists: boolean; volumeCount: number }>(r)
    ),

  createScanRootFolder: (scanRoot: string) =>
    authFetch(apiUrl("/api/project/scan-root"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ scanRoot }),
    }).then((r) => json<{ created: true }>(r)),

  createVolumeFolders: (data: { scanRoot: string; emptySuffix: string; bookName: string; languageFolderSuffixes: string[] }) =>
    authFetch(apiUrl("/api/project/volume-folders"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    }).then((r) => json<{ createdPaths: string[] }>(r)),

  browse: (path?: string, filter?: "directories" | "json" | "image") => {
    const params = new URLSearchParams();
    if (path) params.set("path", path);
    if (filter) params.set("filter", filter);
    const query = params.toString();
    return authFetch(apiUrl(`/api/browse${query ? `?${query}` : ""}`)).then((r) => json<BrowseResult>(r));
  },

  listCharacters: () => authFetch(apiUrl("/api/characters")).then((r) => json<Character[]>(r)),

  addCharacter: (character: { name: string; color: string; voiceNotes?: string }) =>
    authFetch(apiUrl("/api/characters"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(character),
    }).then((r) => json<Character[]>(r)),

  updateCharacter: (id: string, character: { name: string; color: string; voiceNotes?: string }) =>
    authFetch(apiUrl(`/api/characters/${encodeURIComponent(id)}`), {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(character),
    }).then((r) => json<Character[]>(r)),

  deleteCharacter: (id: string) =>
    authFetch(apiUrl(`/api/characters/${encodeURIComponent(id)}`), { method: "DELETE" }).then((r) => json<Character[]>(r)),

  listGlossary: () => authFetch(apiUrl("/api/glossary")).then((r) => json<GlossaryEntry[]>(r)),

  addGlossaryEntry: (entry: { term: string; translations: Record<string, string>; note?: string }) =>
    authFetch(apiUrl("/api/glossary"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(entry),
    }).then((r) => json<GlossaryEntry[]>(r)),

  updateGlossaryEntry: (id: string, entry: { term: string; translations: Record<string, string>; note?: string }) =>
    authFetch(apiUrl(`/api/glossary/${encodeURIComponent(id)}`), {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(entry),
    }).then((r) => json<GlossaryEntry[]>(r)),

  deleteGlossaryEntry: (id: string) =>
    authFetch(apiUrl(`/api/glossary/${encodeURIComponent(id)}`), { method: "DELETE" }).then((r) => json<GlossaryEntry[]>(r)),

  listPresets: () => authFetch(apiUrl("/api/presets")).then((r) => json<LetteringPreset[]>(r)),

  addPreset: (preset: { name: string; text: PresetTextFields; background: PresetBackgroundFields }) =>
    authFetch(apiUrl("/api/presets"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(preset),
    }).then((r) => json<LetteringPreset[]>(r)),

  updatePreset: (id: string, preset: { name: string; text: PresetTextFields; background: PresetBackgroundFields }) =>
    authFetch(apiUrl(`/api/presets/${encodeURIComponent(id)}`), {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(preset),
    }).then((r) => json<LetteringPreset[]>(r)),

  deletePreset: (id: string) =>
    authFetch(apiUrl(`/api/presets/${encodeURIComponent(id)}`), { method: "DELETE" }).then((r) => json<LetteringPreset[]>(r)),

  getVolumeReport: (volumeId: string) =>
    authFetch(apiUrl(`/api/volumes/${encodeURIComponent(volumeId)}/reports`)).then((r) => json<{ page: string; layout: PageLayout }[]>(r)),

  // --- Auth / roles ---

  getSetupStatus: () => authFetch(apiUrl("/api/auth/setup-status")).then((r) => json<{ hasAnyUsers: boolean }>(r)),

  setupAccount: (username: string, password: string) =>
    authFetch(apiUrl("/api/auth/setup"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    }).then((r) => json<{ token: string; user: PublicUser }>(r)),

  login: (username: string, password: string) =>
    authFetch(apiUrl("/api/auth/login"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    }).then((r) => json<{ token: string; user: PublicUser }>(r)),

  getMe: () => authFetch(apiUrl("/api/auth/me")).then((r) => json<PublicUser>(r)),

  listUsers: () => authFetch(apiUrl("/api/auth/users")).then((r) => json<PublicUser[]>(r)),

  createUser: (data: { username: string; password: string; isSystemAdmin?: boolean }) =>
    authFetch(apiUrl("/api/auth/users"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    }).then((r) => json<PublicUser>(r)),

  deleteUser: (id: string) => authFetch(apiUrl(`/api/auth/users/${encodeURIComponent(id)}`), { method: "DELETE" }).then((r) => json<PublicUser[]>(r)),

  listMembers: () => authFetch(apiUrl("/api/project/members")).then((r) => json<ProjectMemberView[]>(r)),

  addMember: (username: string, role: ProjectRole) =>
    authFetch(apiUrl("/api/project/members"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, role }),
    }).then((r) => json<{ ok: true }>(r)),

  removeMember: (userId: string) =>
    authFetch(apiUrl(`/api/project/members/${encodeURIComponent(userId)}`), { method: "DELETE" }).then((r) => json<{ ok: true }>(r)),
};

/** Triggers a browser download for arbitrary text/blob content — used for single-page JSON export. */
export function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
