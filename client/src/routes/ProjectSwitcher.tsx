import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import type { Character } from "../../../shared/src/characters";
import type { GlossaryEntry } from "../../../shared/src/glossary";
import type { LetteringPreset } from "../../../shared/src/presets";
import type { LanguageDef } from "../../../shared/src/languages";
import { api, type RecentProject } from "../api/client";
import { translateApiError } from "../i18n/translateApiError";
import { useProject } from "../state/ProjectContext";
import { FileBrowserModal } from "../editor/FileBrowserModal";
import { invalidateFontsCache } from "../editor/fontLoader";
import { MenuBar } from "../editor/MenuBar";
import type { MenuEntry, MenuGroup } from "../editor/MenuBar";
import { Modal } from "../editor/Modal";
import { SettingsForm } from "../editor/SettingsForm";
import { CharacterManager } from "../editor/CharacterManager";
import { GlossaryManager } from "../editor/GlossaryManager";
import { PresetManager } from "../editor/PresetManager";

type BrowserTarget = "openPath" | null;

/** "Datei öffnen"-artiger Projektwechsler: zeigt zuletzt geöffnete Projekte, erlaubt
 * das Öffnen einer Projektdatei per Pfad, und das Anlegen eines neuen Projekts. Trägt
 * die gleiche MenuBar wie VolumeList/PageGrid/Editor (Konsistenz-Fix — diese Route war
 * die einzige mit eigenem Menü-Slot, aber ohne tatsächliche Menüleiste) — die
 * projektbezogenen Einträge (Charaktere/Glossar/Presets/Einstellungen) beziehen sich
 * auf das gerade noch aktive Projekt (falls vorhanden), nicht auf das Ziel des
 * Wechsels, und werden daher nur angezeigt, solange eins offen ist. */
export function ProjectSwitcher() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { project } = useProject();
  const [recent, setRecent] = useState<RecentProject[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [browserTarget, setBrowserTarget] = useState<BrowserTarget>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [showCharacters, setShowCharacters] = useState(false);
  const [showGlossary, setShowGlossary] = useState(false);
  const [showPresets, setShowPresets] = useState(false);
  const [characters, setCharacters] = useState<Character[]>([]);
  const [glossary, setGlossary] = useState<GlossaryEntry[]>([]);
  const [presets, setPresets] = useState<LetteringPreset[]>([]);
  const [languages, setLanguages] = useState<LanguageDef[]>([]);

  const [archived, setArchived] = useState<RecentProject[] | null>(null);
  const [openPath, setOpenPath] = useState("");

  function refreshRecent() {
    return api.listRecentProjects().then(setRecent).catch((e) => setError(translateApiError(e, t)));
  }

  function refreshArchived() {
    return api.listArchivedProjects().then(setArchived).catch((e) => setError(translateApiError(e, t)));
  }

  useEffect(() => {
    refreshRecent();
    refreshArchived();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [t]);

  // Only meaningful while a project is still active (see the project-menu entries
  // below) — harmless no-ops otherwise since nothing renders the modals that would
  // consume them.
  useEffect(() => {
    if (!project) return;
    api.listCharacters().then(setCharacters);
    api.listGlossary().then(setGlossary);
    api.listPresets().then(setPresets);
    api.listLanguages().then(setLanguages);
  }, [project]);

  const menuGroups: MenuGroup[] = [
    {
      key: "projekt",
      label: t("menu.project"),
      entries: [
        { type: "action", label: t("menu.newProject"), onClick: () => navigate("/project/new") },
        ...(project
          ? ([
              { type: "separator" },
              { type: "action", label: t("managers.characters.title"), onClick: () => setShowCharacters(true) },
              { type: "action", label: t("managers.glossary.title"), onClick: () => setShowGlossary(true) },
              { type: "action", label: t("managers.presets.title"), onClick: () => setShowPresets(true) },
              { type: "action", label: t("appShell.settings"), onClick: () => setShowSettings(true) },
            ] satisfies MenuEntry[])
          : []),
      ],
    },
    {
      key: "hilfe",
      label: t("menu.help"),
      entries: [{ type: "action", label: t("menu.noEntriesYet"), onClick: () => {}, disabled: true }],
    },
  ];

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

  function handleBrowserSelect(selectedPath: string) {
    setBrowserTarget(null);
    handleOpen(selectedPath); // "Projektdatei direkt aufrufen" — no extra click needed
  }

  async function handleArchive(filePath: string) {
    setBusy(true);
    setError(null);
    try {
      await api.archiveProject(filePath);
      await Promise.all([refreshRecent(), refreshArchived()]);
    } catch (e) {
      setError(translateApiError(e, t));
    } finally {
      setBusy(false);
    }
  }

  async function handleUnarchive(filePath: string) {
    setBusy(true);
    setError(null);
    try {
      await api.unarchiveProject(filePath);
      await Promise.all([refreshRecent(), refreshArchived()]);
    } catch (e) {
      setError(translateApiError(e, t));
    } finally {
      setBusy(false);
    }
  }

  /** From the main (non-archived) list: first removes the entry from the overview,
   * then — only on request, as a clearly separate follow-up question — offers to also
   * delete the underlying project file from disk. The scan-root folder of scanned
   * pages/artwork is never touched by either step. */
  async function handleRemove(filePath: string) {
    if (!confirm(t("projectSwitcher.confirmRemove"))) return;
    setBusy(true);
    setError(null);
    try {
      await api.removeRecentProject(filePath);
      await refreshRecent();
    } catch (e) {
      setError(translateApiError(e, t));
      setBusy(false);
      return;
    }
    setBusy(false);
    if (confirm(t("projectSwitcher.confirmDeleteFile"))) {
      await handleDeleteFile(filePath, { alreadyRemovedFromRecent: true });
    }
  }

  /** Permanently deletes the project's own JSON file from disk (never the scan-root
   * images it points at) — used both as the archived list's "delete for good" action
   * and as handleRemove's optional follow-up. */
  async function handleDeleteFile(filePath: string, opts?: { alreadyRemovedFromRecent?: boolean }) {
    if (!opts?.alreadyRemovedFromRecent && !confirm(t("projectSwitcher.confirmDeleteFile"))) return;
    setBusy(true);
    setError(null);
    try {
      await api.deleteProjectFile(filePath);
      await Promise.all([refreshRecent(), refreshArchived()]);
    } catch (e) {
      setError(translateApiError(e, t));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="page">
      <MenuBar groups={menuGroups} />
      {showSettings && (
        <Modal onClose={() => setShowSettings(false)}>
          <SettingsForm onClose={() => setShowSettings(false)} />
        </Modal>
      )}
      {showCharacters && (
        <Modal onClose={() => setShowCharacters(false)}>
          <CharacterManager characters={characters} onChange={setCharacters} onClose={() => setShowCharacters(false)} />
        </Modal>
      )}
      {showGlossary && (
        <Modal onClose={() => setShowGlossary(false)}>
          <GlossaryManager glossary={glossary} languages={languages} onChange={setGlossary} onClose={() => setShowGlossary(false)} />
        </Modal>
      )}
      {showPresets && (
        <Modal onClose={() => setShowPresets(false)}>
          <PresetManager presets={presets} onChange={setPresets} onClose={() => setShowPresets(false)} />
        </Modal>
      )}
      <div className="page-scroll" style={{ padding: 20 }}>
        <p style={{ margin: "0 0 12px", fontWeight: 600, fontSize: 16 }}>{t("projectSwitcher.heading")}</p>
        {error && <div className="error-banner">{error}</div>}

        {recent === null ? (
          <p style={{ color: "var(--text-muted)" }}>{t("projectSwitcher.loadingRecent")}</p>
        ) : recent.length === 0 ? (
          <p style={{ color: "var(--text-muted)" }}>{t("projectSwitcher.noneYet")}</p>
        ) : (
          <div className="card-grid" style={{ marginBottom: 24 }}>
            {recent.map((p) => {
              const isActive = project?.filePath === p.filePath;
              return (
                <div key={p.filePath} className={`card project-card${isActive ? " project-card-active" : ""}`}>
                  <button
                    type="button"
                    className="project-card-open"
                    onClick={() => handleOpen(p.filePath)}
                    disabled={busy}
                    title={isActive ? t("projectSwitcher.currentlyOpen") : undefined}
                  >
                    <div className="label" style={{ fontSize: 16, color: "var(--text)" }}>
                      {p.name ?? t("projectSwitcher.fileNotFound")}
                      {isActive && <span className="project-card-active-badge">{t("projectSwitcher.currentlyOpen")}</span>}
                    </div>
                    <div className="label">{p.filePath}</div>
                  </button>
                  <div className="project-card-actions">
                    <button type="button" onClick={() => handleArchive(p.filePath)} disabled={busy || isActive} title={t("projectSwitcher.archiveButton")}>
                      {t("projectSwitcher.archiveButton")}
                    </button>
                    <button type="button" onClick={() => handleRemove(p.filePath)} disabled={busy || isActive} title={t("projectSwitcher.removeButton")}>
                      {t("projectSwitcher.removeButton")}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {archived !== null && archived.length > 0 && (
          <div style={{ marginBottom: 24 }}>
            <p style={{ margin: "0 0 8px", fontWeight: 600, fontSize: 14, color: "var(--text-muted)" }}>
              {t("projectSwitcher.archivedHeading")}
            </p>
            <div className="card-grid">
              {archived.map((p) => (
                <div key={p.filePath} className="card project-card">
                  <div className="label" style={{ fontSize: 16, color: "var(--text)" }}>
                    {p.name ?? t("projectSwitcher.fileNotFound")}
                  </div>
                  <div className="label">{p.filePath}</div>
                  <div className="project-card-actions">
                    <button type="button" onClick={() => handleUnarchive(p.filePath)} disabled={busy} title={t("projectSwitcher.unarchiveButton")}>
                      {t("projectSwitcher.unarchiveButton")}
                    </button>
                    <button type="button" onClick={() => handleDeleteFile(p.filePath)} disabled={busy} title={t("projectSwitcher.removeButton")}>
                      {t("projectSwitcher.removeButton")}
                    </button>
                  </div>
                </div>
              ))}
            </div>
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

          <div className="inspector" style={{ maxWidth: 420, justifyContent: "center" }}>
            <p style={{ margin: 0, fontWeight: 600 }}>{t("projectSwitcher.newProjectHeading")}</p>
            <button type="button" className="primary" onClick={() => navigate("/project/new")}>
              {t("projectSwitcher.createButton")}
            </button>
          </div>
        </div>
      </div>

      {browserTarget && <FileBrowserModal mode="file" onSelect={handleBrowserSelect} onClose={() => setBrowserTarget(null)} />}
    </div>
  );
}
