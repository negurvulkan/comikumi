import type { PageLayout } from "../../../shared/src/layoutSchema";
import type { LanguageDef } from "../../../shared/src/languages";
import type { Character } from "../../../shared/src/characters";
import type { GlossaryEntry } from "../../../shared/src/glossary";
import type { LetteringPreset, PresetTextFields, PresetBackgroundFields } from "../../../shared/src/presets";
import type { ProjectSettings } from "../../../shared/src/settings";
import type { ProjectFile } from "../../../shared/src/project";
import type { ScriptDocument } from "../../../shared/src/script";

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
}

export interface RecentProject {
  filePath: string;
  /** Missing when the file itself couldn't be read anymore (moved/deleted). */
  name?: string;
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

async function json<T>(res: Response): Promise<T> {
  if (!res.ok) await throwApiError(res);
  return res.json() as Promise<T>;
}

export const api = {
  listVolumes: () => fetch("/api/volumes").then((r) => json<VolumeSummary[]>(r)),

  listPages: (volumeId: string) =>
    fetch(`/api/volumes/${encodeURIComponent(volumeId)}/pages`).then((r) => json<PageSummary[]>(r)),

  pageImageUrl: (volumeId: string, page: string) =>
    `/api/volumes/${encodeURIComponent(volumeId)}/pages/${encodeURIComponent(page)}/image`,

  pageThumbnailUrl: (volumeId: string, page: string) =>
    `/api/volumes/${encodeURIComponent(volumeId)}/pages/${encodeURIComponent(page)}/thumbnail`,

  getLayout: (volumeId: string, page: string) =>
    fetch(`/api/volumes/${encodeURIComponent(volumeId)}/pages/${encodeURIComponent(page)}/layout`).then((r) =>
      json<PageLayout>(r)
    ),

  saveLayout: (volumeId: string, page: string, layout: PageLayout) =>
    fetch(`/api/volumes/${encodeURIComponent(volumeId)}/pages/${encodeURIComponent(page)}/layout`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(layout),
    }).then((r) => json<{ ok: true }>(r)),

  getScript: (volumeId: string) =>
    fetch(`/api/volumes/${encodeURIComponent(volumeId)}/script`).then((r) => json<ScriptDocument>(r)),

  saveScript: (volumeId: string, doc: ScriptDocument) =>
    fetch(`/api/volumes/${encodeURIComponent(volumeId)}/script`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(doc),
    }).then((r) => json<{ ok: true }>(r)),

  listFonts: () => fetch("/api/fonts").then((r) => json<FontEntry[]>(r)),

  uploadFont: (file: File) => {
    const form = new FormData();
    form.append("font", file);
    return fetch("/api/fonts", { method: "POST", body: form }).then((r) => json<{ ok: true; fileName: string; scope: AssetScope }>(r));
  },

  exportPage: (volumeId: string, page: string, folderSuffix: string, blob: Blob) => {
    const form = new FormData();
    form.append("png", blob, `${page}.png`);
    form.append("folderSuffix", folderSuffix);
    form.append("page", page);
    return fetch(`/api/volumes/${encodeURIComponent(volumeId)}/export`, { method: "POST", body: form }).then((r) =>
      json<{ ok: true; path: string }>(r)
    );
  },

  exportLayoutsZip: async (volumeId: string) => {
    const res = await fetch(`/api/volumes/${encodeURIComponent(volumeId)}/layouts/export-zip`);
    if (!res.ok) await throwApiError(res);
    return res.blob();
  },

  importLayoutsZip: (volumeId: string, file: File) => {
    const form = new FormData();
    form.append("zip", file);
    return fetch(`/api/volumes/${encodeURIComponent(volumeId)}/layouts/import-zip`, { method: "POST", body: form }).then(
      (r) => json<{ ok: true; imported: string[]; skipped: { file: string; reason: string }[] }>(r)
    );
  },

  listImages: () => fetch("/api/images").then((r) => json<ImageEntry[]>(r)),

  imagesFileUrl: (fileName: string) => `/api/images/file/${encodeURIComponent(fileName)}`,

  uploadImage: (file: File) => {
    const form = new FormData();
    form.append("image", file);
    return fetch("/api/images", { method: "POST", body: form }).then((r) =>
      json<{ ok: true; fileName: string; width: number; height: number; scope: AssetScope }>(r)
    );
  },

  listBubbleSvgs: () => fetch("/api/bubble-svgs").then((r) => json<BubbleSvgEntry[]>(r)),

  bubbleSvgFileUrl: (fileName: string) => `/api/bubble-svgs/file/${encodeURIComponent(fileName)}`,

  uploadBubbleSvg: (file: File) => {
    const form = new FormData();
    form.append("svg", file);
    return fetch("/api/bubble-svgs", { method: "POST", body: form }).then((r) =>
      json<{ ok: true; fileName: string; scope: AssetScope }>(r)
    );
  },

  listLanguages: () => fetch("/api/languages").then((r) => json<LanguageDef[]>(r)),

  addLanguage: (language: LanguageDef) =>
    fetch("/api/languages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(language),
    }).then((r) => json<LanguageDef[]>(r)),

  updateLanguage: (code: string, language: LanguageDef) =>
    fetch(`/api/languages/${encodeURIComponent(code)}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(language),
    }).then((r) => json<LanguageDef[]>(r)),

  deleteLanguage: (code: string) =>
    fetch(`/api/languages/${encodeURIComponent(code)}`, { method: "DELETE" }).then((r) => json<LanguageDef[]>(r)),

  getSettings: () => fetch("/api/settings").then((r) => json<ProjectSettings & { scanRootExists: boolean; assetsDirExists: boolean; thumbnailsDirExists: boolean }>(r)),

  updateSettings: (settings: ProjectSettings) =>
    fetch("/api/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(settings),
    }).then((r) => json<ProjectSettings & { scanRootExists: boolean; assetsDirExists: boolean; thumbnailsDirExists: boolean }>(r)),

  getCurrentProject: () => fetch("/api/project/current").then((r) => json<CurrentProject | null>(r)),

  listRecentProjects: () => fetch("/api/project/recent").then((r) => json<RecentProject[]>(r)),

  openProject: (filePath: string) =>
    fetch("/api/project/open", {
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
    fetch("/api/project/new", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    }).then((r) => json<{ filePath: string } & ProjectFile>(r)),

  getScanRootStatus: (scanRoot: string, emptySuffix: string) =>
    fetch(`/api/project/scan-root-status?${new URLSearchParams({ scanRoot, emptySuffix })}`).then((r) =>
      json<{ exists: boolean; volumeCount: number }>(r)
    ),

  createScanRootFolder: (scanRoot: string) =>
    fetch("/api/project/scan-root", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ scanRoot }),
    }).then((r) => json<{ created: true }>(r)),

  createVolumeFolders: (data: { scanRoot: string; emptySuffix: string; bookName: string; languageFolderSuffixes: string[] }) =>
    fetch("/api/project/volume-folders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    }).then((r) => json<{ createdPaths: string[] }>(r)),

  browse: (path?: string, filter?: "directories" | "json") => {
    const params = new URLSearchParams();
    if (path) params.set("path", path);
    if (filter) params.set("filter", filter);
    const query = params.toString();
    return fetch(`/api/browse${query ? `?${query}` : ""}`).then((r) => json<BrowseResult>(r));
  },

  listCharacters: () => fetch("/api/characters").then((r) => json<Character[]>(r)),

  addCharacter: (character: { name: string; color: string; voiceNotes?: string }) =>
    fetch("/api/characters", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(character),
    }).then((r) => json<Character[]>(r)),

  updateCharacter: (id: string, character: { name: string; color: string; voiceNotes?: string }) =>
    fetch(`/api/characters/${encodeURIComponent(id)}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(character),
    }).then((r) => json<Character[]>(r)),

  deleteCharacter: (id: string) =>
    fetch(`/api/characters/${encodeURIComponent(id)}`, { method: "DELETE" }).then((r) => json<Character[]>(r)),

  listGlossary: () => fetch("/api/glossary").then((r) => json<GlossaryEntry[]>(r)),

  addGlossaryEntry: (entry: { term: string; translations: Record<string, string>; note?: string }) =>
    fetch("/api/glossary", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(entry),
    }).then((r) => json<GlossaryEntry[]>(r)),

  updateGlossaryEntry: (id: string, entry: { term: string; translations: Record<string, string>; note?: string }) =>
    fetch(`/api/glossary/${encodeURIComponent(id)}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(entry),
    }).then((r) => json<GlossaryEntry[]>(r)),

  deleteGlossaryEntry: (id: string) =>
    fetch(`/api/glossary/${encodeURIComponent(id)}`, { method: "DELETE" }).then((r) => json<GlossaryEntry[]>(r)),

  listPresets: () => fetch("/api/presets").then((r) => json<LetteringPreset[]>(r)),

  addPreset: (preset: { name: string; text: PresetTextFields; background: PresetBackgroundFields }) =>
    fetch("/api/presets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(preset),
    }).then((r) => json<LetteringPreset[]>(r)),

  updatePreset: (id: string, preset: { name: string; text: PresetTextFields; background: PresetBackgroundFields }) =>
    fetch(`/api/presets/${encodeURIComponent(id)}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(preset),
    }).then((r) => json<LetteringPreset[]>(r)),

  deletePreset: (id: string) =>
    fetch(`/api/presets/${encodeURIComponent(id)}`, { method: "DELETE" }).then((r) => json<LetteringPreset[]>(r)),

  getVolumeReport: (volumeId: string) =>
    fetch(`/api/volumes/${encodeURIComponent(volumeId)}/reports`).then((r) => json<{ page: string; layout: PageLayout }[]>(r)),
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
