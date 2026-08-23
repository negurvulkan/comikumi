import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { api, type AssetListing, type BubbleSvgEntry } from "../api/client";
import { translateApiError } from "../i18n/translateApiError";
import { folderBreadcrumb, joinFolder } from "./assetFolders";

interface Props {
  onPick: (fileName: string) => void;
}

/** Popover: pick an already-uploaded SVG bubble contour, or upload a new one — same UI
 * pattern as ImagePicker.tsx, including folder browsing/create/delete/move (see
 * server/src/lib/assetRouter.ts's `foldersEnabled` option) — kept in lockstep with it. */
export function SvgBubblePicker({ onPick }: Props) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [folder, setFolder] = useState("");
  const [listing, setListing] = useState<AssetListing<BubbleSvgEntry> | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [newFolderName, setNewFolderName] = useState("");
  const [showNewFolder, setShowNewFolder] = useState(false);
  const [moving, setMoving] = useState<string | null>(null);
  const [moveTargetFolder, setMoveTargetFolder] = useState("");
  const [moveSubfolders, setMoveSubfolders] = useState<string[]>([]);
  const fileInput = useRef<HTMLInputElement>(null);

  async function refresh() {
    try {
      setListing(await api.listBubbleSvgs(folder));
    } catch (err) {
      setError(translateApiError(err, t));
    }
  }

  useEffect(() => {
    if (open) refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, folder]);

  useEffect(() => {
    if (moving === null) return;
    api
      .listBubbleSvgs(moveTargetFolder)
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
      const result = await api.uploadBubbleSvg(file, folder);
      await refresh();
      onPick(result.fileName);
      setOpen(false);
    } catch (err) {
      setError(translateApiError(err, t));
    } finally {
      setUploading(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  }

  function handlePick(svg: BubbleSvgEntry) {
    // onPick stores the full relative path (see api.bubbleSvgFileUrl()'s contract), not
    // just the leaf name, so the placed reference keeps resolving even from a folder.
    onPick(joinFolder(folder, svg.fileName));
    setOpen(false);
  }

  async function handleCreateFolder() {
    const name = newFolderName.trim();
    if (!name) return;
    try {
      await api.createBubbleSvgFolder(joinFolder(folder, name));
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
      await api.deleteBubbleSvgFolder(joinFolder(folder, name));
      await refresh();
    } catch (err) {
      setError(translateApiError(err, t));
    }
  }

  async function confirmMove() {
    if (moving === null) return;
    try {
      await api.moveBubbleSvg(moving, folder, moveTargetFolder);
      setMoving(null);
      await refresh();
    } catch (err) {
      setError(translateApiError(err, t));
    }
  }

  return (
    <div className="language-manager">
      <button onClick={() => setOpen((o) => !o)} className={open ? "active" : ""} title={t("editor.svgPicker.chooseSvg")}>
        {t("editor.svgPicker.chooseSvgShort")}
      </button>
      {open && (
        <div className="language-manager-panel image-picker-panel">
          {moving !== null ? (
            <>
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
                  <button
                    key={name}
                    type="button"
                    className="asset-folder-chip"
                    onClick={() => setMoveTargetFolder(joinFolder(moveTargetFolder, name))}
                  >
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
            </>
          ) : (
            <>
              <div className="asset-folder-breadcrumb">
                {folderBreadcrumb(folder, t("editor.assetFolders.rootLabel")).map((crumb, i, arr) => (
                  <span key={crumb.path}>
                    <button type="button" className="asset-folder-crumb" onClick={() => setFolder(crumb.path)}>
                      {crumb.label}
                    </button>
                    {i < arr.length - 1 && " / "}
                  </span>
                ))}
              </div>
              <div className="asset-folder-chips">
                {listing?.subfolders.map((name) => (
                  <span key={name} className="asset-folder-chip-wrap">
                    <button type="button" className="asset-folder-chip" onClick={() => setFolder(joinFolder(folder, name))}>
                      📁 {name}
                    </button>
                    <button
                      type="button"
                      className="asset-folder-chip-delete"
                      title={t("editor.assetFolders.deleteFolder")}
                      onClick={() => handleDeleteFolder(name)}
                    >
                      ×
                    </button>
                  </span>
                ))}
                {showNewFolder ? (
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
                )}
              </div>

              {(["project", "global"] as const).map((scope) => {
                const scoped = (listing?.files ?? []).filter((svg) => svg.scope === scope);
                if (scoped.length === 0) return null;
                return (
                  <div key={scope}>
                    <p className="report-heading" style={{ margin: "4px 0" }}>
                      {scope === "project" ? t("common.scopeProject") : t("common.scopeShared")}
                    </p>
                    <div className="image-picker-grid">
                      {scoped.map((svg) => (
                        <div key={svg.fileName} className="image-picker-thumb-wrap">
                          <button className="image-picker-thumb" onClick={() => handlePick(svg)} title={svg.fileName}>
                            <img src={svg.url} alt={svg.fileName} loading="lazy" />
                          </button>
                          <button
                            type="button"
                            className="image-picker-move-btn"
                            title={t("editor.assetFolders.moveAction")}
                            onClick={(e) => {
                              e.stopPropagation();
                              setMoving(svg.fileName);
                              setMoveTargetFolder(folder);
                            }}
                          >
                            ⇒
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
              {listing?.files.length === 0 && listing.subfolders.length === 0 && (
                <p className="hint">{t("editor.svgPicker.empty")}</p>
              )}
              <label className="image-picker-upload">
                {uploading ? t("editor.imagePicker.uploading") : t("editor.svgPicker.uploadNew")}
                <input
                  ref={fileInput}
                  type="file"
                  accept="image/svg+xml,.svg"
                  onChange={handleUpload}
                  disabled={uploading}
                  style={{ display: "none" }}
                />
              </label>
            </>
          )}
          {error && <div className="language-manager-error">{error}</div>}
        </div>
      )}
    </div>
  );
}
