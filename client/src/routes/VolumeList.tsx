import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import type { Character } from "../../../shared/src/characters";
import type { GlossaryEntry } from "../../../shared/src/glossary";
import type { LetteringPreset } from "../../../shared/src/presets";
import type { LanguageDef } from "../../../shared/src/languages";
import { api, type VolumeSummary } from "../api/client";
import { translateApiError } from "../i18n/translateApiError";
import { useProject } from "../state/ProjectContext";
import { LoadingIndicator } from "../editor/LoadingIndicator";
import { useSession } from "../state/SessionContext";
import { useProjectRole } from "../state/useProjectRole";
import { MenuBar } from "../editor/MenuBar";
import type { MenuGroup } from "../editor/MenuBar";
import { Modal } from "../editor/Modal";
import { SettingsForm } from "../editor/SettingsForm";
import { CharacterManager } from "../editor/CharacterManager";
import { GlossaryManager } from "../editor/GlossaryManager";
import { PresetManager } from "../editor/PresetManager";
import { ProjectInfoSidebar } from "../editor/ProjectInfoSidebar";
import { BatchFindReplaceModal } from "../editor/BatchFindReplaceModal";
import { BatchExportQueueModal } from "../editor/BatchExportQueueModal";
import { PageIcon, PanelToolIcon, BubbleToolIcon } from "../editor/Icons";

/** Stable, module-level component (not defined inline in a `.map`) so its per-item
 * loaded state survives re-renders correctly — same reasoning as PageGrid.tsx's own
 * PageCard. `.volume-card-preview` already reserves `aspect-ratio: 3/4` regardless of
 * load state (see index.css), so — unlike PageCard's thumbnail, which had no fixed
 * size before loading — this element always has real layout geometry; still uses
 * opacity (not display:none) to hide the unloaded image, since that's what makes
 * `loading="lazy"`'s IntersectionObserver work at all (see PageGrid.tsx's PageCard for
 * the concrete bug this avoids) and what lets the CSS opacity transition below actually
 * animate. */
function VolumeCardThumbnail({ volumeId, page }: { volumeId: string; page: string }) {
  const [loaded, setLoaded] = useState(false);
  const imgRef = useRef<HTMLImageElement>(null);
  useEffect(() => {
    if (imgRef.current?.complete) setLoaded(true);
  }, []);
  return (
    <div style={{ position: "relative" }}>
      <img
        ref={imgRef}
        src={api.pageThumbnailUrl(volumeId, page)}
        alt=""
        className="volume-card-preview fade-in-content"
        loading="lazy"
        onLoad={() => setLoaded(true)}
        style={{ opacity: loaded ? 1 : 0 }}
      />
      {!loaded && (
        <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <LoadingIndicator />
        </div>
      )}
    </div>
  );
}

export function VolumeList() {
  const { t } = useTranslation();
  const { project } = useProject();
  const { demoMode } = useSession();
  const { hasAtLeast, myRole } = useProjectRole();
  const navigate = useNavigate();
  const { projectId } = useParams<{ projectId: string }>();
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
  const [showFindReplace, setShowFindReplace] = useState(false);
  const [showBatchExport, setShowBatchExport] = useState(false);
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
        // A demo container only ever has the one seeded project — nothing to switch to.
        ...(demoMode ? [] : [{ type: "action" as const, label: t("menu.switch"), onClick: () => navigate("/project") }]),
        { type: "action", label: t("managers.characters.title"), onClick: () => setShowCharacters(true), disabled: !hasAtLeast("letterer") },
        { type: "action", label: t("managers.glossary.title"), onClick: () => setShowGlossary(true), disabled: !hasAtLeast("translator") },
        { type: "action", label: t("managers.presets.title"), onClick: () => setShowPresets(true), disabled: !hasAtLeast("letterer") },
        {
          type: "action",
          label: t("batchFindReplace.menuEntry"),
          onClick: () => setShowFindReplace(true),
          disabled: !hasAtLeast("letterer") || !volumes || volumes.length === 0,
        },
        {
          type: "action",
          label: t("batchExportQueue.menuEntry"),
          onClick: () => setShowBatchExport(true),
          disabled: !hasAtLeast("letterer") || !volumes || volumes.length === 0,
        },
        { type: "action", label: t("storyBible.menuEntry"), onClick: () => navigate(`/p/${encodeURIComponent(projectId!)}/story-bible`) },
        { type: "action", label: t("menu.members"), onClick: () => navigate("/admin?tab=projects"), disabled: !hasAtLeast("admin") },
        { type: "action", label: t("appShell.settings"), onClick: () => setShowSettings(true), disabled: !hasAtLeast("admin") },
        ...(myRole === "system-admin"
          ? [{ type: "action" as const, label: t("menu.users"), onClick: () => navigate("/admin?tab=accounts") }]
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
      {showFindReplace && volumes && (
        <Modal onClose={() => setShowFindReplace(false)}>
          <BatchFindReplaceModal volumes={volumes} onClose={() => setShowFindReplace(false)} />
        </Modal>
      )}
      {showBatchExport && volumes && (
        <Modal onClose={() => setShowBatchExport(false)}>
          <BatchExportQueueModal volumes={volumes} onClose={() => setShowBatchExport(false)} />
        </Modal>
      )}
      <div style={{ display: "flex", flex: "1 1 auto", minHeight: 0 }}>
        {error ? (
          <div className="error-banner" style={{ margin: 12 }}>
            {error}
          </div>
        ) : !volumes ? (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 12, flex: "1 1 auto" }}>
            <LoadingIndicator size="md" />
            <p style={{ margin: 0, color: "var(--text-muted)" }}>{t("volumeList.loading")}</p>
          </div>
        ) : volumes.length === 0 ? (
          <p style={{ margin: 12 }}>{t("volumeList.emptyState", { emptySuffix, scanRoot: scanRoot || "…" })}</p>
        ) : (
          <div className="page-scroll fade-in" style={{ padding: 16, flex: "1 1 auto" }}>
            <div className="card-grid">
              {volumes.map((v) => (
                <Link key={v.id} to={`/p/${encodeURIComponent(projectId!)}/volumes/${encodeURIComponent(v.id)}`} className="card">
                  {v.firstPage ? (
                    <VolumeCardThumbnail volumeId={v.id} page={v.firstPage} />
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
          volumes={volumes}
          languages={languages}
        />
      </div>
    </div>
  );
}
