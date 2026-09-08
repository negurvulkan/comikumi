import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { AssetListing, AssetScope } from "../api/client";
import { translateApiError } from "../i18n/translateApiError";
import { folderBreadcrumb, joinFolder } from "./assetFolders";
import { PencilIcon, TrashIcon } from "./Icons";

/** The subset of client.ts's assetLibraries.* objects (images/instanceImages/
 * bubbleSvgs/instanceBubbleSvgs/fonts/instanceFonts) this component needs — kept as its
 * own local interface rather than importing the concrete return type of
 * createAssetApi(), so AssetBrowser doesn't need to know that factory exists at all. */
export interface AssetApiLike<TEntry extends { fileName: string; url: string; scope: AssetScope }> {
  foldersEnabled: boolean;
  list: (folder?: string) => Promise<AssetListing<TEntry>>;
  upload: (file: File, folder?: string) => Promise<{ fileName: string; folder: string; scope: AssetScope } & Record<string, unknown>>;
  remove: (fileName: string, folder?: string) => Promise<void>;
  rename: (fileName: string, newFileName: string, folder?: string) => Promise<{ fileName: string } & Record<string, unknown>>;
  move: (fileName: string, fromFolder: string, toFolder: string) => Promise<void>;
  createFolder: (folder: string) => Promise<void>;
  deleteFolder: (folder: string) => Promise<void>;
}

interface Props<TEntry extends { fileName: string; url: string; scope: AssetScope }> {
  assetApi: AssetApiLike<TEntry>;
  renderThumb: (entry: TEntry) => React.ReactNode;
  uploadAccept: string;
  uploadLabel: string;
  uploadingLabel: string;
  emptyLabel: string;
  /** Picker mode: present when this browser is used to SELECT an asset (ImagePicker/
   * SvgBubblePicker) — clicking a thumbnail calls this instead of doing nothing. Absent
   * in manager mode (Asset Manager screens), where clicking a thumbnail has no effect of
   * its own (delete/rename are their own explicit buttons). */
  onPick?: (entry: TEntry, folder: string) => void;
  /** Manager-only affordances — both default false so the two existing page-editor
   * pickers (which pass neither) render byte-identical to their pre-AssetBrowser
   * behavior: no delete/rename buttons appear there. */
  showDelete?: boolean;
  showRename?: boolean;
  /** Gates which entries showDelete/showRename actually apply to — e.g. the project-
   * scope Asset Manager screen restricts mutation to `scope === "project"` entries, since
   * DELETE/rename/move resolve project-then-global server-side and would otherwise be
   * able to silently mutate the shared global copy of a same-named file. Defaults to
   * "every entry" (instance-scope manager: every entry already IS scope "global", there's
   * no other library to accidentally touch). */
  canMutate?: (entry: TEntry) => boolean;
  /** Suppresses EVERY mutating affordance (upload, folder create/delete, move,
   * delete/rename regardless of showDelete/showRename) — browsing only. Used by the
   * project-scope Asset Manager for a viewer/translator who can see the library but
   * (per server/src/lib/auth.ts's requireProjectRole("letterer") on every mutating asset
   * route) can't change it; the instance-scope manager never sets this, since only a
   * system admin can reach it at all. */
  readOnly?: boolean;
  /** Extra class appended to every .image-picker-thumb button — e.g. AssetManagerPanel.tsx
   * uses it to swap fonts' checkerboard (meaningless for a text/glyph preview) for a flat
   * surface. Static rather than per-entry since it's always the same for a given kind. */
  thumbExtraClassName?: string;
  /** Manager-mode only: when provided, AssetBrowser becomes a controlled component for
   * folder navigation — replaces internal folder state entirely, and suppresses the
   * component's own breadcrumb+chips block, since a caller-owned AssetSidebar navigates
   * instead. Never passed by ImagePicker.tsx/SvgBubblePicker.tsx (picker mode keeps its
   * own internal breadcrumb+chips, unaffected by this prop's existence). */
  folder?: string;
}

/**
 * Shared folder-browser/upload/pick/delete/rename widget — the generalized core behind
 * ImagePicker.tsx/SvgBubblePicker.tsx (picker mode, `showDelete`/`showRename` both
 * false, wrapped in their own popover-toggle button) and the project-/instance-scope
 * Asset Manager screens (manager mode, both true). Renders its panel content directly —
 * callers own whatever "is this visible at all" chrome (a popover's `open` state, or
 * just always-mounted inside a manager tab).
 *
 * `foldersEnabled` comes from `assetApi` itself (matches server/src/lib/assetRouter.ts's
 * option of the same name) rather than being a separate prop — fonts' AssetApi object
 * already reports `foldersEnabled: false`, so passing the wrong asset API in is the only
 * way to get this wrong, not an extra prop to keep in sync.
 */
export function AssetBrowser<TEntry extends { fileName: string; url: string; scope: AssetScope }>({
  assetApi,
  renderThumb,
  uploadAccept,
  uploadLabel,
  uploadingLabel,
  emptyLabel,
  onPick,
  showDelete = false,
  showRename = false,
  canMutate = () => true,
  readOnly = false,
  thumbExtraClassName = "",
  folder: controlledFolder,
}: Props<TEntry>) {
  const { t } = useTranslation();
  const effectiveShowDelete = showDelete && !readOnly;
  const effectiveShowRename = showRename && !readOnly;
  const [internalFolder, setInternalFolder] = useState("");
  const folder = controlledFolder ?? internalFolder;
  const [listing, setListing] = useState<AssetListing<TEntry> | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [newFolderName, setNewFolderName] = useState("");
  const [showNewFolder, setShowNewFolder] = useState(false);
  const [moving, setMoving] = useState<string | null>(null);
  const [moveTargetFolder, setMoveTargetFolder] = useState("");
  const [moveSubfolders, setMoveSubfolders] = useState<string[]>([]);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const fileInput = useRef<HTMLInputElement>(null);
  const foldersEnabled = assetApi.foldersEnabled;

  async function refresh() {
    try {
      setListing(await assetApi.list(folder));
    } catch (err) {
      setError(translateApiError(err, t));
    }
  }

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [folder]);

  useEffect(() => {
    if (moving === null || !foldersEnabled) return;
    assetApi
      .list(moveTargetFolder)
      .then((l) => setMoveSubfolders(l.subfolders))
      .catch((err) => setError(translateApiError(err, t)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [moving, moveTargetFolder]);

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      const result = await assetApi.upload(file, folder);
      await refresh();
      if (onPick) {
        // Picker mode: an upload IS a pick — the caller (ImagePicker/SvgBubblePicker)
        // closes its own popover in response, same as before this component existed.
        // The upload response isn't a full TEntry (no `url`, since nothing needs it
        // immediately after uploading) — callers that only read fileName/width/height
        // off it are fine; this cast is the documented reason why.
        onPick(result as unknown as TEntry, result.folder);
      }
    } catch (err) {
      setError(translateApiError(err, t));
    } finally {
      setUploading(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  }

  function handlePick(entry: TEntry) {
    onPick?.(entry, folder);
  }

  async function handleCreateFolder() {
    const name = newFolderName.trim();
    if (!name) return;
    try {
      await assetApi.createFolder(joinFolder(folder, name));
      setNewFolderName("");
      setShowNewFolder(false);
      await refresh();
    } catch (err) {
      setError(translateApiError(err, t));
    }
  }

  async function handleDeleteFolder(name: string) {
    if (!window.confirm(t("editor.assetFolders.deleteFolderConfirm", { folder: name }))) return;
    try {
      await assetApi.deleteFolder(joinFolder(folder, name));
      await refresh();
    } catch (err) {
      setError(translateApiError(err, t));
    }
  }

  async function confirmMove() {
    if (moving === null) return;
    try {
      await assetApi.move(moving, folder, moveTargetFolder);
      setMoving(null);
      await refresh();
    } catch (err) {
      setError(translateApiError(err, t));
    }
  }

  async function handleDeleteFile(fileName: string) {
    if (!window.confirm(t("editor.assetFolders.deleteFileConfirm", { fileName }))) return;
    try {
      await assetApi.remove(fileName, folder);
      await refresh();
    } catch (err) {
      setError(translateApiError(err, t));
    }
  }

  function startRename(fileName: string) {
    setRenaming(fileName);
    setRenameValue(fileName);
  }

  async function confirmRename() {
    if (renaming === null) return;
    const newFileName = renameValue.trim();
    if (!newFileName || newFileName === renaming) {
      setRenaming(null);
      return;
    }
    try {
      await assetApi.rename(renaming, newFileName, folder);
      setRenaming(null);
      await refresh();
    } catch (err) {
      setError(translateApiError(err, t));
    }
  }

  if (moving !== null) {
    return (
      <div className="asset-browser-panel">
        <p className="report-heading" style={{ margin: "4px 0" }}>
          {t("editor.assetFolders.moveTitle", { fileName: moving })}
        </p>
        <div className="asset-folder-breadcrumb">
          {folderBreadcrumb(moveTargetFolder, t("editor.assetFolders.rootLabel")).map((crumb, i, arr) => (
            <span key={crumb.path}>
              <button type="button" className="asset-folder-crumb" onClick={() => setMoveTargetFolder(crumb.path)}>
                {crumb.label}
              </button>
              {i < arr.length - 1 && " / "}
            </span>
          ))}
        </div>
        <div className="asset-folder-chips">
          {moveSubfolders.map((name) => (
            <button key={name} type="button" className="asset-folder-chip" onClick={() => setMoveTargetFolder(joinFolder(moveTargetFolder, name))}>
              📁 {name}
            </button>
          ))}
        </div>
        <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
          <button type="button" className="primary" onClick={confirmMove}>
            {t("editor.assetFolders.moveHere")}
          </button>
          <button type="button" onClick={() => setMoving(null)}>
            {t("common.cancel")}
          </button>
        </div>
        {error && <div className="language-manager-error">{error}</div>}
      </div>
    );
  }

  return (
    <div className="asset-browser-panel">
      {foldersEnabled && controlledFolder === undefined && (
        <>
          <div className="asset-folder-breadcrumb">
            {folderBreadcrumb(folder, t("editor.assetFolders.rootLabel")).map((crumb, i, arr) => (
              <span key={crumb.path}>
                <button type="button" className="asset-folder-crumb" onClick={() => setInternalFolder(crumb.path)}>
                  {crumb.label}
                </button>
                {i < arr.length - 1 && " / "}
              </span>
            ))}
          </div>
          <div className="asset-folder-chips">
            {listing?.subfolders.map((name) => (
              <span key={name} className="asset-folder-chip-wrap">
                <button type="button" className="asset-folder-chip" onClick={() => setInternalFolder(joinFolder(folder, name))}>
                  📁 {name}
                </button>
                {!readOnly && (
                  <button
                    type="button"
                    className="asset-folder-chip-delete"
                    title={t("editor.assetFolders.deleteFolder")}
                    onClick={() => handleDeleteFolder(name)}
                  >
                    ×
                  </button>
                )}
              </span>
            ))}
            {!readOnly &&
              (showNewFolder ? (
                <span className="asset-folder-chip-wrap">
                  <input
                    autoFocus
                    value={newFolderName}
                    placeholder={t("editor.assetFolders.newFolderPlaceholder")}
                    onChange={(e) => setNewFolderName(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleCreateFolder()}
                    style={{ width: 110 }}
                  />
                  <button type="button" onClick={handleCreateFolder}>
                    {t("editor.assetFolders.createFolder")}
                  </button>
                </span>
              ) : (
                <button type="button" className="asset-folder-chip" onClick={() => setShowNewFolder(true)}>
                  {t("editor.assetFolders.newFolderButton")}
                </button>
              ))}
          </div>
        </>
      )}

      {(["project", "global"] as const).map((scope) => {
        const scoped = (listing?.files ?? []).filter((entry) => entry.scope === scope);
        if (scoped.length === 0) return null;
        return (
          <div key={scope}>
            <p className="report-heading" style={{ margin: "4px 0" }}>
              {scope === "project" ? t("common.scopeProject") : t("common.scopeShared")}
            </p>
            <div className={`image-picker-grid${effectiveShowDelete || effectiveShowRename ? " image-picker-grid--manager" : ""}`}>
              {scoped.map((entry) => {
                const mutable = (effectiveShowDelete || effectiveShowRename) && canMutate(entry);
                return (
                  <div key={entry.fileName} className="image-picker-thumb-wrap">
                    {renaming === entry.fileName ? (
                      <div className="asset-browser-rename">
                        <input
                          autoFocus
                          value={renameValue}
                          onChange={(e) => setRenameValue(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") confirmRename();
                            if (e.key === "Escape") setRenaming(null);
                          }}
                        />
                        <button type="button" onClick={confirmRename} title={t("common.save")}>
                          ✓
                        </button>
                        <button type="button" onClick={() => setRenaming(null)} title={t("common.cancel")}>
                          ×
                        </button>
                      </div>
                    ) : (
                      <button
                        className={`image-picker-thumb${thumbExtraClassName ? ` ${thumbExtraClassName}` : ""}`}
                        onClick={() => (onPick ? handlePick(entry) : undefined)}
                        title={entry.fileName}
                        style={onPick ? undefined : { cursor: "default" }}
                      >
                        {renderThumb(entry)}
                      </button>
                    )}
                    {(effectiveShowDelete || effectiveShowRename) && renaming !== entry.fileName && (
                      <p className="asset-browser-filename" title={entry.fileName}>
                        {entry.fileName}
                      </p>
                    )}
                    {foldersEnabled && !readOnly && (onPick || effectiveShowDelete || effectiveShowRename) && renaming !== entry.fileName && (
                      <button
                        type="button"
                        className="image-picker-move-btn"
                        title={t("editor.assetFolders.moveAction")}
                        onClick={(e) => {
                          e.stopPropagation();
                          setMoving(entry.fileName);
                          setMoveTargetFolder(folder);
                        }}
                      >
                        ⇒
                      </button>
                    )}
                    {mutable && effectiveShowRename && renaming !== entry.fileName && (
                      <button
                        type="button"
                        className="asset-browser-rename-btn"
                        title={t("editor.assetFolders.renameAction")}
                        onClick={() => startRename(entry.fileName)}
                      >
                        <PencilIcon />
                      </button>
                    )}
                    {mutable && effectiveShowDelete && renaming !== entry.fileName && (
                      <button
                        type="button"
                        className="asset-browser-delete-btn"
                        title={t("editor.assetFolders.deleteFileAction")}
                        onClick={() => handleDeleteFile(entry.fileName)}
                      >
                        <TrashIcon />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
      {listing?.files.length === 0 && (!foldersEnabled || listing.subfolders.length === 0) && <p className="hint">{emptyLabel}</p>}
      {!readOnly && (
        <label className="image-picker-upload">
          {uploading ? uploadingLabel : uploadLabel}
          <input ref={fileInput} type="file" accept={uploadAccept} onChange={handleUpload} disabled={uploading} style={{ display: "none" }} />
        </label>
      )}
      {error && <div className="language-manager-error">{error}</div>}
    </div>
  );
}
