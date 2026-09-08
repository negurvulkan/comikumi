import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { AssetKind } from "./assetKinds";
import { joinFolder } from "./assetFolders";
import { translateApiError } from "../i18n/translateApiError";
import { ChevronRightIcon, TrashIcon } from "./Icons";

/** The subset of an assetLibraries.* object AssetSidebar/AssetTreeFolderNode need —
 * structurally satisfied by every object AssetBrowser.tsx's AssetApiLike already covers
 * (AssetListing<T>'s `subfolders: string[]` is a superset of what `list` needs to return
 * here), kept as its own minimal interface so this file doesn't need AssetBrowser's
 * generic TEntry type parameter at all. */
export interface FolderTreeApi {
  foldersEnabled: boolean;
  list: (folder?: string) => Promise<{ subfolders: string[] }>;
  createFolder: (folder: string) => Promise<void>;
  deleteFolder: (folder: string) => Promise<void>;
}

interface Props {
  api: FolderTreeApi;
  kind: AssetKind;
  /** Full "/"-joined folder path this node represents — "" for a category root. */
  path: string;
  /** Translated kind label at depth 0, else the raw folder segment name. */
  name: string;
  /** 0 = category root (Bilder/SVG-Umrisse/Fonts itself). */
  depth: number;
  activeKind: AssetKind;
  activeFolder: string;
  readOnly: boolean;
  onSelect: (kind: AssetKind, folder: string) => void;
  onError: (message: string) => void;
  /** Only set for depth>0 — lets this node tell its parent to drop it from the parent's
   * own cached children list once deleted (only the parent holds that cache). */
  onDeletedSelf?: () => void;
  /** Only set for depth>0 — where to reroute selection if this node (or an ancestor of
   * the currently active folder) gets deleted while active. */
  parentPath?: string;
}

/** One row of the Asset Manager's left directory-tree sidebar — simultaneously a
 * "category root" (depth 0, path "") and a "subfolder node" (depth>0), recursing into
 * its own children once expanded. Mirrors a typical file-explorer tree: a chevron
 * expands/collapses (lazy-fetched via the same assetApi.list() AssetBrowser itself uses,
 * cached per node so re-expanding a previously-opened branch never re-fetches), while
 * clicking the label just selects — it never also toggles expansion. */
export function AssetTreeFolderNode({ api, kind, path, name, depth, activeKind, activeFolder, readOnly, onSelect, onError, onDeletedSelf, parentPath }: Props) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);
  const [children, setChildren] = useState<string[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [showNewFolder, setShowNewFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");

  const foldersEnabled = api.foldersEnabled;
  const isActive = activeKind === kind && activeFolder === path;

  async function fetchChildren(): Promise<string[]> {
    setLoading(true);
    try {
      const listing = await api.list(path);
      setChildren(listing.subfolders);
      return listing.subfolders;
    } catch (err) {
      onError(translateApiError(err, t));
      return children ?? [];
    } finally {
      setLoading(false);
    }
  }

  async function toggleExpand() {
    if (children === null) await fetchChildren();
    setExpanded((e) => !e);
  }

  async function handleCreateFolder() {
    const trimmed = newFolderName.trim();
    if (!trimmed) return;
    try {
      await api.createFolder(joinFolder(path, trimmed));
      setNewFolderName("");
      setShowNewFolder(false);
      await fetchChildren();
      setExpanded(true);
    } catch (err) {
      onError(translateApiError(err, t));
    }
  }

  async function handleDelete() {
    if (!window.confirm(t("editor.assetFolders.deleteFolderConfirm", { folder: name }))) return;
    try {
      await api.deleteFolder(path);
      onDeletedSelf?.();
      if (activeKind === kind && (activeFolder === path || activeFolder.startsWith(`${path}/`)) && parentPath !== undefined) {
        onSelect(kind, parentPath);
      }
    } catch (err) {
      onError(translateApiError(err, t));
    }
  }

  return (
    <div>
      <div className="asset-tree-row" style={{ paddingLeft: 8 + depth * 16 }}>
        {foldersEnabled ? (
          <button
            type="button"
            className={`asset-tree-chevron${expanded ? " asset-tree-chevron--expanded" : ""}`}
            onClick={toggleExpand}
            aria-label={t(expanded ? "editor.layersPanel.collapse" : "editor.layersPanel.expand")}
          >
            <ChevronRightIcon />
          </button>
        ) : (
          <span className="asset-tree-chevron-spacer" />
        )}
        <button
          type="button"
          className={`asset-tree-label${isActive ? " asset-tree-label--active" : ""}`}
          onClick={() => onSelect(kind, path)}
          title={name}
        >
          {depth === 0 ? name : `📁 ${name}`}
        </button>
        {!readOnly && foldersEnabled && (
          <button type="button" className="asset-tree-add-btn" title={t("editor.assetFolders.newFolderButton")} onClick={() => setShowNewFolder(true)}>
            +
          </button>
        )}
        {!readOnly && onDeletedSelf && (
          <button type="button" className="asset-tree-delete-btn" title={t("editor.assetFolders.deleteFolder")} onClick={handleDelete}>
            <TrashIcon />
          </button>
        )}
      </div>
      {showNewFolder && (
        <div className="asset-tree-row asset-tree-new-folder" style={{ paddingLeft: 8 + (depth + 1) * 16 }}>
          <input
            autoFocus
            value={newFolderName}
            placeholder={t("editor.assetFolders.newFolderPlaceholder")}
            onChange={(e) => setNewFolderName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleCreateFolder();
              if (e.key === "Escape") setShowNewFolder(false);
            }}
          />
          <button type="button" onClick={handleCreateFolder}>
            {t("editor.assetFolders.createFolder")}
          </button>
        </div>
      )}
      {expanded && loading && <div className="hint" style={{ paddingLeft: 8 + (depth + 1) * 16 }} />}
      {expanded &&
        children?.map((n) => (
          <AssetTreeFolderNode
            key={n}
            api={api}
            kind={kind}
            path={joinFolder(path, n)}
            name={n}
            depth={depth + 1}
            activeKind={activeKind}
            activeFolder={activeFolder}
            readOnly={readOnly}
            onSelect={onSelect}
            onError={onError}
            parentPath={path}
            onDeletedSelf={() => setChildren((prev) => prev?.filter((x) => x !== n) ?? prev)}
          />
        ))}
    </div>
  );
}
