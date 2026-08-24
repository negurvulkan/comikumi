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
import { NewBlankPageDialog } from "../editor/NewBlankPageDialog";
import { useConfirmDialog } from "../editor/ConfirmDialog";
import { useProject } from "../state/ProjectContext";
import { useProjectRole } from "../state/useProjectRole";
import { nextPageName } from "./pageNaming";

const DEFAULT_BLANK_PAGE_WIDTH = 2000;
const DEFAULT_BLANK_PAGE_HEIGHT = 3000;

/** Draws a plain white canvas of the given size and resolves it as a PNG File — the
 * only "content" a freshly created blank page needs; panels placed on top of it get
 * their actual artwork via the existing Cut-Panel "replace with own image" mechanism. */
function blankPagePngFile(width: number, height: number, fileName: string): Promise<File> {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error("blank page canvas export failed"));
        return;
      }
      resolve(new File([blob], `${fileName}.png`, { type: "image/png" }));
    }, "image/png");
  });
}

export function PageGrid() {
  const { t } = useTranslation();
  const { volumeId = "" } = useParams();
  const navigate = useNavigate();
  const { project } = useProject();
  const { hasAtLeast } = useProjectRole();
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
  const [showNewBlankPage, setShowNewBlankPage] = useState(false);
  const importInputRef = useRef<HTMLInputElement>(null);
  const uploadPagesInputRef = useRef<HTMLInputElement>(null);
  const { exporting, exportMsg, runExport } = useExportRun(volumeId, languages);
  const { confirm, dialog: confirmDialog } = useConfirmDialog();

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

  async function handleUploadPagesFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (files.length === 0) return;
    setBusy(true);
    setMessage(null);
    try {
      const result = await api.uploadPages(volumeId, files);
      let totalWritten = result.written.length;
      if (result.conflicts.length > 0) {
        const overwrite = await confirm({
          title: t("pageGrid.uploadConflictTitle"),
          message: t("pageGrid.uploadConflictMessage", { list: result.conflicts.join(", ") }),
          confirmLabel: t("pageGrid.uploadConflictConfirm"),
        });
        if (overwrite) {
          const conflictingFiles = files.filter((f) => result.conflicts.includes(f.name.replace(/[^\w.\- ]/g, "_")));
          const retry = await api.uploadPages(volumeId, conflictingFiles, result.conflicts);
          totalWritten += retry.written.length;
        }
      }
      setMessage(t("pageGrid.uploadedMsg", { count: totalWritten }));
      setPages(await api.listPages(volumeId));
    } catch (e) {
      setMessage(t("pageGrid.uploadErrorPrefix", { message: translateApiError(e, t) }));
    } finally {
      setBusy(false);
    }
  }

  async function handleCreateBlankPage(width: number, height: number) {
    setShowNewBlankPage(false);
    setBusy(true);
    setMessage(null);
    try {
      const currentPages = pages ?? [];
      const name = nextPageName(currentPages);
      const file = await blankPagePngFile(width, height, name);
      await api.uploadPages(volumeId, [file]);
      navigate(`/volumes/${encodeURIComponent(volumeId)}/pages/${encodeURIComponent(name)}`);
    } catch (e) {
      setMessage(t("pageGrid.uploadErrorPrefix", { message: translateApiError(e, t) }));
      setBusy(false);
    }
  }

  async function handleDeletePage(page: string) {
    const ok = await confirm({ message: t("pageGrid.deletePageConfirm", { page }), danger: true });
    if (!ok) return;
    setBusy(true);
    setMessage(null);
    try {
      await api.deletePage(volumeId, page);
      setPages(await api.listPages(volumeId));
    } catch (e) {
      setMessage(t("pageGrid.uploadErrorPrefix", { message: translateApiError(e, t) }));
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
        { type: "action", label: t("pageGrid.menuImportZip"), onClick: () => importInputRef.current?.click(), disabled: busy || !hasAtLeast("letterer") },
        {
          type: "action",
          label: t("pageGrid.menuUploadPages"),
          onClick: () => uploadPagesInputRef.current?.click(),
          disabled: busy || !hasAtLeast("letterer"),
        },
        {
          type: "action",
          label: t("pageGrid.menuNewBlankPage"),
          onClick: () => setShowNewBlankPage(true),
          disabled: busy || !hasAtLeast("letterer"),
        },
        { type: "separator" },
        { type: "sublabel", label: t("pageGrid.menuExportLabel") },
        {
          type: "action",
          label: t("pageGrid.menuExportImage"),
          onClick: () => setShowExportPanel(true),
          disabled: languages.length === 0 || !hasAtLeast("letterer"),
        },
        { type: "action", label: t("pageGrid.menuExportAllZip"), onClick: handleExportZip, disabled: busy || !hasAtLeast("letterer") },
        {
          type: "action",
          label: t("pageGrid.menuExportViewer") || "Export-Viewer",
          onClick: () => navigate(`/volumes/${encodeURIComponent(volumeId)}/exports`),
        },
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
        { type: "action", label: t("managers.characters.title"), onClick: () => setShowCharacters(true), disabled: !hasAtLeast("letterer") },
        { type: "action", label: t("managers.glossary.title"), onClick: () => setShowGlossary(true), disabled: !hasAtLeast("translator") },
        { type: "action", label: t("managers.presets.title"), onClick: () => setShowPresets(true), disabled: !hasAtLeast("letterer") },
        {
          type: "action",
          label: t("script.menuEntry"),
          onClick: () => navigate(`/volumes/${encodeURIComponent(volumeId)}/script`),
          disabled: !hasAtLeast("letterer"),
        },
        { type: "action", label: t("appShell.settings"), onClick: () => setShowSettings(true), disabled: !hasAtLeast("admin") },
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
      <input
        ref={uploadPagesInputRef}
        type="file"
        multiple
        accept="image/png,image/jpeg,image/webp"
        onChange={handleUploadPagesFiles}
        style={{ display: "none" }}
      />
      {confirmDialog}
      <Link to="/" className="canvas-titlebar canvas-titlebar-link" title={t("pageGrid.breadcrumbBackToVolumes")}>
        <span className="canvas-titlebar-name">{t("pageGrid.titlebarPages")}</span>
        <span className="canvas-titlebar-path">/{project ? `${project.name}/${volumeId}` : volumeId}</span>
      </Link>
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
            onExport={(selection, onlyTranslated, languageFilter, format, pdfxVersion) =>
              runExport(selection, onlyTranslated, languageFilter, format, null, pdfxVersion)
            }
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
      {showNewBlankPage && (
        <NewBlankPageDialog
          defaultWidth={pages && pages.length > 0 ? pages[pages.length - 1].width : DEFAULT_BLANK_PAGE_WIDTH}
          defaultHeight={pages && pages.length > 0 ? pages[pages.length - 1].height : DEFAULT_BLANK_PAGE_HEIGHT}
          onCreate={handleCreateBlankPage}
          onClose={() => setShowNewBlankPage(false)}
        />
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
            <div key={p.page} className="card-wrap">
              <Link to={`/volumes/${encodeURIComponent(volumeId)}/pages/${encodeURIComponent(p.page)}`} className="card">
                <img src={api.pageThumbnailUrl(volumeId, p.page)} alt={p.page} loading="lazy" />
                <div className="label">{p.page}</div>
              </Link>
              {hasAtLeast("letterer") && (
                <button
                  type="button"
                  className="card-delete-btn"
                  title={t("pageGrid.deletePage")}
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    handleDeletePage(p.page);
                  }}
                >
                  ×
                </button>
              )}
            </div>
          ))}
        </div>
      </div>
      <div className="canvas-statusbar">
        <span>{t("pageGrid.pagesCount", { count: pages.length })}</span>
      </div>
    </div>
  );
}
