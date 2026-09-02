import type { PageLayout } from "../../../shared/src/layoutSchema";
import type { LanguageDef } from "../../../shared/src/languages";
import type { Character } from "../../../shared/src/characters";
import type { Entity, EntityRelation } from "../../../shared/src/entities";
import type { GlossaryEntry } from "../../../shared/src/glossary";
import type { LetteringPreset, PresetTextFields, PresetBackgroundFields } from "../../../shared/src/presets";
import type { ProjectSettings } from "../../../shared/src/settings";
import type { ProjectFile } from "../../../shared/src/project";
import type { ScriptDocument } from "../../../shared/src/script";
import type { Comment, CommentDocument, CommentTarget } from "../../../shared/src/comments";
import type { ProjectRole, PublicUser } from "../../../shared/src/users";
import type { CbzMetadata } from "../../../shared/src/cbz";
import type { PageMetaDocument } from "../../../shared/src/pageMeta";
import { apiUrl } from "./apiBase";
import { authFetch, authUrl } from "./authFetch";
import { getCurrentProjectId } from "./projectScope";

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
  id: string;
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

/** Builds a project-scoped API path — `/api/p/:projectId<path>` when a project is set
 * (see projectScope.ts, set by ProjectContext.tsx's ProjectScope layout route as soon
 * as a `/p/:projectId/...` route is entered), else falls back to the legacy unscoped
 * `/api<path>` — a safety net for the rare call that fires before the ambient id is set,
 * still fully functional since the server keeps the unscoped routes mounted alongside
 * the scoped ones (see docs/FEATURES.md's Mehrbenutzerbetrieb section). `path` must
 * start with "/", e.g. "/volumes/xyz". Every api.* method below that talks to a
 * project-content route (volumes/fonts/images/bubble-svgs/languages/characters/
 * glossary/presets/settings) goes through this instead of apiUrl() directly —
 * /api/project, /api/auth, /api/browse, /api/demo stay on apiUrl() since they're
 * server-wide or operate on an explicit file path, never "the current project". */
function projectApiUrl(path: string): string {
  const projectId = getCurrentProjectId();
  return apiUrl(projectId ? `/api/p/${encodeURIComponent(projectId)}${path}` : `/api${path}`);
}

export interface RecentlyActiveUser {
  username: string;
  secondsAgo: number;
}

export type ProjectSwitchResult =
  | ({ blocked: false } & { filePath: string } & ProjectFile)
  | { blocked: true; activeUsers: RecentlyActiveUser[] };

async function handleProjectSwitchResponse(res: Response): Promise<ProjectSwitchResult> {
  if (res.status === 409) {
    const body = (await res.json()) as { error?: string; activeUsers?: RecentlyActiveUser[] };
    if (body.error === "project_switch_blocked") {
      return { blocked: true, activeUsers: body.activeUsers ?? [] };
    }
  }
  if (!res.ok) await throwApiError(res);
  const data = (await res.json()) as { filePath: string } & ProjectFile;
  return { blocked: false, ...data };
}

/** Wraps every entry's server-emitted `url` field (a root-relative, always-unscoped
 * "/api/..." path, see server/src/lib/assetRouter.ts — it has no notion of the ambient
 * project) through projectApiUrl() — these come back inside JSON bodies, not built from
 * a string literal here, so the api.* methods that fetch them must strip the leading
 * "/api" and re-scope them the same way every other project-content path in this file
 * is built, or a second browser tab on a different project would fetch the wrong
 * project's file. */
function withApiUrls<T extends { url: string }>(entries: T[]): T[] {
  return entries.map((e) => ({ ...e, url: authUrl(projectApiUrl(e.url.replace(/^\/api/, ""))) }));
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
  listVolumes: () => authFetch(projectApiUrl("/volumes")).then((r) => json<VolumeSummary[]>(r)),

  listPages: (volumeId: string) =>
    authFetch(projectApiUrl(`/volumes/${encodeURIComponent(volumeId)}/pages`)).then((r) => json<PageSummary[]>(r)),

  pageImageUrl: (volumeId: string, page: string) =>
    authUrl(projectApiUrl(`/volumes/${encodeURIComponent(volumeId)}/pages/${encodeURIComponent(page)}/image`)),

  pageThumbnailUrl: (volumeId: string, page: string) =>
    authUrl(projectApiUrl(`/volumes/${encodeURIComponent(volumeId)}/pages/${encodeURIComponent(page)}/thumbnail`)),

  /** Runs Cleaning/Inpainting over `boxes` (already detected client-side, see
   * ocr/workerClient.ts's runCleanupDetection()) and caches the result server-side —
   * see server/src/lib/inpainting.ts. Resolves once the cache is written; the caller
   * then reads `cleanedImageUrl()` for a preview (or a cache-busting query param if it
   * was already loaded once before, e.g. after re-cleaning). Does NOT touch the page's
   * saved layout — the caller sets `useCleanedBackground` itself once the user
   * confirms the before/after review. */
  cleanPage: (volumeId: string, page: string, boxes: { x: number; y: number; width: number; height: number }[]) =>
    authFetch(projectApiUrl(`/volumes/${encodeURIComponent(volumeId)}/pages/${encodeURIComponent(page)}/clean`), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ boxes }),
    }).then((r) => json<{ ok: true }>(r)),

  cleanedImageUrl: (volumeId: string, page: string) =>
    authUrl(projectApiUrl(`/volumes/${encodeURIComponent(volumeId)}/pages/${encodeURIComponent(page)}/cleaned-image`)),

  /** Uploads one or more page-scan images into the volume's source folder — lets a
   * client on a different machine than the server add pages without filesystem/
   * network-share access to scanRoot. `overwrite` names files the caller has already
   * confirmed replacing (the second call after a user approves a collision modal). */
  uploadPages: (volumeId: string, files: File[], overwrite?: string[]) => {
    const form = new FormData();
    files.forEach((f) => form.append("pages", f));
    if (overwrite && overwrite.length > 0) form.append("overwrite", JSON.stringify(overwrite));
    return authFetch(projectApiUrl(`/volumes/${encodeURIComponent(volumeId)}/pages`), { method: "POST", body: form }).then((r) =>
      json<{ written: string[]; conflicts: string[] }>(r)
    );
  },

  /** Imports Clip Studio Paint (.clip) files as new pages — see
   * server/src/lib/clipImport.ts. Same written/conflicts contract as uploadPages(),
   * plus `invalid` (files that weren't parseable .clip containers) and
   * `reducedQuality` (files written successfully but only at CSP's embedded-preview
   * resolution, not full canvas resolution — see that module's doc comment for why). */
  importClip: (volumeId: string, files: File[], overwrite?: string[]) => {
    const form = new FormData();
    files.forEach((f) => form.append("pages", f));
    if (overwrite && overwrite.length > 0) form.append("overwrite", JSON.stringify(overwrite));
    return authFetch(projectApiUrl(`/volumes/${encodeURIComponent(volumeId)}/pages/import-clip`), { method: "POST", body: form }).then((r) =>
      json<{ written: string[]; conflicts: string[]; invalid: string[]; reducedQuality: string[] }>(r)
    );
  },

  deletePage: (volumeId: string, page: string) =>
    authFetch(projectApiUrl(`/volumes/${encodeURIComponent(volumeId)}/pages/${encodeURIComponent(page)}`), {
      method: "DELETE",
    }).then((r) => json<{ ok: true }>(r)),

  /** Same GET+ETag shape as getLayoutWithEtag() — the returned `order` is always a
   * complete, immediately usable array (derived from the natural filename sort when no
   * order has been saved yet, see server/src/routes/pageOrder.ts), so the page grid
   * never needs a separate "no order yet" branch. */
  getPageOrder: async (volumeId: string): Promise<{ order: string[]; etag: string | null }> => {
    const res = await authFetch(projectApiUrl(`/volumes/${encodeURIComponent(volumeId)}/pages/order`));
    const body = await json<{ order: string[] }>(res);
    return { order: body.order, etag: res.headers.get("ETag") };
  },

  /** Same conflict-handling shape as saveLayout() — `ifMatch`, when given, is sent as
   * an If-Match header, and a 409 (someone else saved a different order since `ifMatch`
   * was read) is returned to the caller rather than thrown, since it's an expected,
   * recoverable outcome the page grid needs to react to (conflict modal), not a hard
   * error. */
  savePageOrder: async (
    volumeId: string,
    order: string[],
    ifMatch?: string
  ): Promise<{ conflict: false; etag: string | null } | { conflict: true; currentOrder: string[] }> => {
    const res = await authFetch(projectApiUrl(`/volumes/${encodeURIComponent(volumeId)}/pages/order`), {
      method: "PUT",
      headers: { "Content-Type": "application/json", ...(ifMatch ? { "If-Match": ifMatch } : {}) },
      body: JSON.stringify({ order }),
    });
    if (res.status === 409) {
      const body = (await res.json()) as { currentOrder: string[] };
      return { conflict: true, currentOrder: body.currentOrder };
    }
    if (!res.ok) await throwApiError(res);
    return { conflict: false, etag: res.headers.get("ETag") };
  },

  /** Same GET+ETag shape as getPageOrder() — the returned document is always complete
   * ({ chapters: [], pages: {} } when nothing has been saved yet, see
   * server/src/routes/pageMeta.ts), so callers never need a separate "no document yet"
   * branch. */
  getPageMeta: async (volumeId: string): Promise<{ meta: PageMetaDocument; etag: string | null }> => {
    const res = await authFetch(projectApiUrl(`/volumes/${encodeURIComponent(volumeId)}/pages/meta`));
    const meta = await json<PageMetaDocument>(res);
    return { meta, etag: res.headers.get("ETag") };
  },

  /** Same conflict-handling shape as savePageOrder(). */
  savePageMeta: async (
    volumeId: string,
    meta: PageMetaDocument,
    ifMatch?: string
  ): Promise<{ conflict: false; etag: string | null } | { conflict: true; current: PageMetaDocument }> => {
    const res = await authFetch(projectApiUrl(`/volumes/${encodeURIComponent(volumeId)}/pages/meta`), {
      method: "PUT",
      headers: { "Content-Type": "application/json", ...(ifMatch ? { "If-Match": ifMatch } : {}) },
      body: JSON.stringify(meta),
    });
    if (res.status === 409) {
      const body = (await res.json()) as { current: PageMetaDocument };
      return { conflict: true, current: body.current };
    }
    if (!res.ok) await throwApiError(res);
    return { conflict: false, etag: res.headers.get("ETag") };
  },

  getLayout: (volumeId: string, page: string) =>
    authFetch(projectApiUrl(`/volumes/${encodeURIComponent(volumeId)}/pages/${encodeURIComponent(page)}/layout`)).then((r) =>
      json<PageLayout>(r)
    ),

  /** Same GET as getLayout(), but also surfaces the response's ETag header — used only
   * by the editor's own load-then-save cycle (editorStore.ts) for optimistic-concurrency
   * conflict detection on save (see saveLayout()'s `ifMatch` param). The read-only
   * consumers of getLayout() (export, Reader, TranslatorContextPanel) never save back,
   * so they don't need it — kept as a separate method rather than changing getLayout()'s
   * return shape for everyone. */
  getLayoutWithEtag: async (volumeId: string, page: string): Promise<{ layout: PageLayout; etag: string | null }> => {
    const res = await authFetch(projectApiUrl(`/volumes/${encodeURIComponent(volumeId)}/pages/${encodeURIComponent(page)}/layout`));
    const layout = await json<PageLayout>(res);
    return { layout, etag: res.headers.get("ETag") };
  },

  /** `ifMatch`, when given, is sent as an If-Match header — the server 409s with the
   * other side's currently-saved layout instead of silently overwriting it if the
   * document changed since `ifMatch` was read (see server/src/routes/layout.ts). Handled
   * inline (not via the generic json()/throwApiError path) since a 409 here is an
   * expected, recoverable outcome the caller needs to react to, not a hard error. */
  saveLayout: async (
    volumeId: string,
    page: string,
    layout: PageLayout,
    ifMatch?: string
  ): Promise<{ conflict: false; etag: string | null } | { conflict: true; currentLayout: PageLayout | null }> => {
    const res = await authFetch(projectApiUrl(`/volumes/${encodeURIComponent(volumeId)}/pages/${encodeURIComponent(page)}/layout`), {
      method: "PUT",
      headers: { "Content-Type": "application/json", ...(ifMatch ? { "If-Match": ifMatch } : {}) },
      body: JSON.stringify(layout),
    });
    if (res.status === 409) {
      const body = (await res.json()) as { currentLayout: PageLayout | null };
      return { conflict: true, currentLayout: body.currentLayout };
    }
    if (!res.ok) await throwApiError(res);
    return { conflict: false, etag: res.headers.get("ETag") };
  },

  getScript: (volumeId: string) =>
    authFetch(projectApiUrl(`/volumes/${encodeURIComponent(volumeId)}/script`)).then((r) => json<ScriptDocument>(r)),

  saveScript: (volumeId: string, doc: ScriptDocument) =>
    authFetch(projectApiUrl(`/volumes/${encodeURIComponent(volumeId)}/script`), {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(doc),
    }).then((r) => json<{ ok: true }>(r)),

  /** Whole volume's comments, or just one page's if `page` is given (server-side
   * `?page=` filter — see server/src/routes/comments.ts). */
  getComments: (volumeId: string, page?: string) =>
    authFetch(
      projectApiUrl(`/volumes/${encodeURIComponent(volumeId)}/comments${page ? `?page=${encodeURIComponent(page)}` : ""}`)
    ).then((r) => json<CommentDocument>(r)),

  createComment: (
    volumeId: string,
    input: { page: string; target: CommentTarget; body: string; mentionedUserIds?: string[]; mentionedRoles?: ProjectRole[] }
  ) =>
    authFetch(projectApiUrl(`/volumes/${encodeURIComponent(volumeId)}/comments`), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    }).then((r) => json<Comment>(r)),

  replyToComment: (
    volumeId: string,
    commentId: string,
    input: { body: string; mentionedUserIds?: string[]; mentionedRoles?: ProjectRole[] }
  ) =>
    authFetch(projectApiUrl(`/volumes/${encodeURIComponent(volumeId)}/comments/${encodeURIComponent(commentId)}/replies`), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    }).then((r) => json<Comment>(r)),

  setCommentResolved: (volumeId: string, commentId: string, resolved: boolean) =>
    authFetch(projectApiUrl(`/volumes/${encodeURIComponent(volumeId)}/comments/${encodeURIComponent(commentId)}`), {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ resolved }),
    }).then((r) => json<Comment>(r)),

  deleteComment: (volumeId: string, commentId: string) =>
    authFetch(projectApiUrl(`/volumes/${encodeURIComponent(volumeId)}/comments/${encodeURIComponent(commentId)}`), {
      method: "DELETE",
    }).then((r) => json<{ ok: true }>(r)),

  /** {userId, username} for every project member — for the @-mention picker. Deliberately
   * NOT the same as the admin-only project-members endpoint (see comments.ts's own doc
   * comment) — any commenter can call this. */
  getMentionableMembers: (volumeId: string) =>
    authFetch(projectApiUrl(`/volumes/${encodeURIComponent(volumeId)}/comments/mentionable-members`)).then((r) =>
      json<{ userId: string; username: string }[]>(r)
    ),

  listFonts: () => authFetch(projectApiUrl("/fonts")).then((r) => json<FontEntry[]>(r)).then(withApiUrls),

  uploadFont: (file: File) => {
    const form = new FormData();
    form.append("font", file);
    return authFetch(projectApiUrl("/fonts"), { method: "POST", body: form }).then((r) => json<{ ok: true; fileName: string; scope: AssetScope }>(r));
  },

  exportPage: (volumeId: string, page: string, folderSuffix: string, blob: Blob, extension: string = "png") => {
    const form = new FormData();
    form.append("png", blob, `${page}.${extension}`);
    form.append("folderSuffix", folderSuffix);
    form.append("page", page);
    form.append("extension", extension);
    return authFetch(projectApiUrl(`/volumes/${encodeURIComponent(volumeId)}/export`), { method: "POST", body: form }).then((r) =>
      json<{ ok: true; path: string }>(r)
    );
  },

  exportPrintPage: (volumeId: string, page: string, folderSuffix: string, blob: Blob) => {
    const form = new FormData();
    form.append("png", blob, `${page}.png`);
    form.append("folderSuffix", folderSuffix);
    form.append("page", page);
    return authFetch(projectApiUrl(`/volumes/${encodeURIComponent(volumeId)}/export-print`), { method: "POST", body: form }).then((r) =>
      json<{ ok: true; path: string }>(r)
    );
  },

  /** Vector print PDF — unlike exportPage/exportPrintPage, sends the raw PageLayout JSON
   * (no client-side render): the server renders it itself so bubble/curved text becomes
   * genuine PDF vector text (see server/src/lib/vectorPdf/buildPdfPage.ts). `pdfxStamped`
   * in the response is false when the server has no PDFX_ICC_PROFILE_PATH configured —
   * the PDF is still real vector text over a CMYK background, just not certifiable as
   * PDF/X (surface this to the user rather than silently claim compliance). */
  exportVectorPdfPage: (
    volumeId: string,
    page: string,
    folderSuffix: string,
    layout: PageLayout,
    languageCode: string,
    pdfxVersion: "x1a" | "x4"
  ) =>
    authFetch(projectApiUrl(`/volumes/${encodeURIComponent(volumeId)}/export-vector-pdf`), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ folderSuffix, page, languageCode, pdfxVersion, layout }),
    }).then((r) => json<{ ok: true; path: string; pdfxStamped: boolean }>(r)),

  /** Layered PSD export — same "send the raw PageLayout JSON, server renders" pattern
   * as exportVectorPdfPage. Every layer always carries a raster PNG-with-alpha;
   * `editableTextLayers` (opt-in) additionally attaches real, Photoshop-Type-tool-
   * editable text objects to qualifying bubbles (see server/src/lib/psdExport.ts). */
  exportPsdPage: (
    volumeId: string,
    page: string,
    folderSuffix: string,
    layout: PageLayout,
    languageCode: string,
    editableTextLayers?: boolean
  ) =>
    authFetch(projectApiUrl(`/volumes/${encodeURIComponent(volumeId)}/export-psd`), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ folderSuffix, page, languageCode, layout, editableTextLayers }),
    }).then((r) => json<{ ok: true; path: string }>(r)),

  /** Starts a background export job (server/src/lib/exportJobs.ts) covering every page
   * in `pages` at once — the batch-export counterpart to exportVectorPdfPage/
   * exportPsdPage's one-page-at-a-time calls, used by BatchExportQueueModal.tsx. The
   * server re-reads each page's already-SAVED layout from disk itself, so this never
   * sends layout JSON in the request body regardless of how many pages are queued. */
  startExportJob: (
    volumeId: string,
    format: "vector-pdf" | "psd",
    pages: string[],
    languageCode: string,
    folderSuffix: string,
    pdfxVersion?: "x1a" | "x4"
  ) =>
    authFetch(projectApiUrl(`/volumes/${encodeURIComponent(volumeId)}/export-jobs`), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ format, pages, languageCode, folderSuffix, pdfxVersion }),
    }).then((r) => json<{ jobId: string; total: number }>(r)),

  /** One poll of a background export job's current state — ExportJobState's shape
   * (server/src/lib/exportJobs.ts), returned as-is. */
  getExportJob: (volumeId: string, jobId: string) =>
    authFetch(projectApiUrl(`/volumes/${encodeURIComponent(volumeId)}/export-jobs/${encodeURIComponent(jobId)}`)).then((r) =>
      json<{
        id: string;
        status: "running" | "done" | "failed";
        total: number;
        completed: number;
        results: { page: string; status: "done" | "skipped" | "error"; message?: string }[];
        error?: string;
      }>(r)
    ),

  exportLayoutsZip: async (volumeId: string) => {
    const res = await authFetch(projectApiUrl(`/volumes/${encodeURIComponent(volumeId)}/layouts/export-zip`));
    if (!res.ok) await throwApiError(res);
    return res.blob();
  },

  importLayoutsZip: (volumeId: string, file: File) => {
    const form = new FormData();
    form.append("zip", file);
    return authFetch(projectApiUrl(`/volumes/${encodeURIComponent(volumeId)}/layouts/import-zip`), { method: "POST", body: form }).then(
      (r) => json<{ ok: true; imported: string[]; skipped: { file: string; reason: string }[] }>(r)
    );
  },

  listExports: (volumeId: string) =>
    authFetch(projectApiUrl(`/volumes/${encodeURIComponent(volumeId)}/exports`)).then((r) =>
      json<{
        exportFolderTemplate: string;
        exports: {
          folderSuffix: string;
          folderName: string;
          files: {
            name: string;
            page: string;
            extension: string;
            size: number;
            mtime: string;
            url: string;
          }[];
        }[];
      }>(r)
    ),

  exportFileUrl: (volumeId: string, folderSuffix: string, fileName: string) =>
    authUrl(projectApiUrl(`/volumes/${encodeURIComponent(volumeId)}/exports/${encodeURIComponent(folderSuffix)}/${encodeURIComponent(fileName)}`)),

  exportFileDownloadUrl: (volumeId: string, folderSuffix: string, fileName: string) =>
    authUrl(projectApiUrl(`/volumes/${encodeURIComponent(volumeId)}/exports/${encodeURIComponent(folderSuffix)}/${encodeURIComponent(fileName)}?download=true`)),

  /** `pageIds` restricts the archive to that subset (e.g. a single chapter — see
   * shared/src/pageMeta.ts's resolveChapters) instead of the whole export folder. */
  exportFolderZipUrl: (volumeId: string, folderSuffix: string, pageIds?: string[]) =>
    authUrl(
      projectApiUrl(`/volumes/${encodeURIComponent(volumeId)}/exports/${encodeURIComponent(folderSuffix)}/zip`) +
        (pageIds && pageIds.length > 0 ? `?pageIds=${encodeURIComponent(pageIds.join(","))}` : "")
    ),

  /** POST (not a plain `<a href>` like the ZIP download) because the full ComicInfo.xml
   * field set collected by CbzMetadataModal.tsx — including a per-page <Pages> table for
   * larger volumes — can exceed a comfortable query-string size. Streams the response
   * into a Blob and triggers the save via a throwaway object URL + synthetic click,
   * since a POST response can't be handed to the browser as a plain navigation target. */
  downloadExportCbz: async (volumeId: string, folderSuffix: string, metadata: CbzMetadata): Promise<void> => {
    const res = await authFetch(projectApiUrl(`/volumes/${encodeURIComponent(volumeId)}/exports/${encodeURIComponent(folderSuffix)}/cbz`), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(metadata),
    });
    if (!res.ok) await throwApiError(res);
    const blob = await res.blob();
    const disposition = res.headers.get("Content-Disposition") ?? "";
    const fileNameMatch = /filename="([^"]+)"/.exec(disposition);
    const fileName = fileNameMatch ? fileNameMatch[1] : `${volumeId}_${folderSuffix}.cbz`;

    const objectUrl = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = objectUrl;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(objectUrl);
  },

  deleteExportFile: (volumeId: string, folderSuffix: string, fileName: string) =>
    authFetch(projectApiUrl(`/volumes/${encodeURIComponent(volumeId)}/exports/${encodeURIComponent(folderSuffix)}/${encodeURIComponent(fileName)}`), {
      method: "DELETE",
    }).then((r) => json<{ ok: true }>(r)),

  deleteExportFolder: (volumeId: string, folderSuffix: string) =>
    authFetch(projectApiUrl(`/volumes/${encodeURIComponent(volumeId)}/exports/${encodeURIComponent(folderSuffix)}`), {
      method: "DELETE",
    }).then((r) => json<{ ok: true }>(r)),

  listImages: (folder = "") =>
    authFetch(projectApiUrl(`/images${folderQuery(folder)}`)).then((r) => json<AssetListing<ImageEntry>>(r)).then(withListingApiUrls),

  /** `relativePath` is a "/"-joined path as stored in ImageElement.files/PanelCut
   * replacement files ("" or no slash = root, "effects/boom.png" = inside a folder) —
   * split internally so every call site can keep passing just one string regardless of
   * which folder the image actually lives in. */
  imagesFileUrl: (relativePath: string) => {
    const { folder, fileName } = splitAssetPath(relativePath);
    return authUrl(projectApiUrl(`/images/file/${encodeURIComponent(fileName)}${folderQuery(folder)}`));
  },

  uploadImage: (file: File, folder = "") => {
    const form = new FormData();
    form.append("image", file);
    if (folder) form.append("folder", folder);
    return authFetch(projectApiUrl("/images"), { method: "POST", body: form }).then((r) =>
      json<{ ok: true; fileName: string; folder: string; width: number; height: number; scope: AssetScope }>(r)
    ).then((result) => ({ ...result, fileName: joinAssetPath(result.folder, result.fileName) }));
  },

  createImageFolder: (folder: string) =>
    authFetch(projectApiUrl("/images/folders"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ folder }),
    }).then((r) => json<{ ok: true; folder: string }>(r)),

  deleteImageFolder: (folder: string) =>
    authFetch(projectApiUrl(`/images/folders${folderQuery(folder)}`), { method: "DELETE" }).then((r) => json<{ ok: true }>(r)),

  moveImage: (fileName: string, fromFolder: string, toFolder: string) =>
    authFetch(projectApiUrl("/images/move"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fileName, fromFolder, toFolder }),
    }).then((r) => json<{ ok: true }>(r)),

  listBubbleSvgs: (folder = "") =>
    authFetch(projectApiUrl(`/bubble-svgs${folderQuery(folder)}`)).then((r) => json<AssetListing<BubbleSvgEntry>>(r)).then(withListingApiUrls),

  /** Same "/"-joined-full-path contract as imagesFileUrl() above. */
  bubbleSvgFileUrl: (relativePath: string) => {
    const { folder, fileName } = splitAssetPath(relativePath);
    return authUrl(projectApiUrl(`/bubble-svgs/file/${encodeURIComponent(fileName)}${folderQuery(folder)}`));
  },

  uploadBubbleSvg: (file: File, folder = "") => {
    const form = new FormData();
    form.append("svg", file);
    if (folder) form.append("folder", folder);
    return authFetch(projectApiUrl("/bubble-svgs"), { method: "POST", body: form }).then((r) =>
      json<{ ok: true; fileName: string; folder: string; scope: AssetScope }>(r)
    ).then((result) => ({ ...result, fileName: joinAssetPath(result.folder, result.fileName) }));
  },

  createBubbleSvgFolder: (folder: string) =>
    authFetch(projectApiUrl("/bubble-svgs/folders"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ folder }),
    }).then((r) => json<{ ok: true; folder: string }>(r)),

  deleteBubbleSvgFolder: (folder: string) =>
    authFetch(projectApiUrl(`/bubble-svgs/folders${folderQuery(folder)}`), { method: "DELETE" }).then((r) => json<{ ok: true }>(r)),

  moveBubbleSvg: (fileName: string, fromFolder: string, toFolder: string) =>
    authFetch(projectApiUrl("/bubble-svgs/move"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fileName, fromFolder, toFolder }),
    }).then((r) => json<{ ok: true }>(r)),

  listLanguages: () => authFetch(projectApiUrl("/languages")).then((r) => json<LanguageDef[]>(r)),

  addLanguage: (language: LanguageDef) =>
    authFetch(projectApiUrl("/languages"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(language),
    }).then((r) => json<LanguageDef[]>(r)),

  updateLanguage: (code: string, language: LanguageDef) =>
    authFetch(projectApiUrl(`/languages/${encodeURIComponent(code)}`), {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(language),
    }).then((r) => json<LanguageDef[]>(r)),

  deleteLanguage: (code: string) =>
    authFetch(projectApiUrl(`/languages/${encodeURIComponent(code)}`), { method: "DELETE" }).then((r) => json<LanguageDef[]>(r)),

  getSettings: () =>
    authFetch(projectApiUrl("/settings")).then((r) => json<ProjectSettings & { scanRootExists: boolean; assetsDirExists: boolean; thumbnailsDirExists: boolean }>(r)),

  updateSettings: (settings: ProjectSettings) =>
    authFetch(projectApiUrl("/settings"), {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(settings),
    }).then((r) => json<ProjectSettings & { scanRootExists: boolean; assetsDirExists: boolean; thumbnailsDirExists: boolean }>(r)),

  getCurrentProject: () => authFetch(apiUrl("/api/project/current")).then((r) => json<CurrentProject | null>(r)),

  /** Bootstrap call for a `/p/:projectId/...` route (see server/src/app.ts's
   * `GET /api/p/:projectId`) — takes an explicit id rather than reading the ambient
   * one, since this is exactly the call that resolves an id from the URL into the
   * project data ProjectContext.tsx needs before anything else can run. */
  getProjectInfo: (projectId: string) =>
    authFetch(apiUrl(`/api/p/${encodeURIComponent(projectId)}`)).then((r) => json<CurrentProject>(r)),

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

  /** Switching the server's single active project can pull it out from under other
   * users still working in it (see server/src/lib/activityTracker.ts) — the server 409s
   * with who was recently active instead of switching, unless `force` is set. Handled
   * inline here (not via the generic json()/throwApiError path) since the 409 body
   * carries a structured activeUsers list, not the flat string params ApiError supports. */
  openProject: async (filePath: string, force?: boolean): Promise<ProjectSwitchResult> => {
    const res = await authFetch(apiUrl("/api/project/open"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ filePath, force }),
    });
    return handleProjectSwitchResponse(res);
  },

  createProject: async (data: {
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
    force?: boolean;
  }): Promise<ProjectSwitchResult> => {
    const res = await authFetch(apiUrl("/api/project/new"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    return handleProjectSwitchResponse(res);
  },

  /** Bundles the currently active project (JSON + scan folder + assets + cover) into a
   * single zip written server-side into `destDir` — see server/src/lib/projectPackage.ts.
   * Makes the project transportable: no more machine-specific absolute paths baked in. */
  exportProjectPackage: (destDir: string, fileName?: string) =>
    authFetch(apiUrl("/api/project/export-package"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ destDir, fileName }),
    }).then((r) => json<{ filePath: string }>(r)),

  /** Unpacks a package written by exportProjectPackage() into `destDir` as a new,
   * independent project and opens it. */
  importProjectPackage: async (
    zipFilePath: string,
    destDir: string,
    opts?: { createDestDirIfMissing?: boolean; force?: boolean }
  ): Promise<ProjectSwitchResult> => {
    const res = await authFetch(apiUrl("/api/project/import-package"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ zipFilePath, destDir, ...opts }),
    });
    return handleProjectSwitchResponse(res);
  },

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

  browse: (path?: string, filter?: "directories" | "json" | "image" | "zip") => {
    const params = new URLSearchParams();
    if (path) params.set("path", path);
    if (filter) params.set("filter", filter);
    const query = params.toString();
    return authFetch(apiUrl(`/api/browse${query ? `?${query}` : ""}`)).then((r) => json<BrowseResult>(r));
  },

  listCharacters: () => authFetch(projectApiUrl("/characters")).then((r) => json<Character[]>(r)),

  addCharacter: (character: { name: string; color: string; voiceNotes?: string }) =>
    authFetch(projectApiUrl("/characters"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(character),
    }).then((r) => json<Character[]>(r)),

  updateCharacter: (id: string, character: { name: string; color: string; voiceNotes?: string }) =>
    authFetch(projectApiUrl(`/characters/${encodeURIComponent(id)}`), {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(character),
    }).then((r) => json<Character[]>(r)),

  deleteCharacter: (id: string) =>
    authFetch(projectApiUrl(`/characters/${encodeURIComponent(id)}`), { method: "DELETE" }).then((r) => json<Character[]>(r)),

  listEntities: () => authFetch(projectApiUrl("/entities")).then((r) => json<Entity[]>(r)),

  addEntity: (entity: { type: string; name: string; color: string; summary?: string; notes?: string }) =>
    authFetch(projectApiUrl("/entities"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(entity),
    }).then((r) => json<Entity[]>(r)),

  updateEntity: (id: string, entity: { type: string; name: string; color: string; summary?: string; notes?: string }) =>
    authFetch(projectApiUrl(`/entities/${encodeURIComponent(id)}`), {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(entity),
    }).then((r) => json<Entity[]>(r)),

  deleteEntity: (id: string) =>
    authFetch(projectApiUrl(`/entities/${encodeURIComponent(id)}`), { method: "DELETE" }).then((r) => json<Entity[]>(r)),

  listEntityRelations: () => authFetch(projectApiUrl("/entities/relations")).then((r) => json<EntityRelation[]>(r)),

  addEntityRelation: (relation: { fromId: string; toId: string; label: string }) =>
    authFetch(projectApiUrl("/entities/relations"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(relation),
    }).then((r) => json<EntityRelation[]>(r)),

  deleteEntityRelation: (id: string) =>
    authFetch(projectApiUrl(`/entities/relations/${encodeURIComponent(id)}`), { method: "DELETE" }).then((r) => json<EntityRelation[]>(r)),

  /** Every entity's gallery lives in its own asset-router folder, named by the
   * entity's id — see server/src/routes/entityImages.ts. Unlike listImages()/
   * uploadImage() there's no folder-browsing UI here, so these always pass `folder =
   * entityId` for the caller instead of taking a folder parameter. */
  listEntityImages: (entityId: string) =>
    authFetch(projectApiUrl(`/entity-images${folderQuery(entityId)}`)).then((r) => json<AssetListing<ImageEntry>>(r)).then(withListingApiUrls),

  entityImageFileUrl: (entityId: string, fileName: string) =>
    authUrl(projectApiUrl(`/entity-images/file/${encodeURIComponent(fileName)}${folderQuery(entityId)}`)),

  uploadEntityImage: (entityId: string, file: File) => {
    const form = new FormData();
    form.append("image", file);
    form.append("folder", entityId);
    return authFetch(projectApiUrl("/entity-images"), { method: "POST", body: form }).then((r) =>
      json<{ ok: true; fileName: string; folder: string; width: number; height: number; scope: AssetScope }>(r)
    );
  },

  deleteEntityImage: (entityId: string, fileName: string) =>
    authFetch(projectApiUrl(`/entity-images/file/${encodeURIComponent(fileName)}${folderQuery(entityId)}`), { method: "DELETE" }).then((r) =>
      json<{ ok: true }>(r)
    ),

  listGlossary: () => authFetch(projectApiUrl("/glossary")).then((r) => json<GlossaryEntry[]>(r)),

  addGlossaryEntry: (entry: { term: string; translations: Record<string, string>; readings?: Record<string, string>; note?: string }) =>
    authFetch(projectApiUrl("/glossary"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(entry),
    }).then((r) => json<GlossaryEntry[]>(r)),

  updateGlossaryEntry: (
    id: string,
    entry: { term: string; translations: Record<string, string>; readings?: Record<string, string>; note?: string }
  ) =>
    authFetch(projectApiUrl(`/glossary/${encodeURIComponent(id)}`), {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(entry),
    }).then((r) => json<GlossaryEntry[]>(r)),

  deleteGlossaryEntry: (id: string) =>
    authFetch(projectApiUrl(`/glossary/${encodeURIComponent(id)}`), { method: "DELETE" }).then((r) => json<GlossaryEntry[]>(r)),

  listPresets: () => authFetch(projectApiUrl("/presets")).then((r) => json<LetteringPreset[]>(r)),

  addPreset: (preset: { name: string; text: PresetTextFields; background: PresetBackgroundFields }) =>
    authFetch(projectApiUrl("/presets"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(preset),
    }).then((r) => json<LetteringPreset[]>(r)),

  updatePreset: (id: string, preset: { name: string; text: PresetTextFields; background: PresetBackgroundFields }) =>
    authFetch(projectApiUrl(`/presets/${encodeURIComponent(id)}`), {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(preset),
    }).then((r) => json<LetteringPreset[]>(r)),

  deletePreset: (id: string) =>
    authFetch(projectApiUrl(`/presets/${encodeURIComponent(id)}`), { method: "DELETE" }).then((r) => json<LetteringPreset[]>(r)),

  getVolumeReport: (volumeId: string) =>
    authFetch(projectApiUrl(`/volumes/${encodeURIComponent(volumeId)}/reports`)).then((r) => json<{ page: string; layout: PageLayout }[]>(r)),

  // --- Auth / roles ---

  getSetupStatus: () => authFetch(apiUrl("/api/auth/setup-status")).then((r) => json<{ hasAnyUsers: boolean; demoMode: boolean }>(r)),

  /** Auto-issued token for the seeded demo account — only reachable when the server
   * reports demoMode: true (see getSetupStatus()/SessionContext.tsx). */
  getDemoToken: () => authFetch(apiUrl("/api/demo/token")).then((r) => json<{ token: string; user: PublicUser }>(r)),

  /** Optional lead-capture gate — always resolves (server never fails this request
   * on purpose), so callers can fire-and-forget it. */
  submitDemoEmail: (email: string) =>
    authFetch(apiUrl("/api/demo/email"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    }).then((r) => json<{ ok: true }>(r)),

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

  updateUser: (id: string, data: { password?: string; isSystemAdmin?: boolean; email?: string | null }) =>
    authFetch(apiUrl(`/api/auth/users/${encodeURIComponent(id)}`), {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    }).then((r) => json<PublicUser>(r)),

  changeOwnPassword: (currentPassword: string, newPassword: string) =>
    authFetch(apiUrl("/api/auth/change-password"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ currentPassword, newPassword }),
    }).then((r) => json<{ ok: true }>(r)),

  /** Self-service — sets/clears (email: null) the logged-in user's own email, no
   * system-admin rights needed. Used for @-mention notifications (server/src/lib/
   * mailer.ts) — see PATCH /api/auth/me's own doc comment. */
  updateOwnEmail: (email: string | null) =>
    authFetch(apiUrl("/api/auth/me"), {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    }).then((r) => json<PublicUser>(r)),

  // --- AI provider configuration (self-service, per account) ---

  getAIProviderStatus: () =>
    authFetch(apiUrl("/api/auth/me/ai-status")).then((r) =>
      json<{
        openai: { configured: boolean };
        codex: { configured: boolean; planType?: string; usedPercent?: number };
        anthropic: { configured: boolean };
        google: { configured: boolean };
        openrouter: { configured: boolean };
        ollama: { configured: boolean; baseUrl?: string; model?: string };
      }>(r)
    ),

  setOpenAIKey: (apiKey: string) =>
    authFetch(apiUrl("/api/auth/me/openai-key"), {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ apiKey }),
    }).then((r) => json<{ ok: true }>(r)),

  clearOpenAIKey: () => authFetch(apiUrl("/api/auth/me/openai-key"), { method: "DELETE" }).then((r) => json<{ ok: true }>(r)),

  // Anthropic/Google/OpenRouter key management — exact mirror of setOpenAIKey/
  // clearOpenAIKey above, only the route/field name differs.
  setAnthropicKey: (apiKey: string) =>
    authFetch(apiUrl("/api/auth/me/anthropic-key"), {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ apiKey }),
    }).then((r) => json<{ ok: true }>(r)),

  clearAnthropicKey: () => authFetch(apiUrl("/api/auth/me/anthropic-key"), { method: "DELETE" }).then((r) => json<{ ok: true }>(r)),

  setGoogleKey: (apiKey: string) =>
    authFetch(apiUrl("/api/auth/me/google-key"), {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ apiKey }),
    }).then((r) => json<{ ok: true }>(r)),

  clearGoogleKey: () => authFetch(apiUrl("/api/auth/me/google-key"), { method: "DELETE" }).then((r) => json<{ ok: true }>(r)),

  setOpenRouterKey: (apiKey: string) =>
    authFetch(apiUrl("/api/auth/me/openrouter-key"), {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ apiKey }),
    }).then((r) => json<{ ok: true }>(r)),

  clearOpenRouterKey: () => authFetch(apiUrl("/api/auth/me/openrouter-key"), { method: "DELETE" }).then((r) => json<{ ok: true }>(r)),

  // Ollama has no secret — a plain {baseUrl, model} pair instead of an {apiKey}.
  setOllamaConfig: (config: { baseUrl: string; model: string }) =>
    authFetch(apiUrl("/api/auth/me/ollama-config"), {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(config),
    }).then((r) => json<{ ok: true }>(r)),

  clearOllamaConfig: () => authFetch(apiUrl("/api/auth/me/ollama-config"), { method: "DELETE" }).then((r) => json<{ ok: true }>(r)),

  startCodexLogin: () =>
    authFetch(apiUrl("/api/auth/me/codex-login"), { method: "POST" }).then((r) =>
      json<{ loginId: string; userCode: string; verificationUrl: string }>(r)
    ),

  /** 404 (no login in progress) is a normal, expected response here — callers should
   * treat it as "nothing to poll", not an error. */
  pollCodexLoginStatus: async () => {
    const res = await authFetch(apiUrl("/api/auth/me/codex-login/status"));
    if (res.status === 404) return null;
    return json<{ status: "pending" | "complete" | "error"; error?: string }>(res);
  },

  cancelCodexLogin: () => authFetch(apiUrl("/api/auth/me/codex-login"), { method: "DELETE" }).then((r) => json<{ ok: true }>(r)),

  logoutCodex: () => authFetch(apiUrl("/api/auth/me/codex-session"), { method: "DELETE" }).then((r) => json<{ ok: true }>(r)),

  /** Returns the raw fetch Response for the caller (client/src/editor/AIPanel.tsx) to
   * read as a stream — the only streaming endpoint in the app, see server/src/routes/
   * ai.ts's own doc comment for the SSE wire format. Throws (via throwApiError,
   * mirrored here since json() isn't called) on a non-OK response before any stream
   * would even start (e.g. invalid_request, unknown_provider). */
  sendAIChat: async (request: {
    providerId: "openai" | "codex" | "anthropic" | "google" | "openrouter" | "ollama";
    messages: { role: "system" | "user" | "assistant"; content: string }[];
    contextText?: string;
    contextImage?: string;
  }) => {
    const res = await authFetch(apiUrl("/api/ai/chat"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request),
    });
    if (!res.ok) await throwApiError(res);
    return res;
  },

  listProjectsForAdmin: () =>
    authFetch(apiUrl("/api/project/list")).then((r) =>
      json<{ filePath: string; name: string; coverImagePath?: string; isAdmin: boolean; isArchived: boolean }[]>(r)
    ),

  listMembers: (filePath?: string) =>
    authFetch(apiUrl("/api/project/members" + (filePath ? `?filePath=${encodeURIComponent(filePath)}` : ""))).then((r) =>
      json<ProjectMemberView[]>(r)
    ),

  addMember: (username: string, role: ProjectRole, filePath?: string) =>
    authFetch(apiUrl("/api/project/members"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, role, filePath }),
    }).then((r) => json<{ ok: true }>(r)),

  removeMember: (userId: string, filePath?: string) =>
    authFetch(
      apiUrl(`/api/project/members/${encodeURIComponent(userId)}` + (filePath ? `?filePath=${encodeURIComponent(filePath)}` : "")),
      { method: "DELETE" }
    ).then((r) => json<{ ok: true }>(r)),
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
