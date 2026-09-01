import { useEffect, useRef, useState, type ReactNode } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { DndContext, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, rectSortingStrategy, useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { LanguageDef } from "../../../shared/src/languages";
import type { Character } from "../../../shared/src/characters";
import type { GlossaryEntry } from "../../../shared/src/glossary";
import type { LetteringPreset } from "../../../shared/src/presets";
import { EMPTY_PAGE_META_DOCUMENT, PAGE_TYPES, resolveChapters, type PageMetaDocument, type PageType } from "../../../shared/src/pageMeta";
import { api, downloadBlob, type PageSummary } from "../api/client";
import { translateApiError } from "../i18n/translateApiError";
import { useExportRun } from "../export/useExportRun";
import { useNormalizeRun, type FlaggedPage } from "../export/useNormalizeRun";
import type { RasterExportOptions } from "../export/renderPageToPng";
import type { UniformFitMode } from "../export/uniformFormat";
import { ExportPanel } from "../editor/ExportPanel";
import { NormalizePreviewDialog } from "../editor/NormalizePreviewDialog";
import { Modal } from "../editor/Modal";
import { MenuBar } from "../editor/MenuBar";
import type { MenuGroup } from "../editor/MenuBar";
import { SettingsForm } from "../editor/SettingsForm";
import { CharacterManager } from "../editor/CharacterManager";
import { GlossaryManager } from "../editor/GlossaryManager";
import { PresetManager } from "../editor/PresetManager";
import { VolumeReportModal } from "../editor/VolumeReportModal";
import { QaCheckModal } from "../editor/QaCheckModal";
import { NewBlankPageDialog } from "../editor/NewBlankPageDialog";
import { PageOrderConflictModal } from "../editor/PageOrderConflictModal";
import { useConfirmDialog } from "../editor/ConfirmDialog";
import { ChapterManager } from "../editor/ChapterManager";
import { ReadIcon, DragHandleIcon } from "../editor/Icons";
import { useProject } from "../state/ProjectContext";
import { useProjectRole } from "../state/useProjectRole";
import { nextPageName } from "./pageNaming";
import { movePage, insertPageAt } from "./pageOrdering";
import { computePageNumbers } from "./pageNumbering";

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

interface PageCardProps {
  page: PageSummary;
  volumeId: string;
  href: string;
  readHref: string;
  canDrag: boolean;
  canManage: boolean;
  onDelete: () => void;
  onInsertBefore: () => void;
  readTitle: string;
  deleteTitle: string;
  insertTitle: string;
  dragTitle: string;
  pageType: PageType;
  pageNumber: number | undefined;
  chapterId: string | undefined;
  chapters: { id: string; name: string }[];
  onChangeType: (type: PageType) => void;
  onChangeChapter: (chapterId: string | undefined) => void;
}

/** One page card — a stable, module-level component (not defined inline in a `.map`)
 * so dnd-kit's useSortable() hook identity stays consistent across renders. Drag
 * listeners live only on the small grip handle, never the whole card, so the existing
 * click-to-open-editor behavior on the card body keeps working unchanged. */
function PageCard({
  page,
  volumeId,
  href,
  readHref,
  canDrag,
  canManage,
  onDelete,
  onInsertBefore,
  readTitle,
  deleteTitle,
  insertTitle,
  dragTitle,
  pageType,
  pageNumber,
  chapterId,
  chapters,
  onChangeType,
  onChangeChapter,
}: PageCardProps) {
  const { t } = useTranslation();
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: page.page, disabled: !canDrag });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div ref={setNodeRef} style={style} className="card-wrap">
      <Link to={href} className="card">
        <img src={api.pageThumbnailUrl(volumeId, page.page)} alt={page.page} loading="lazy" />
        <div className="label">{page.page}</div>
        <div className="label" style={{ opacity: 0.75, fontSize: 11 }}>
          {t(`pageGrid.pageType_${pageType}`)}
          {pageNumber !== undefined ? ` · ${t("pageGrid.pageNumberLabel", { number: pageNumber })}` : ""}
        </div>
      </Link>
      {canManage ? (
        <div className="card-tagging" onClick={(e) => e.preventDefault()} style={{ display: "flex", gap: 4, padding: "0 4px 4px" }}>
          <select
            value={pageType}
            onChange={(e) => onChangeType(e.target.value as PageType)}
            title={t("pageGrid.pageTypeLabel")}
            style={{ fontSize: 11, flex: 1, minWidth: 0 }}
          >
            {PAGE_TYPES.map((type) => (
              <option key={type} value={type}>
                {t(`pageGrid.pageType_${type}`)}
              </option>
            ))}
          </select>
          {chapters.length > 0 && (
            <select
              value={chapterId ?? ""}
              onChange={(e) => onChangeChapter(e.target.value || undefined)}
              title={t("pageGrid.chapterLabel")}
              style={{ fontSize: 11, flex: 1, minWidth: 0 }}
            >
              <option value="">{t("pageGrid.noChapter")}</option>
              {chapters.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          )}
        </div>
      ) : (
        chapterId && chapters.find((c) => c.id === chapterId) && (
          <div className="label" style={{ opacity: 0.6, fontSize: 11, padding: "0 4px 4px" }}>
            {chapters.find((c) => c.id === chapterId)!.name}
          </div>
        )
      )}
      <Link to={readHref} className="card-read-btn" title={readTitle}>
        <ReadIcon />
      </Link>
      {canManage && (
        <button
          type="button"
          className="card-delete-btn"
          title={deleteTitle}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onDelete();
          }}
        >
          ×
        </button>
      )}
      {canManage && (
        <button
          type="button"
          className="card-insert-btn"
          title={insertTitle}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onInsertBefore();
          }}
        >
          +
        </button>
      )}
      {canDrag && (
        <button type="button" className="card-drag-handle" title={dragTitle} {...attributes} {...listeners}>
          <DragHandleIcon />
        </button>
      )}
    </div>
  );
}

export function PageGrid() {
  const { t } = useTranslation();
  const { volumeId = "", projectId = "" } = useParams();
  const navigate = useNavigate();
  const pBase = `/p/${encodeURIComponent(projectId)}`;
  const { project } = useProject();
  const { hasAtLeast } = useProjectRole();
  const canManagePages = hasAtLeast("letterer");
  const [pages, setPages] = useState<PageSummary[] | null>(null);
  const [orderEtag, setOrderEtag] = useState<string | null>(null);
  const [orderConflict, setOrderConflict] = useState<{ currentOrder: string[] } | null>(null);
  const [pageMeta, setPageMeta] = useState<PageMetaDocument>(EMPTY_PAGE_META_DOCUMENT);
  const [metaEtag, setMetaEtag] = useState<string | null>(null);
  const [showChapterManager, setShowChapterManager] = useState(false);
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
  const [showQaCheck, setShowQaCheck] = useState(false);
  const [showNewBlankPage, setShowNewBlankPage] = useState(false);
  const [insertPickerIndex, setInsertPickerIndex] = useState<number | null>(null);
  // Where the next upload/blank-page creation should be spliced into the order —
  // null means "append at the end", the pre-existing (and still default) behavior.
  const insertAtIndexRef = useRef<number | null>(null);
  const importInputRef = useRef<HTMLInputElement>(null);
  const uploadPagesInputRef = useRef<HTMLInputElement>(null);
  const { exporting, exportMsg, runExport } = useExportRun(volumeId, languages);
  const { exporting: normalizing, exportMsg: normalizeMsg, analyze: analyzeNormalize, run: runNormalize } = useNormalizeRun(volumeId, languages);
  const [pendingNormalize, setPendingNormalize] = useState<{
    autoPages: PageSummary[];
    flaggedPages: FlaggedPage[];
    targetWidth: number;
    targetHeight: number;
    imageOptions: RasterExportOptions;
    languageFilter: "all" | string;
    onlyTranslated: boolean;
  } | null>(null);
  const { confirm, dialog: confirmDialog } = useConfirmDialog();

  async function handleAnalyzeUniform(
    selection: Parameters<typeof analyzeNormalize>[0],
    onlyTranslated: boolean,
    languageFilter: "all" | string,
    targetWidth: number,
    targetHeight: number,
    imageOptions: RasterExportOptions
  ) {
    const { autoPages, flaggedPages } = await analyzeNormalize(selection, "", targetWidth, targetHeight);
    if (flaggedPages.length === 0) {
      setShowExportPanel(false);
      await runNormalize(autoPages, new Map(), targetWidth, targetHeight, imageOptions, languageFilter, onlyTranslated);
      return;
    }
    setShowExportPanel(false);
    setPendingNormalize({ autoPages, flaggedPages, targetWidth, targetHeight, imageOptions, languageFilter, onlyTranslated });
  }

  async function handleConfirmNormalize(resolutions: Map<string, UniformFitMode | "skip">) {
    if (!pendingNormalize) return;
    const { autoPages, flaggedPages, targetWidth, targetHeight, imageOptions, languageFilter, onlyTranslated } = pendingNormalize;
    setPendingNormalize(null);
    await runNormalize(
      [...autoPages, ...flaggedPages],
      resolutions,
      targetWidth,
      targetHeight,
      imageOptions,
      languageFilter,
      onlyTranslated
    );
  }

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  async function refreshPagesAndOrder() {
    const [nextPages, order, meta] = await Promise.all([api.listPages(volumeId), api.getPageOrder(volumeId), api.getPageMeta(volumeId)]);
    setPages(nextPages);
    setOrderEtag(order.etag);
    setPageMeta(meta.meta);
    setMetaEtag(meta.etag);
  }

  useEffect(() => {
    setPages(null);
    setOrderEtag(null);
    setOrderConflict(null);
    refreshPagesAndOrder().catch((e) => setError(translateApiError(e, t)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [volumeId, t]);

  /** Optimistic per-page tagging update — writes the new pageMeta immediately for
   * instant UI feedback, same shape as handleDragEnd()'s optimistic reorder. On a 409
   * (someone else saved different tagging meanwhile) just adopt their version and
   * surface an error, rather than a dedicated conflict modal — tagging edits are quick,
   * single-field changes with no in-progress drag state worth preserving. */
  async function updatePageMeta(page: string, patch: { type?: PageType; chapterId?: string | undefined }) {
    const nextEntry = { ...pageMeta.pages[page], ...patch };
    const nextMeta: PageMetaDocument = { ...pageMeta, pages: { ...pageMeta.pages, [page]: nextEntry } };
    setPageMeta(nextMeta);
    const result = await api.savePageMeta(volumeId, nextMeta, metaEtag ?? undefined);
    if (result.conflict) {
      setPageMeta(result.current);
      setMetaEtag(null);
      setMessage(t("pageGrid.metaConflict"));
    } else {
      setMetaEtag(result.etag);
    }
  }

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

  /** After a page (or pages) lands on disk via upload/blank-create, either just
   * refetch (append-at-end — listPages() already puts unseen pages there naturally,
   * no order write needed) or, if an insert position was chosen, splice the new names
   * in at that position and save the order explicitly. */
  async function placeNewPages(newPageNames: string[]) {
    const at = insertAtIndexRef.current;
    insertAtIndexRef.current = null;
    if (at === null) {
      await refreshPagesAndOrder();
      return;
    }
    const currentOrder = (pages ?? []).map((p) => p.page);
    const nextOrder = insertPageAt(currentOrder, newPageNames, at);
    const result = await api.savePageOrder(volumeId, nextOrder, orderEtag ?? undefined);
    if (result.conflict) {
      setOrderConflict({ currentOrder: result.currentOrder });
    } else {
      setOrderEtag(result.etag);
    }
    await refreshPagesAndOrder();
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
      let writtenNames = result.written.map((f) => f.replace(/\.[^.]+$/, ""));
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
          writtenNames = [...writtenNames, ...retry.written.map((f) => f.replace(/\.[^.]+$/, ""))];
        }
      }
      setMessage(t("pageGrid.uploadedMsg", { count: totalWritten }));
      await placeNewPages(writtenNames);
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
      if (insertAtIndexRef.current === null) {
        navigate(`${pBase}/volumes/${encodeURIComponent(volumeId)}/pages/${encodeURIComponent(name)}`);
      } else {
        await placeNewPages([name]);
      }
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
      await refreshPagesAndOrder();
    } catch (e) {
      setMessage(t("pageGrid.uploadErrorPrefix", { message: translateApiError(e, t) }));
    } finally {
      setBusy(false);
    }
  }

  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!pages || !over || active.id === over.id) return;
    const targetIndex = pages.findIndex((p) => p.page === over.id);
    if (targetIndex === -1) return;
    const currentOrder = pages.map((p) => p.page);
    const nextOrder = movePage(currentOrder, String(active.id), targetIndex);

    // Optimistic reorder for instant feedback.
    const byName = new Map(pages.map((p) => [p.page, p]));
    setPages(nextOrder.map((name) => byName.get(name)!));

    const result = await api.savePageOrder(volumeId, nextOrder, orderEtag ?? undefined);
    if (result.conflict) {
      // Keep the optimistic local reorder visible until the user resolves the
      // conflict — discarding it now would be surprising given the drag just
      // happened right in front of them.
      setOrderConflict({ currentOrder: result.currentOrder });
    } else {
      setOrderEtag(result.etag);
    }
  }

  async function resolveOrderConflictKeepMine() {
    if (!pages) return;
    setOrderConflict(null);
    const result = await api.savePageOrder(volumeId, pages.map((p) => p.page));
    if (!result.conflict) setOrderEtag(result.etag);
  }

  async function resolveOrderConflictReload() {
    setOrderConflict(null);
    await refreshPagesAndOrder();
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
          onClick: () => navigate(`${pBase}/volumes/${encodeURIComponent(volumeId)}/exports`),
        },
        { type: "separator" },
        { type: "action", label: t("pageGrid.menuManageChapters"), onClick: () => setShowChapterManager(true), disabled: !hasAtLeast("letterer") },
        { type: "action", label: t("pageGrid.menuVolumeReport"), onClick: () => setShowVolumeReport(true) },
        { type: "action", label: t("qaChecker.menuEntry"), onClick: () => setShowQaCheck(true) },
        {
          type: "action",
          label: t("reader.menuEntry"),
          onClick: () =>
            pages && pages.length > 0 && navigate(`${pBase}/volumes/${encodeURIComponent(volumeId)}/read/${encodeURIComponent(pages[0].page)}`),
          disabled: !pages || pages.length === 0,
        },
        { type: "separator" },
        { type: "action", label: t("pageGrid.menuBackToVolumes"), onClick: () => navigate(pBase) },
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
        { type: "action", label: t("storyBible.menuEntry"), onClick: () => navigate(`${pBase}/story-bible`) },
        {
          type: "action",
          label: t("script.menuEntry"),
          onClick: () => navigate(`${pBase}/volumes/${encodeURIComponent(volumeId)}/script`),
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

  // `pages` (from api.listPages) is already in saved volume page order (see
  // server/src/lib/projectScanner.ts's listPages) — safe to use directly as
  // resolveChapters()'s `pageOrder` input without a separate api.getPageOrder() call.
  const resolvedChapters = resolveChapters((pages ?? []).map((p) => p.page), pageMeta);

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
      <Link to={pBase} className="canvas-titlebar canvas-titlebar-link" title={t("pageGrid.breadcrumbBackToVolumes")}>
        <span className="canvas-titlebar-name">{t("pageGrid.titlebarPages")}</span>
        <span className="canvas-titlebar-path">/{project ? `${project.name}/${volumeId}` : volumeId}</span>
      </Link>
      {(message || exportMsg || normalizeMsg) && (
        <div
          className="error-banner"
          style={{ background: "#1f3a2a", borderColor: "#2f7a48", color: "#b3ffc0", margin: "10px 12px 0" }}
        >
          {message ?? exportMsg ?? normalizeMsg}
        </div>
      )}
      {showExportPanel && (
        <Modal onClose={() => setShowExportPanel(false)}>
          <ExportPanel
            volumeId={volumeId}
            languages={languages}
            chapters={resolvedChapters}
            exporting={exporting || normalizing}
            onExport={(selection, onlyTranslated, languageFilter, format, pdfxVersion, imageOptions, finalFormatOptions) =>
              runExport(selection, onlyTranslated, languageFilter, format, null, pdfxVersion, imageOptions, finalFormatOptions)
            }
            onAnalyzeUniform={handleAnalyzeUniform}
            onClose={() => setShowExportPanel(false)}
          />
        </Modal>
      )}
      {pendingNormalize && (
        <Modal onClose={() => setPendingNormalize(null)}>
          <NormalizePreviewDialog
            volumeId={volumeId}
            flaggedPages={pendingNormalize.flaggedPages}
            targetWidth={pendingNormalize.targetWidth}
            targetHeight={pendingNormalize.targetHeight}
            onConfirm={handleConfirmNormalize}
            onCancel={() => setPendingNormalize(null)}
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
          onClose={() => {
            insertAtIndexRef.current = null;
            setShowNewBlankPage(false);
          }}
        />
      )}
      {showChapterManager && (
        <Modal onClose={() => setShowChapterManager(false)}>
          <ChapterManager
            volumeId={volumeId}
            meta={pageMeta}
            etag={metaEtag}
            onChange={(nextMeta, nextEtag) => {
              setPageMeta(nextMeta);
              setMetaEtag(nextEtag);
            }}
            onClose={() => setShowChapterManager(false)}
          />
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
      {showQaCheck && (
        <Modal onClose={() => setShowQaCheck(false)}>
          <QaCheckModal
            volumeId={volumeId}
            languages={languages}
            glossary={glossary}
            presets={presets}
            onJumpToBubble={(page, bubbleId) => {
              setShowQaCheck(false);
              navigate(`${pBase}/volumes/${encodeURIComponent(volumeId)}/pages/${encodeURIComponent(page)}?bubble=${encodeURIComponent(bubbleId)}`);
            }}
            onClose={() => setShowQaCheck(false)}
          />
        </Modal>
      )}
      {insertPickerIndex !== null && (
        <Modal onClose={() => setInsertPickerIndex(null)}>
          <div className="inspector" style={{ maxWidth: 320 }}>
            <p style={{ margin: 0, fontWeight: 600 }}>{t("pageGrid.insertHere")}</p>
            <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 4 }}>
              <button
                type="button"
                className="primary"
                onClick={() => {
                  insertAtIndexRef.current = insertPickerIndex;
                  setInsertPickerIndex(null);
                  uploadPagesInputRef.current?.click();
                }}
              >
                {t("pageGrid.menuUploadPages")}
              </button>
              <button
                type="button"
                onClick={() => {
                  insertAtIndexRef.current = insertPickerIndex;
                  setInsertPickerIndex(null);
                  setShowNewBlankPage(true);
                }}
              >
                {t("pageGrid.menuNewBlankPage")}
              </button>
            </div>
          </div>
        </Modal>
      )}
      {orderConflict && <PageOrderConflictModal onKeepMine={resolveOrderConflictKeepMine} onReload={resolveOrderConflictReload} />}
      <div className="page-scroll" style={{ padding: 16 }}>
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={pages.map((p) => p.page)} strategy={rectSortingStrategy}>
            <div className="card-grid">
              {(() => {
                const pageNumbers = computePageNumbers(pages, pageMeta);
                // Chapter section headers: purely a rendering concern over the SAME
                // flat `pages` array/SortableContext (see this block's comment above
                // for why — splitting into multiple SortableContexts would break
                // dnd-kit's rectSortingStrategy drop-position math). A run-based
                // (contiguous) grouping, not resolveChapters()'s membership-based one:
                // walking `pages` in order and starting a new header whenever
                // chapterId changes means a chapter whose pages AREN'T contiguous in
                // volume order gets a second header further down instead of pulling
                // its pages out of true page order — that repeated header IS the "hint,
                // don't enforce" surfacing of a split chapter (see the plan).
                // No headers at all if the volume has never used chapters — avoids a
                // permanent "Ohne Kapitel" header cluttering every untagged volume,
                // the common/default case.
                const showChapterSections = pageMeta.chapters.length > 0;
                let previousChapterId: string | null | undefined = undefined;
                return pages.flatMap((p, i) => {
                  const chapterId = pageMeta.pages[p.page]?.chapterId ?? null;
                  const elements: ReactNode[] = [];
                  if (showChapterSections && chapterId !== previousChapterId) {
                    const chapterName = chapterId ? pageMeta.chapters.find((c) => c.id === chapterId)?.name : null;
                    elements.push(
                      <div key={`chapter-${i}`} className="chapter-section-header" style={{ gridColumn: "1 / -1" }}>
                        {chapterName ?? t("pageGrid.noChapterSection")}
                      </div>
                    );
                  }
                  previousChapterId = chapterId;
                  elements.push(
                    <PageCard
                      key={p.page}
                      page={p}
                      volumeId={volumeId}
                      href={`${pBase}/volumes/${encodeURIComponent(volumeId)}/pages/${encodeURIComponent(p.page)}`}
                      readHref={`${pBase}/volumes/${encodeURIComponent(volumeId)}/read/${encodeURIComponent(p.page)}`}
                      canDrag={canManagePages}
                      canManage={canManagePages}
                      onDelete={() => handleDeletePage(p.page)}
                      onInsertBefore={() => setInsertPickerIndex(i)}
                      readTitle={t("reader.menuEntry")}
                      deleteTitle={t("pageGrid.deletePage")}
                      insertTitle={t("pageGrid.insertHere")}
                      dragTitle={t("pageGrid.dragHandle")}
                      pageType={pageMeta.pages[p.page]?.type ?? "story"}
                      pageNumber={pageNumbers.get(p.page)}
                      chapterId={pageMeta.pages[p.page]?.chapterId}
                      chapters={pageMeta.chapters}
                      onChangeType={(type) => updatePageMeta(p.page, { type })}
                      onChangeChapter={(chapterId) => updatePageMeta(p.page, { chapterId })}
                    />
                  );
                  return elements;
                });
              })()}
            </div>
          </SortableContext>
        </DndContext>
      </div>
      <div className="canvas-statusbar">
        <span>{t("pageGrid.pagesCount", { count: pages.length })}</span>
      </div>
    </div>
  );
}
