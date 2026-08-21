import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Modal } from "./Modal";
import { api, type BrowseEntry } from "../api/client";
import { translateApiError } from "../i18n/translateApiError";

interface Props {
  /** "directory": pick a folder (a "Diesen Ordner wählen" button confirms the
   * current one). "file": clicking a .json file selects it immediately. */
  mode: "directory" | "file";
  startPath?: string;
  onSelect: (path: string) => void;
  onClose: () => void;
}

/** In-app filesystem browser talking to the server's own /api/browse — a real
 * `<input type="file">` can't hand back an absolute path, but this tool already
 * runs locally and trusts arbitrary paths everywhere else, so browsing the
 * server's filesystem directly is the actually-working equivalent. */
export function FileBrowserModal({ mode, startPath, onSelect, onClose }: Props) {
  const { t } = useTranslation();
  const [currentPath, setCurrentPath] = useState<string | null>(startPath ?? null);
  const [parent, setParent] = useState<string | null>(null);
  const [entries, setEntries] = useState<BrowseEntry[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    api
      .browse(currentPath ?? undefined, mode === "file" ? "json" : "directories")
      .then((r) => {
        if (cancelled) return;
        setParent(r.parent);
        setEntries(r.entries);
      })
      .catch((e) => {
        if (!cancelled) setError(translateApiError(e, t));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [currentPath, mode, t]);

  function handleEntryClick(entry: BrowseEntry) {
    if (entry.isDirectory) {
      setCurrentPath(entry.path);
    } else {
      onSelect(entry.path);
    }
  }

  return (
    <Modal onClose={onClose}>
      <div className="inspector" style={{ width: 480, maxWidth: "80vw" }}>
        <p style={{ margin: 0, fontWeight: 600 }}>{mode === "file" ? t("fileBrowser.chooseFile") : t("fileBrowser.chooseFolder")}</p>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <button onClick={() => setCurrentPath(parent)} disabled={!currentPath}>
            {t("fileBrowser.up")}
          </button>
          <span
            style={{
              fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
              fontSize: 12,
              color: "var(--text-muted)",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {currentPath ?? t("fileBrowser.drives")}
          </span>
        </div>
        {error && <div className="error-banner">{error}</div>}
        <div className="text-list" style={{ maxHeight: 320, minHeight: 120 }}>
          {loading ? (
            <p style={{ color: "var(--text-muted)", margin: 0 }}>{t("common.loading")}</p>
          ) : entries.length === 0 ? (
            <p style={{ color: "var(--text-muted)", margin: 0 }}>{t("fileBrowser.empty")}</p>
          ) : (
            entries.map((entry) => (
              <button key={entry.path} className="text-list-row" onClick={() => handleEntryClick(entry)}>
                <span className="text-list-type">{entry.isDirectory ? t("fileBrowser.folder") : t("fileBrowser.file")}</span>
                <span className="text-list-content">{entry.name}</span>
              </button>
            ))
          )}
        </div>
        <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
          {mode === "directory" && (
            <button className="primary" onClick={() => currentPath && onSelect(currentPath)} disabled={!currentPath}>
              {t("fileBrowser.chooseThisFolder")}
            </button>
          )}
          <button onClick={onClose}>{t("common.cancel")}</button>
        </div>
      </div>
    </Modal>
  );
}
