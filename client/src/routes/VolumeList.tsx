import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import type { Character } from "../../../shared/src/characters";
import type { GlossaryEntry } from "../../../shared/src/glossary";
import type { LetteringPreset } from "../../../shared/src/presets";
import type { LanguageDef } from "../../../shared/src/languages";
import { api, type VolumeSummary } from "../api/client";
import { translateApiError } from "../i18n/translateApiError";
import { useProject } from "../state/ProjectContext";
import { useProjectRole } from "../state/useProjectRole";
import { MenuBar } from "../editor/MenuBar";
import type { MenuGroup } from "../editor/MenuBar";
import { Modal } from "../editor/Modal";
import { SettingsForm } from "../editor/SettingsForm";
import { CharacterManager } from "../editor/CharacterManager";
import { GlossaryManager } from "../editor/GlossaryManager";
import { PresetManager } from "../editor/PresetManager";
import { MemberManager } from "../editor/MemberManager";
import { UserManager } from "../editor/UserManager";
import { ProjectInfoSidebar } from "../editor/ProjectInfoSidebar";
import { PageIcon, PanelToolIcon, BubbleToolIcon } from "../editor/Icons";

export function VolumeList() {
  const { t } = useTranslation();
  const { project } = useProject();
  const { hasAtLeast, myRole } = useProjectRole();
  const navigate = useNavigate();
  const [volumes, setVolumes] = useState<VolumeSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [emptySuffix, setEmptySuffix] = useState("_empty");
  const [scanRoot, setScanRoot] = useState("");
  const [description, setDescription] = useState("");
  const [coverImagePath, setCoverImagePath] = useState("");
  const [showSettings, setShowSettings] = useState(false);
  const [showCharacters, setShowCharacters] = useState(false);
  const [showGlossary, setShowGlossary] = useState(false);
  const [showPresets, setShowPresets] = useState(false);
  const [showMembers, setShowMembers] = useState(false);
  const [showUsers, setShowUsers] = useState(false);
  const [characters, setCharacters] = useState<Character[]>([]);
  const [glossary, setGlossary] = useState<GlossaryEntry[]>([]);
  const [presets, setPresets] = useState<LetteringPreset[]>([]);
  const [languages, setLanguages] = useState<LanguageDef[]>([]);

  useEffect(() => {
    api.listVolumes().then(setVolumes).catch((e) => setError(translateApiError(e, t)));
    api.getSettings().then((s) => {
      setEmptySuffix(s.emptySuffix);
      setScanRoot(s.scanRoot);
      setDescription(s.description);
      setCoverImagePath(s.coverImagePath);
    });
  }, [t]);

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
      label: t("menu.project"),
      entries: [
        { type: "action", label: t("menu.switch"), onClick: () => navigate("/project") },
        { type: "action", label: t("managers.characters.title"), onClick: () => setShowCharacters(true), disabled: !hasAtLeast("letterer") },
        { type: "action", label: t("managers.glossary.title"), onClick: () => setShowGlossary(true), disabled: !hasAtLeast("translator") },
        { type: "action", label: t("managers.presets.title"), onClick: () => setShowPresets(true), disabled: !hasAtLeast("letterer") },
        { type: "action", label: t("menu.members"), onClick: () => setShowMembers(true), disabled: !hasAtLeast("admin") },
        { type: "action", label: t("appShell.settings"), onClick: () => setShowSettings(true), disabled: !hasAtLeast("admin") },
        ...(myRole === "system-admin"
          ? [{ type: "action" as const, label: t("menu.users"), onClick: () => setShowUsers(true) }]
          : []),
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
      {showMembers && (
        <Modal onClose={() => setShowMembers(false)}>
          <MemberManager onClose={() => setShowMembers(false)} />
        </Modal>
      )}
      {showUsers && (
        <Modal onClose={() => setShowUsers(false)}>
          <UserManager onClose={() => setShowUsers(false)} />
        </Modal>
      )}
      <div style={{ display: "flex", flex: "1 1 auto", minHeight: 0 }}>
        {error ? (
          <div className="error-banner" style={{ margin: 12 }}>
            {error}
          </div>
        ) : !volumes ? (
          <p style={{ margin: 12 }}>{t("volumeList.loading")}</p>
        ) : volumes.length === 0 ? (
          <p style={{ margin: 12 }}>{t("volumeList.emptyState", { emptySuffix, scanRoot: scanRoot || "…" })}</p>
        ) : (
          <div className="page-scroll" style={{ padding: 16, flex: "1 1 auto" }}>
            <div className="card-grid">
              {volumes.map((v) => (
                <Link key={v.id} to={`/volumes/${encodeURIComponent(v.id)}`} className="card">
                  {v.firstPage ? (
                    <img src={api.pageThumbnailUrl(v.id, v.firstPage)} alt="" className="volume-card-preview" loading="lazy" />
                  ) : (
                    <div className="volume-card-preview volume-card-preview-placeholder">
                      <PageIcon />
                    </div>
                  )}
                  <div className="label" style={{ fontSize: 16, color: "var(--text)" }}>
                    {v.bookFolderName}
                  </div>
                  <div className="label">{project ? `${project.name}/${v.id}` : v.id}</div>
                  <div className="label">
                    {t("volumeList.languagesLine", {
                      languages: v.existingLanguageFolders.length > 0 ? v.existingLanguageFolders.join(", ") : t("volumeList.noLanguages"),
                    })}
                  </div>
                  <div className="volume-card-stats">
                    <span title={t("volumeList.statPagesTooltip")}>
                      <PageIcon />
                      {v.pageCount}
                    </span>
                    <span title={t("volumeList.statPanelsTooltip")}>
                      <PanelToolIcon />
                      {v.panelCount}
                    </span>
                    <span title={t("volumeList.statBubblesTooltip")}>
                      <BubbleToolIcon />
                      {v.bubbleCount}
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        )}
        <ProjectInfoSidebar
          name={project?.name ?? ""}
          description={description}
          coverImagePath={coverImagePath}
          volumes={volumes ?? []}
          languages={languages}
        />
      </div>
    </div>
  );
}
