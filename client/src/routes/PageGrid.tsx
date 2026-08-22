import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import type { LanguageDef } from "../../../shared/src/languages";
import type { Character } from "../../../shared/src/characters";
import type { GlossaryEntry } from "../../../shared/src/glossary";
import type { LetteringPreset } from "../../../shared/src/presets";
import { api, downloadBlob, type PageSummary } from "../api/client";
import { translateApiError } from "../i18n/translateApiError";
import { useExportRun } from "../export/useExportRun";
import { ExportPanel } from "../editor/ExportPanel";
import { Modal } from "../editor/Modal";
import { MenuBar } from "../editor/MenuBar";
import type { MenuGroup } from "../editor/MenuBar";
import { SettingsForm } from "../editor/SettingsForm";
import { CharacterManager } from "../editor/CharacterManager";
import { GlossaryManager } from "../editor/GlossaryManager";
import { PresetManager } from "../editor/PresetManager";
import { VolumeReportModal } from "../editor/VolumeReportModal";
import { useProject } from "../state/ProjectContext";

export function PageGrid() {
  const { t } = useTranslation();
  const { volumeId = "" } = useParams();
  const navigate = useNavigate();
  const { project } = useProject();
  const [pages, setPages] = useState<PageSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [languages, setLanguages] = useState<LanguageDef[]>([]);
  const [characters, setCharacters] = useState<Character[]>([]);
  const [glossary, setGlossary] = useState<GlossaryEntry[]>([]);
  const [presets, setPresets] = useState<LetteringPreset[]>([]);
  const [showExportPanel, setShowExportPanel] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showCharacters, setShowCharacters] = useState(false);
  const [showGlossary, setShowGlossary] = useState(false);
  const [showPresets, setShowPresets] = useState(false);
  const [showVolumeReport, setShowVolumeReport] = useState(false);
  const importInputRef = useRef<HTMLInputElement>(null);
  const { exporting, exportMsg, runExport } = useExportRun(volumeId, languages);

  useEffect(() => {
    setPages(null);
    api.listPages(volumeId).then(setPages).catch((e) => setError(translateApiError(e, t)));
  }, [volumeId, t]);

  useEffect(() => {
    api.listLanguages().then(setLanguages);
  }, []);

  useEffect(() => {
    api.listCharacters().then(setCharacters);
  }, []);

  useEffect(() => {
    api.listGlossary().then(setGlossary);
  }, []);

  useEffect(() => {
    api.listPresets().then(setPresets);
  }, []);

  async function handleExportZip() {
    setBusy(true);
    setMessage(null);
    try {
      const blob = await api.exportLayoutsZip(volumeId);
      downloadBlob(blob, `${volumeId.split("/").pop()}_lettering.zip`);
    } catch (e) {
      setMessage(t("pageGrid.importErrorPrefix", { message: translateApiError(e, t) }));
    } finally {
      setBusy(false);
    }
  }

  async function handleImportZipFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setBusy(true);
    setMessage(null);
    try {
      const result = await api.importLayoutsZip(volumeId, file);
      const skippedText =
        result.skipped.length > 0
          ? t("pageGrid.skippedPrefix", {
              list: result.skipped.map((s) => `${s.file} (${t(`errors.${s.reason}`)})`).join(", "),
            })
          : "";
      setMessage(t("pageGrid.importedMsg", { count: result.imported.length, skippedText }));
    } catch (e) {
      setMessage(t("pageGrid.importErrorPrefix", { message: translateApiError(e, t) }));
    } finally {
      setBusy(false);
    }
  }

  if (error) return <div className="error-banner">{error}</div>;
  if (!pages) return <p>{t("pageGrid.loading")}</p>;

  const menuGroups: MenuGroup[] = [
    {
      key: "seite",
      label: t("pageGrid.menuPageLabel"),
      entries: [
        { type: "sublabel", label: t("pageGrid.menuImportLabel") },
        { type: "action", label: t("pageGrid.menuImportZip"), onClick: () => importInputRef.current?.click(), disabled: busy },
        { type: "separator" },
        { type: "sublabel", label: t("pageGrid.menuExportLabel") },
        { type: "action", label: t("pageGrid.menuExportImage"), onClick: () => setShowExportPanel(true), disabled: languages.length === 0 },
        { type: "action", label: t("pageGrid.menuExportAllZip"), onClick: handleExportZip, disabled: busy },
        { type: "separator" },
        { type: "action", label: t("pageGrid.menuVolumeReport"), onClick: () => setShowVolumeReport(true) },
        { type: "separator" },
        { type: "action", label: t("pageGrid.menuBackToVolumes"), onClick: () => navigate("/") },
      ],
    },
    {
      key: "projekt",
      label: t("menu.project"),
      entries: [
        { type: "action", label: t("menu.switch"), onClick: () => navigate("/project") },
        { type: "action", label: t("managers.characters.title"), onClick: () => setShowCharacters(true) },
        { type: "action", label: t("managers.glossary.title"), onClick: () => setShowGlossary(true) },
        { type: "action", label: t("managers.presets.title"), onClick: () => setShowPresets(true) },
        { type: "action", label: t("script.menuEntry"), onClick: () => navigate(`/volumes/${encodeURIComponent(volumeId)}/script`) },
        { type: "action", label: t("appShell.settings"), onClick: () => setShowSettings(true) },
      ],
    },
    {
      key: "hilfe",
      label: t("menu.help"),
      entries: [{ type: "action", label: t("menu.noEntriesYet"), onClick: () => {}, disabled: true }],
    },
  ];

  return (
    <div className="page">
      <MenuBar groups={menuGroups} />
      <input ref={importInputRef} type="file" accept=".zip,application/zip" onChange={handleImportZipFile} style={{ display: "none" }} />
      <div className="canvas-titlebar">
        <span className="canvas-titlebar-name">{t("pageGrid.titlebarPages")}</span>
        <span className="canvas-titlebar-path">/{project ? `${project.name}/${volumeId}` : volumeId}</span>
      </div>
      {(message || exportMsg) && (
        <div
          className="error-banner"
          style={{ background: "#1f3a2a", borderColor: "#2f7a48", color: "#b3ffc0", margin: "10px 12px 0" }}
        >
          {message ?? exportMsg}
        </div>
      )}
      {showExportPanel && (
        <Modal onClose={() => setShowExportPanel(false)}>
          <ExportPanel
            languages={languages}
            exporting={exporting}
            onExport={(selection, onlyTranslated, languageFilter) => runExport(selection, onlyTranslated, languageFilter, null)}
            onClose={() => setShowExportPanel(false)}
          />
        </Modal>
      )}
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
      {showVolumeReport && (
        <Modal onClose={() => setShowVolumeReport(false)}>
          <VolumeReportModal
            volumeId={volumeId}
            characters={characters}
            readingDirection={project?.readingDirection ?? "rtl"}
            onClose={() => setShowVolumeReport(false)}
          />
        </Modal>
      )}
      <div className="page-scroll" style={{ padding: 16 }}>
        <div className="card-grid">
          {pages.map((p) => (
            <Link
              key={p.page}
              to={`/volumes/${encodeURIComponent(volumeId)}/pages/${encodeURIComponent(p.page)}`}
              className="card"
            >
              <img src={api.pageThumbnailUrl(volumeId, p.page)} alt={p.page} loading="lazy" />
              <div className="label">{p.page}</div>
            </Link>
          ))}
        </div>
      </div>
      <div className="canvas-statusbar">
        <span>{t("pageGrid.pagesCount", { count: pages.length })}</span>
      </div>
    </div>
  );
}
