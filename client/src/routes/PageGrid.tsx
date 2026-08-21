import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import type { LanguageDef } from "../../../shared/src/languages";
import type { Character } from "../../../shared/src/characters";
import type { GlossaryEntry } from "../../../shared/src/glossary";
import type { LetteringPreset } from "../../../shared/src/presets";
import { api, downloadBlob, type PageSummary } from "../api/client";
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
    api.listPages(volumeId).then(setPages).catch((e) => setError(e.message));
  }, [volumeId]);

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
      setMessage(`Fehler: ${(e as Error).message}`);
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
          ? ` – übersprungen: ${result.skipped.map((s) => `${s.file} (${s.reason})`).join(", ")}`
          : "";
      setMessage(`${result.imported.length} Layout(s) importiert${skippedText}`);
    } catch (e) {
      setMessage(`Fehler: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  if (error) return <div className="error-banner">{error}</div>;
  if (!pages) return <p>Lade Seiten…</p>;

  const menuGroups: MenuGroup[] = [
    {
      key: "seite",
      label: "Seite",
      entries: [
        { type: "sublabel", label: "Import" },
        { type: "action", label: "JSONs (ZIP)", onClick: () => importInputRef.current?.click(), disabled: busy },
        { type: "separator" },
        { type: "sublabel", label: "Export" },
        { type: "action", label: "Bild…", onClick: () => setShowExportPanel(true), disabled: languages.length === 0 },
        { type: "action", label: "Alle JSONs (ZIP)", onClick: handleExportZip, disabled: busy },
        { type: "separator" },
        { type: "action", label: "Bericht für den Band", onClick: () => setShowVolumeReport(true) },
        { type: "separator" },
        { type: "action", label: "Zurück zu Bänden", onClick: () => navigate("/") },
      ],
    },
    {
      key: "projekt",
      label: "Projekt",
      entries: [
        { type: "action", label: "Wechseln", onClick: () => navigate("/project") },
        { type: "action", label: "Charaktere", onClick: () => setShowCharacters(true) },
        { type: "action", label: "Glossar", onClick: () => setShowGlossary(true) },
        { type: "action", label: "Presets", onClick: () => setShowPresets(true) },
        { type: "action", label: "Einstellungen", onClick: () => setShowSettings(true) },
      ],
    },
    {
      key: "hilfe",
      label: "Hilfe",
      entries: [{ type: "action", label: "Noch keine Einträge", onClick: () => {}, disabled: true }],
    },
  ];

  return (
    <div className="page">
      <MenuBar groups={menuGroups} />
      <input ref={importInputRef} type="file" accept=".zip,application/zip" onChange={handleImportZipFile} style={{ display: "none" }} />
      <div className="canvas-titlebar">
        <span className="canvas-titlebar-name">Seiten</span>
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
          <VolumeReportModal volumeId={volumeId} characters={characters} onClose={() => setShowVolumeReport(false)} />
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
        <span>{pages.length} Seite{pages.length === 1 ? "" : "n"}</span>
      </div>
    </div>
  );
}
