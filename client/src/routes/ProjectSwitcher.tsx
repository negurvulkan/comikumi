import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { api, type RecentProject } from "../api/client";
import { translateApiError } from "../i18n/translateApiError";
import { FileBrowserModal } from "../editor/FileBrowserModal";
import { invalidateFontsCache } from "../editor/fontLoader";

type BrowserTarget = "openPath" | "scanRoot" | "filePath" | null;

/** "Datei öffnen"-artiger Projektwechsler: zeigt zuletzt geöffnete Projekte, erlaubt
 * das Öffnen einer Projektdatei per Pfad, und das Anlegen eines neuen Projekts. */
export function ProjectSwitcher() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [recent, setRecent] = useState<RecentProject[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [browserTarget, setBrowserTarget] = useState<BrowserTarget>(null);

  const [openPath, setOpenPath] = useState("");

  const [newName, setNewName] = useState("");
  const [newScanRoot, setNewScanRoot] = useState("");
  const [newFilePath, setNewFilePath] = useState("");

  useEffect(() => {
    api.listRecentProjects().then(setRecent).catch((e) => setError(translateApiError(e, t)));
  }, [t]);

  async function handleOpen(filePath: string) {
    setBusy(true);
    setError(null);
    try {
      await api.openProject(filePath);
      invalidateFontsCache();
      navigate("/");
    } catch (e) {
      setError(translateApiError(e, t));
    } finally {
      setBusy(false);
    }
  }

  function handleOpenByPath(e: React.FormEvent) {
    e.preventDefault();
    if (!openPath.trim()) return;
    handleOpen(openPath.trim());
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.createProject({ filePath: newFilePath.trim(), name: newName.trim(), scanRoot: newScanRoot.trim() });
      invalidateFontsCache();
      navigate("/");
    } catch (e) {
      setError(translateApiError(e, t));
    } finally {
      setBusy(false);
    }
  }

  function handleBrowserSelect(selectedPath: string) {
    if (browserTarget === "openPath") {
      setBrowserTarget(null);
      handleOpen(selectedPath); // "Projektdatei direkt aufrufen" — no extra click needed
      return;
    }
    if (browserTarget === "scanRoot") {
      setNewScanRoot(selectedPath);
    } else if (browserTarget === "filePath") {
      setNewFilePath(`${selectedPath}\\projekt.json`);
    }
    setBrowserTarget(null);
  }

  return (
    <div className="page page-padded">
      <div className="page-scroll">
        <p style={{ margin: "0 0 12px", fontWeight: 600, fontSize: 16 }}>{t("projectSwitcher.heading")}</p>
        {error && <div className="error-banner">{error}</div>}

        {recent === null ? (
          <p style={{ color: "var(--text-muted)" }}>{t("projectSwitcher.loadingRecent")}</p>
        ) : recent.length === 0 ? (
          <p style={{ color: "var(--text-muted)" }}>{t("projectSwitcher.noneYet")}</p>
        ) : (
          <div className="card-grid" style={{ marginBottom: 24 }}>
            {recent.map((p) => (
              <button
                key={p.filePath}
                className="card"
                style={{ textAlign: "left", width: "100%" }}
                onClick={() => handleOpen(p.filePath)}
                disabled={busy}
              >
                <div className="label" style={{ fontSize: 16, color: "var(--text)" }}>
                  {p.name ?? t("projectSwitcher.fileNotFound")}
                </div>
                <div className="label">{p.filePath}</div>
              </button>
            ))}
          </div>
        )}

        <div style={{ display: "flex", gap: 24, flexWrap: "wrap" }}>
          <form onSubmit={handleOpenByPath} className="inspector" style={{ maxWidth: 420 }}>
            <p style={{ margin: 0, fontWeight: 600 }}>{t("projectSwitcher.openByPathHeading")}</p>
            <label>
              {t("projectSwitcher.filePathLabel")}
              <div style={{ display: "flex", gap: 6 }}>
                <input
                  style={{ flex: 1 }}
                  value={openPath}
                  onChange={(e) => setOpenPath(e.target.value)}
                  placeholder={t("projectSwitcher.filePathPlaceholder")}
                  required
                />
                <button type="button" onClick={() => setBrowserTarget("openPath")}>
                  {t("common.browse")}
                </button>
              </div>
            </label>
            <button type="submit" className="primary" disabled={busy}>
              {t("projectSwitcher.openButton")}
            </button>
          </form>

          <form onSubmit={handleCreate} className="inspector" style={{ maxWidth: 420 }}>
            <p style={{ margin: 0, fontWeight: 600 }}>{t("projectSwitcher.newProjectHeading")}</p>
            <label>
              {t("managers.characters.nameLabel")}
              <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder={t("projectSwitcher.namePlaceholder")} required />
            </label>
            <label>
              {t("projectSwitcher.scanRootLabel")}
              <div style={{ display: "flex", gap: 6 }}>
                <input
                  style={{ flex: 1 }}
                  value={newScanRoot}
                  onChange={(e) => setNewScanRoot(e.target.value)}
                  placeholder={t("settings.scanRootPlaceholder")}
                  required
                />
                <button type="button" onClick={() => setBrowserTarget("scanRoot")}>
                  {t("common.browse")}
                </button>
              </div>
            </label>
            <label>
              {t("projectSwitcher.saveAsLabel")}
              <div style={{ display: "flex", gap: 6 }}>
                <input
                  style={{ flex: 1 }}
                  value={newFilePath}
                  onChange={(e) => setNewFilePath(e.target.value)}
                  placeholder={t("projectSwitcher.filePathPlaceholder")}
                  required
                />
                <button type="button" onClick={() => setBrowserTarget("filePath")}>
                  {t("common.browse")}
                </button>
              </div>
            </label>
            <button type="submit" className="primary" disabled={busy}>
              {t("projectSwitcher.createButton")}
            </button>
          </form>
        </div>
      </div>

      {browserTarget && (
        <FileBrowserModal
          mode={browserTarget === "openPath" ? "file" : "directory"}
          onSelect={handleBrowserSelect}
          onClose={() => setBrowserTarget(null)}
        />
      )}
    </div>
  );
}
