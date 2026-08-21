import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import type { Character } from "../../../shared/src/characters";
import type { GlossaryEntry } from "../../../shared/src/glossary";
import type { LetteringPreset } from "../../../shared/src/presets";
import type { LanguageDef } from "../../../shared/src/languages";
import { api, type VolumeSummary } from "../api/client";
import { useProject } from "../state/ProjectContext";
import { MenuBar } from "../editor/MenuBar";
import type { MenuGroup } from "../editor/MenuBar";
import { Modal } from "../editor/Modal";
import { SettingsForm } from "../editor/SettingsForm";
import { CharacterManager } from "../editor/CharacterManager";
import { GlossaryManager } from "../editor/GlossaryManager";
import { PresetManager } from "../editor/PresetManager";

export function VolumeList() {
  const { project } = useProject();
  const navigate = useNavigate();
  const [volumes, setVolumes] = useState<VolumeSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [emptySuffix, setEmptySuffix] = useState("_empty");
  const [scanRoot, setScanRoot] = useState("");
  const [showSettings, setShowSettings] = useState(false);
  const [showCharacters, setShowCharacters] = useState(false);
  const [showGlossary, setShowGlossary] = useState(false);
  const [showPresets, setShowPresets] = useState(false);
  const [characters, setCharacters] = useState<Character[]>([]);
  const [glossary, setGlossary] = useState<GlossaryEntry[]>([]);
  const [presets, setPresets] = useState<LetteringPreset[]>([]);
  const [languages, setLanguages] = useState<LanguageDef[]>([]);

  useEffect(() => {
    api.listVolumes().then(setVolumes).catch((e) => setError(e.message));
    api.getSettings().then((s) => {
      setEmptySuffix(s.emptySuffix);
      setScanRoot(s.scanRoot);
    });
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

  useEffect(() => {
    api.listLanguages().then(setLanguages);
  }, []);

  const menuGroups: MenuGroup[] = [
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
      {error ? (
        <div className="error-banner" style={{ margin: 12 }}>
          {error}
        </div>
      ) : !volumes ? (
        <p style={{ margin: 12 }}>Lade Bände…</p>
      ) : volumes.length === 0 ? (
        <p style={{ margin: 12 }}>
          Keine "*{emptySuffix}"-Ordner unter {scanRoot || "…"} gefunden. Über das "Projekt"-Menü lässt sich der
          Ordner anpassen oder ein anderes Projekt öffnen.
        </p>
      ) : (
        <div className="page-scroll" style={{ padding: 16 }}>
          <div className="card-grid">
            {volumes.map((v) => (
              <Link key={v.id} to={`/volumes/${encodeURIComponent(v.id)}`} className="card">
                <div className="label" style={{ fontSize: 16, color: "var(--text)" }}>
                  {v.bookFolderName}
                </div>
                <div className="label">{project ? `${project.name}/${v.id}` : v.id}</div>
                <div className="label">
                  Sprachen: {v.existingLanguageFolders.length > 0 ? v.existingLanguageFolders.join(", ") : "keine"}
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
