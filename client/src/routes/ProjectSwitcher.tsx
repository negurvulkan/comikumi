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

  const [openPath, setOpenPath] = useState("");

  useEffect(() => {
    api.listRecentProjects().then(setRecent).catch((e) => setError(translateApiError(e, t)));
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
