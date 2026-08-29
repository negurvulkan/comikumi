import { useEffect, useRef, useState } from "react";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { PageLayoutSchema, originFromPoints } from "../../../shared/src/layoutSchema";
import type { LanguageDef } from "../../../shared/src/languages";
import type { Character } from "../../../shared/src/characters";
import type { GlossaryEntry } from "../../../shared/src/glossary";
import type { LetteringPreset } from "../../../shared/src/presets";
import type { Comment, CommentTarget } from "../../../shared/src/comments";
import type { ProjectRole } from "../../../shared/src/users";
import { useEditorStore } from "../state/editorStore";
import { PageCanvas } from "../editor/PageCanvas";
import { BubbleInspector } from "../editor/BubbleInspector";
import { ImageInspector } from "../editor/ImageInspector";
import { CurvedTextInspector } from "../editor/CurvedTextInspector";
import { PanelInspector } from "../editor/PanelInspector";
import { MultiSelectInspector } from "../editor/MultiSelectInspector";
import { ExportPanel } from "../editor/ExportPanel";
import { NormalizePreviewDialog } from "../editor/NormalizePreviewDialog";
import { useNormalizeRun, type FlaggedPage } from "../export/useNormalizeRun";
import type { RasterExportOptions } from "../export/renderPageToPng";
import type { UniformFitMode } from "../export/uniformFormat";
import { TextListPanel } from "../editor/TextListPanel";
import { TranslatorContextPanel } from "../editor/TranslatorContextPanel";
import { ScriptSidebar } from "../editor/ScriptSidebar";
import { StoryBiblePanel } from "../editor/StoryBiblePanel";
import { AIPanel } from "../editor/AIPanel";
import { CommentsPanel } from "../editor/CommentsPanel";
import { CommentThread } from "../editor/CommentThread";
import type { MentionableMember } from "../editor/MentionInput";
import { MenuBar } from "../editor/MenuBar";
import type { MenuGroup } from "../editor/MenuBar";
import { ToolStrip, type DrawTool } from "../editor/ToolStrip";
import { LanguageStrip } from "../editor/LanguageStrip";
import { Modal } from "../editor/Modal";
import { LayoutConflictModal } from "../editor/LayoutConflictModal";
import { SettingsForm } from "../editor/SettingsForm";
import { CharacterManager } from "../editor/CharacterManager";
import { GlossaryManager } from "../editor/GlossaryManager";
import { PresetManager } from "../editor/PresetManager";
import { ReportModal } from "../editor/ReportModal";
import { AutoBubblesReviewPanel } from "../editor/AutoBubblesReviewPanel";
import { useAutoBubblesRun } from "../ocr/useAutoBubblesRun";
import { detectionToBubble } from "../ocr/detectionToBubble";
import { characterName, groupBubblesByPanel, moveBubbleInReadingOrder } from "../editor/reportUtils";
import { api, downloadBlob, type PageSummary } from "../api/client";
import { useExportRun } from "../export/useExportRun";
import { ensureFontsLoaded } from "../editor/fontLoader";
import { ensureSvgBubbleBoundaryLoaded, isSvgBubbleBoundaryCached } from "../export/svgBubbleGeometry";
import { useProject } from "../state/ProjectContext";
import { useProjectRole } from "../state/useProjectRole";
import { useSession } from "../state/SessionContext";

/** Where the CommentThread popover opens when triggered from somewhere that has no
 * natural click position (CommentsPanel's list rows, its "+" new-page-comment button,
 * or a `?comment=` deep link that just navigated in) — roughly under the tool strip's
 * comment-panel toggle, a reasonable fixed anchor since there's no marker to point at. */
const SIDEBAR_TRIGGERED_THREAD_POSITION = { x: 260, y: 120 };

type CommentThreadState = { mode: "create"; x: number; y: number; target: CommentTarget } | { mode: "view"; x: number; y: number; commentId: string };

export function Editor() {
  const { t } = useTranslation();
  const { volumeId = "", page = "", projectId = "" } = useParams();
  const navigate = useNavigate();
  const pBase = `/p/${encodeURIComponent(projectId)}`;
  const { project } = useProject();
  const readingDirection = project?.readingDirection ?? "rtl";
  const { myRole, hasAtLeast } = useProjectRole();
  // Translators may only edit existing bubble/curved-text .text (see the server-side
  // diff guard in routes/layout.ts) — everyone at letterer or above keeps full access.
  // Deliberately an exact-role check, not hasAtLeast("translator"), since letterer/
  // admin/system-admin should NOT be geometry-restricted.
  const isTranslatorOnly = myRole === "translator";
  // The keydown handler below is registered once (empty dep array, matching this
  // file's existing "read fresh state via a ref/getState() instead of resubscribing
  // on every render" convention) — a ref keeps its closure seeing the current role
  // instead of whatever it was on first mount.
  const isTranslatorOnlyRef = useRef(isTranslatorOnly);
  useEffect(() => {
    isTranslatorOnlyRef.current = isTranslatorOnly;
  }, [isTranslatorOnly]);
  const store = useEditorStore();
  const [drawTool, setDrawTool] = useState<DrawTool | null>(null);
  const [showExportPanel, setShowExportPanel] = useState(false);
  const [showTextPanel, setShowTextPanel] = useState(false);
  const [showContextPanel, setShowContextPanel] = useState(false);
  const [showScriptPanel, setShowScriptPanel] = useState(false);
  const [showStoryBiblePanel, setShowStoryBiblePanel] = useState(false);
  const [showAIPanel, setShowAIPanel] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showCharacters, setShowCharacters] = useState(false);
  const [showGlossary, setShowGlossary] = useState(false);
  const [showPresets, setShowPresets] = useState(false);
  const [showReport, setShowReport] = useState(false);
  const [characters, setCharacters] = useState<Character[]>([]);
  const [glossary, setGlossary] = useState<GlossaryEntry[]>([]);
  const [presets, setPresets] = useState<LetteringPreset[]>([]);
  // Independent of the page's own activeLanguage tab on purpose — lets the
  // panel show e.g. the Japanese source while the inspector below keeps
  // editing the German translation, see TextListPanel.tsx. Seeded once from
  // the page's active language so it starts in sync, then drifts freely.
  const [textPanelLanguage, setTextPanelLanguage] = useState(store.activeLanguage);
  const importInputRef = useRef<HTMLInputElement>(null);
  // Bumped once the real (uploaded) fonts finish loading, so bubbles that were
  // first painted with a browser fallback font get force-remounted and redrawn
  // with the correct glyphs — otherwise the canvas just keeps the stale look.
  const [fontsVersion, setFontsVersion] = useState(0);
  const [languages, setLanguages] = useState<LanguageDef[]>([]);
  const [autosave, setAutosave] = useState<{ enabled: boolean; intervalSeconds: number } | null>(null);
  const [showCommentsPanel, setShowCommentsPanel] = useState(false);
  // Whole volume's comments (not just this page) — CommentsPanel needs the full list for
  // its "all open comments in this volume" view; PageCanvas gets a page-filtered slice
  // of this same state below, so markers and the sidebar can never disagree.
  const [comments, setComments] = useState<Comment[]>([]);
  const [mentionableMembers, setMentionableMembers] = useState<MentionableMember[]>([]);
  const [commentThreadState, setCommentThreadState] = useState<CommentThreadState | null>(null);
  const { user } = useSession();
  const [searchParams, setSearchParams] = useSearchParams();

  useEffect(() => {
    store.loadPage(volumeId, page);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [volumeId, page]);

  useEffect(() => {
    ensureFontsLoaded().then(() => setFontsVersion((v) => v + 1));
  }, []);

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

  function refetchComments() {
    api.getComments(volumeId).then((doc) => setComments(doc.comments));
  }
  useEffect(refetchComments, [volumeId]);

  useEffect(() => {
    api.getMentionableMembers(volumeId).then(setMentionableMembers);
  }, [volumeId]);

  // Deep-link support: a comment-mention email (Phase C) or a CommentsPanel row for a
  // comment on a DIFFERENT page both navigate here with "?comment=<id>" — once that
  // comment shows up in the freshly-fetched list, open its thread and clear the param
  // so it doesn't reopen on every subsequent render/refetch.
  useEffect(() => {
    const commentId = searchParams.get("comment");
    if (!commentId) return;
    const comment = comments.find((c) => c.id === commentId);
    if (!comment) return;
    setShowCommentsPanel(true);
    setCommentThreadState({ mode: "view", ...SIDEBAR_TRIGGERED_THREAD_POSITION, commentId });
    const next = new URLSearchParams(searchParams);
    next.delete("comment");
    setSearchParams(next, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [comments, searchParams]);

  // Re-read whenever the Settings modal closes, so a just-changed autosave
  // interval/toggle takes effect immediately without needing a page reload.
  useEffect(() => {
    if (showSettings) return;
    api.getSettings().then((s) => setAutosave({ enabled: s.autosaveEnabled, intervalSeconds: s.autosaveIntervalSeconds }));
  }, [showSettings]);

  // Autosave: on the configured interval, save only if there are actually
  // unsaved changes and no save is already in flight — reads fresh state via
  // getState() (not the `store` snapshot) so this effect doesn't need to
  // restart on every keystroke, only when the autosave config itself changes.
  useEffect(() => {
    if (!autosave?.enabled) return;
    const id = setInterval(() => {
      const s = useEditorStore.getState();
      if (s.dirty && !s.saving) s.save();
    }, autosave.intervalSeconds * 1000);
    return () => clearInterval(id);
  }, [autosave]);

  // Once languages are known, make sure the active tab actually exists — the
  // store defaults to "de" before we know whether that language still exists.
  useEffect(() => {
    if (languages.length === 0) return;
    if (!languages.some((l) => l.code === store.activeLanguage)) {
      store.setActiveLanguage(languages[0].code);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [languages]);

  const { layout, loading, error, selectedBubbleIds, selectedImageIds, selectedCurvedTextIds, selectedPanelIds, activeLanguage, dirty, saving, past } = store;

  // Global keyboard shortcuts — Escape/Delete/arrow-nudge/duplicate/undo-redo.
  // Reads fresh state via useEditorStore.getState() instead of closing over
  // the `store` snapshot from the hook, so this effect only needs to run
  // once (an empty dep array) instead of re-subscribing on every store change.
  useEffect(() => {
    function isTypingTarget(target: EventTarget | null): boolean {
      if (!(target instanceof HTMLElement)) return false;
      const tag = target.tagName;
      return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target.isContentEditable;
    }

    function handleKeyDown(e: KeyboardEvent) {
      // While a text field has focus, let the browser's own native
      // undo/typing/selection behavior handle every key — none of these
      // shortcuts should hijack e.g. Ctrl+Z while editing bubble text.
      if (isTypingTarget(e.target)) return;

      const s = useEditorStore.getState();
      const ctrlOrCmd = e.ctrlKey || e.metaKey;

      if (ctrlOrCmd && !e.shiftKey && e.key.toLowerCase() === "z") {
        e.preventDefault();
        s.undo();
        return;
      }
      if (ctrlOrCmd && (e.key.toLowerCase() === "y" || (e.shiftKey && e.key.toLowerCase() === "z"))) {
        e.preventDefault();
        s.redo();
        return;
      }
      if (e.key === "Escape") {
        s.deselectAll();
        return;
      }
      // Everything below changes geometry (duplicate/delete/nudge) — the server
      // rejects these for the "translator" role anyway (see routes/layout.ts's diff
      // guard), so skip them client-side too instead of letting the save silently fail.
      if (isTranslatorOnlyRef.current) return;

      if (ctrlOrCmd && e.key.toLowerCase() === "d") {
        e.preventDefault();
        s.duplicateSelected();
        return;
      }
      if (e.key === "Delete" || e.key === "Backspace") {
        e.preventDefault();
        s.removeSelected();
        return;
      }
      const step = e.shiftKey ? 10 : 1;
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        s.nudgeSelected(-step, 0);
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        s.nudgeSelected(step, 0);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        s.nudgeSelected(0, -step);
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        s.nudgeSelected(0, step);
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  // SVG bubble contours are parsed asynchronously and cached (see
  // svgBubbleGeometry.ts) — a Konva sceneFunc can't await, so this preloads
  // every referenced file (base form + any per-language formOverride) and
  // bumps fontsVersion (already used to force-remount bubbles once a real
  // font finishes loading) once done, so a freshly-picked SVG appears
  // without needing a manual re-select.
  useEffect(() => {
    if (!layout) return;
    const fileNames = new Set<string>();
    for (const bubble of layout.bubbles) {
      if (bubble.svgFileName) fileNames.add(bubble.svgFileName);
      for (const override of Object.values(bubble.formOverride ?? {})) {
        if (override.svgFileName) fileNames.add(override.svgFileName);
      }
    }
    const uncached = [...fileNames].filter((fileName) => !isSvgBubbleBoundaryCached(fileName));
    if (uncached.length === 0) return;
    Promise.all(uncached.map((fileName) => ensureSvgBubbleBoundaryLoaded(fileName))).then(() => {
      setFontsVersion((v) => v + 1);
    });
  }, [layout]);
  const selectedCount = selectedBubbleIds.length + selectedImageIds.length + selectedCurvedTextIds.length + selectedPanelIds.length;
  // The detailed per-field inspectors only make sense for a single selected
  // element — with more than one selected, MultiSelectInspector (bulk
  // duplicate/delete) takes over instead.
  const selectedBubble = selectedCount === 1 ? layout?.bubbles.find((b) => b.id === selectedBubbleIds[0]) ?? null : null;
  const selectedImage = selectedCount === 1 ? layout?.images.find((img) => img.id === selectedImageIds[0]) ?? null : null;
  const selectedCurvedText = selectedCount === 1 ? layout?.curvedTexts.find((el) => el.id === selectedCurvedTextIds[0]) ?? null : null;
  const selectedPanelIndex = selectedCount === 1 ? layout?.panels.findIndex((p) => p.id === selectedPanelIds[0]) ?? -1 : -1;
  const selectedPanel = selectedPanelIndex >= 0 ? layout?.panels[selectedPanelIndex] ?? null : null;
  const activeLangDef = languages.find((l) => l.code === activeLanguage) ?? languages[0];
  const { exporting, exportMsg, setExportMsg, runExport } = useExportRun(volumeId, languages);
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
  const autoBubbles = useAutoBubblesRun();

  async function handleAnalyzeUniform(
    selection: Parameters<typeof analyzeNormalize>[0],
    onlyTranslated: boolean,
    languageFilter: "all" | string,
    targetWidth: number,
    targetHeight: number,
    imageOptions: RasterExportOptions
  ) {
    const { autoPages, flaggedPages } = await analyzeNormalize(selection, page, targetWidth, targetHeight);
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

  /** Loads the current page's already-rendered <img> pixels into a fresh ImageBitmap
   * for the detector — same source image the export pipeline already uses
   * (api.pageImageUrl), so "what Auto-Bubbles sees" always matches "what's on screen",
   * not a stale/cached copy. */
  async function handleRunAutoBubbles() {
    const img = new Image();
    img.crossOrigin = "use-credentials";
    img.src = api.pageImageUrl(volumeId, page);
    await img.decode();
    const bitmap = await createImageBitmap(img);
    await autoBubbles.start(bitmap);
  }

  /** Transcript of the current page for the AI panel's context — panels in reading
   * order, each bubble's speaker + text, plus curved (title/effect) text. Reuses the
   * same grouping/ordering ReportModal.tsx already relies on so this can never disagree
   * with what the report shows. Far more useful to the model than the bare "Seite N"
   * this used to send (see AIPanel.tsx's usage below). */
  function buildPageContextText(): string {
    if (!layout) return `Seite ${page}`;
    const lines = [`Seite ${page}`];
    for (const group of groupBubblesByPanel(layout.bubbles, layout.panels, activeLanguage, readingDirection)) {
      if (group.bubbles.length === 0) continue;
      lines.push(`${group.label}:`);
      for (const b of group.bubbles) {
        const text = b.text[activeLanguage]?.trim();
        lines.push(`  ${characterName(characters, b.characterId)}: ${text || "(leer)"}`);
      }
    }
    for (const curved of layout.curvedTexts) {
      const text = curved.text[activeLanguage]?.trim();
      if (text) lines.push(`Effekt-/Titeltext: ${text}`);
    }
    if (selectedBubble) {
      lines.push(`Aktuell ausgewählte Blase: ${selectedBubble.text[activeLanguage]?.trim() || "(leer)"}`);
    }
    return lines.join("\n");
  }

  function handleDownloadJson() {
    if (!layout) return;
    const blob = new Blob([JSON.stringify(layout, null, 2)], { type: "application/json" });
    downloadBlob(blob, `${page}.json`);
  }

  async function handleImportJsonFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setExportMsg(null);
    try {
      const text = await file.text();
      const parsed = PageLayoutSchema.safeParse(JSON.parse(text));
      if (!parsed.success) {
        setExportMsg(t("editor.editorRoute.invalidJsonFormat"));
        return;
      }
      store.importBubbles(parsed.data.bubbles);
      setExportMsg(t("editor.editorRoute.jsonImported", { count: parsed.data.bubbles.length }));
    } catch (err) {
      setExportMsg(t("editor.editorRoute.importErrorPrefix", { message: (err as Error).message }));
    }
  }

  const usernamesById: Record<string, string> = Object.fromEntries(mentionableMembers.map((m) => [m.userId, m.username]));
  const canDeleteAnyComment = hasAtLeast("admin");

  function handleRequestCreateComment(target: CommentTarget, clientX: number, clientY: number) {
    setCommentThreadState({ mode: "create", x: clientX, y: clientY, target });
  }

  function handleSelectComment(commentId: string, clientX: number, clientY: number) {
    setCommentThreadState({ mode: "view", x: clientX, y: clientY, commentId });
  }

  function handleSelectCommentFromPanel(comment: Comment) {
    if (comment.page !== page) {
      navigate(`${pBase}/volumes/${encodeURIComponent(volumeId)}/pages/${encodeURIComponent(comment.page)}?comment=${encodeURIComponent(comment.id)}`);
      return;
    }
    setCommentThreadState({ mode: "view", ...SIDEBAR_TRIGGERED_THREAD_POSITION, commentId: comment.id });
  }

  async function handleSubmitNewComment(fields: { body: string; mentionedUserIds: string[]; mentionedRoles: ProjectRole[] }) {
    if (!commentThreadState || commentThreadState.mode !== "create") return;
    setDrawTool(null);
    setCommentThreadState(null);
    await api.createComment(volumeId, { page, target: commentThreadState.target, ...fields });
    refetchComments();
  }

  async function handleReplyToComment(commentId: string, fields: { body: string; mentionedUserIds: string[]; mentionedRoles: ProjectRole[] }) {
    await api.replyToComment(volumeId, commentId, fields);
    refetchComments();
  }

  async function handleToggleCommentResolved(comment: Comment) {
    await api.setCommentResolved(volumeId, comment.id, !comment.resolved);
    refetchComments();
  }

  async function handleDeleteComment(commentId: string) {
    setCommentThreadState(null);
    await api.deleteComment(volumeId, commentId);
    refetchComments();
  }

  if (loading) return <p>{t("editor.editorRoute.loadingPage")}</p>;
  if (error) return <div className="error-banner">{error}</div>;
  if (!layout) return null;

  const menuGroups: MenuGroup[] = [
    {
      key: "seite",
      label: t("pageGrid.menuPageLabel"),
      entries: [
        { type: "action", label: saving ? t("settings.saving") : t("common.save"), onClick: () => store.save(), disabled: saving || !dirty },
        { type: "separator" },
        { type: "sublabel", label: t("pageGrid.menuImportLabel") },
        { type: "action", label: "JSON", onClick: () => importInputRef.current?.click(), disabled: isTranslatorOnly },
        { type: "separator" },
        { type: "sublabel", label: t("pageGrid.menuExportLabel") },
        {
          type: "action",
          label: t("pageGrid.menuExportImage"),
          onClick: () => setShowExportPanel(true),
          disabled: languages.length === 0 || !hasAtLeast("letterer"),
        },
        { type: "action", label: "JSON", onClick: handleDownloadJson, disabled: !hasAtLeast("letterer") },
        {
          type: "action",
          label: t("pageGrid.menuExportViewer") || "Export-Viewer",
          onClick: () => navigate(`${pBase}/volumes/${encodeURIComponent(volumeId)}/exports`),
        },
        { type: "separator" },
        { type: "action", label: t("editor.editorRoute.showReport"), onClick: () => setShowReport(true) },
        { type: "separator" },
        { type: "action", label: t("common.close"), onClick: () => navigate(`${pBase}/volumes/${encodeURIComponent(volumeId)}`) },
      ],
    },
    {
      key: "bearbeiten",
      label: t("editor.editorRoute.editMenu"),
      entries: [
        { type: "action", label: t("editor.editorRoute.undo"), onClick: () => store.undo(), disabled: past.length === 0 },
        { type: "action", label: t("common.delete"), onClick: () => store.removeSelected(), disabled: selectedCount === 0 || isTranslatorOnly },
        {
          type: "action",
          label: t("editor.contextMenu.duplicate"),
          onClick: () => store.duplicateSelected(),
          disabled: selectedCount === 0 || isTranslatorOnly,
        },
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

  return (
    <div className="page">
      <MenuBar
        groups={menuGroups}
        trailing={
          <span className="pill">
            {saving ? t("settings.saving") : dirty ? t("editor.editorRoute.unsavedPill") : t("editor.editorRoute.savedPill")}
          </span>
        }
      />
      <input
        ref={importInputRef}
        type="file"
        accept="application/json,.json"
        onChange={handleImportJsonFile}
        style={{ display: "none" }}
      />
      {(exportMsg || normalizeMsg) && <div className="error-banner" style={{ background: "#1f3a2a", borderColor: "#2f7a48", color: "#b3ffc0" }}>{exportMsg ?? normalizeMsg}</div>}
      {autoBubbles.progressMsg && (
        <div className="error-banner" style={{ background: "#1f3a2a", borderColor: "#2f7a48", color: "#b3ffc0" }}>{autoBubbles.progressMsg}</div>
      )}
      {store.conflict && (
        <LayoutConflictModal onKeepMine={() => store.resolveConflictOverwrite()} onReload={() => store.resolveConflictReload()} />
      )}
      {autoBubbles.pendingRegions && (
        <AutoBubblesReviewPanel
          regions={autoBubbles.pendingRegions}
          onCancel={autoBubbles.cancel}
          onInsert={(accepted) => {
            store.addBubbles(accepted.map((r) => detectionToBubble(r, activeLanguage)));
            autoBubbles.cancel();
          }}
        />
      )}
      {showExportPanel && (
        <Modal onClose={() => setShowExportPanel(false)}>
          <ExportPanel
            volumeId={volumeId}
            languages={languages}
            currentPage={page}
            exporting={exporting || normalizing}
            onExport={(selection, onlyTranslated, languageFilter, format, pdfxVersion, imageOptions, finalFormatOptions) =>
              runExport(selection, onlyTranslated, languageFilter, format, layout ? { page, layout } : null, pdfxVersion, imageOptions, finalFormatOptions)
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
      {showReport && (
        <Modal onClose={() => setShowReport(false)}>
          <ReportModal
            bubbles={layout.bubbles}
            panels={layout.panels}
            characters={characters}
            activeLanguage={activeLanguage}
            readingDirection={readingDirection}
            onClose={() => setShowReport(false)}
          />
        </Modal>
      )}
      <div className="editor-body">
        <ToolStrip
          drawTool={drawTool}
          onSetDrawTool={setDrawTool}
          onInsertImage={(fileName, w, h) => store.addImage(fileName, w, h, languages.map((l) => l.code))}
          onAddCurvedText={() => store.addCurvedText()}
          onRunAutoBubbles={handleRunAutoBubbles}
          autoBubblesRunning={autoBubbles.running}
          creationDisabled={isTranslatorOnly}
          textPanelOpen={showTextPanel}
          onToggleTextPanel={() => {
            setShowTextPanel((v) => !v);
            setShowContextPanel(false);
            setShowScriptPanel(false);
            setShowStoryBiblePanel(false);
            setShowAIPanel(false);
            setShowCommentsPanel(false);
          }}
          textPanelDisabled={languages.length === 0}
          contextPanelOpen={showContextPanel}
          onToggleContextPanel={() => {
            setShowContextPanel((v) => !v);
            setShowTextPanel(false);
            setShowScriptPanel(false);
            setShowStoryBiblePanel(false);
            setShowAIPanel(false);
            setShowCommentsPanel(false);
          }}
          scriptPanelOpen={showScriptPanel}
          onToggleScriptPanel={() => {
            setShowScriptPanel((v) => !v);
            setShowTextPanel(false);
            setShowContextPanel(false);
            setShowStoryBiblePanel(false);
            setShowAIPanel(false);
            setShowCommentsPanel(false);
          }}
          storyBiblePanelOpen={showStoryBiblePanel}
          onToggleStoryBiblePanel={() => {
            setShowStoryBiblePanel((v) => !v);
            setShowTextPanel(false);
            setShowContextPanel(false);
            setShowScriptPanel(false);
            setShowAIPanel(false);
            setShowCommentsPanel(false);
          }}
          aiPanelOpen={showAIPanel}
          onToggleAIPanel={() => {
            setShowAIPanel((v) => !v);
            setShowTextPanel(false);
            setShowContextPanel(false);
            setShowScriptPanel(false);
            setShowStoryBiblePanel(false);
            setShowCommentsPanel(false);
          }}
          commentsPanelOpen={showCommentsPanel}
          onToggleCommentsPanel={() => {
            setShowCommentsPanel((v) => !v);
            setShowTextPanel(false);
            setShowContextPanel(false);
            setShowScriptPanel(false);
            setShowStoryBiblePanel(false);
            setShowAIPanel(false);
          }}
          imageWidth={layout.imageWidth}
          imageHeight={layout.imageHeight}
          onCreatePanelGrid={(rects) => {
            for (const points of rects) {
              store.addPanel(points, {
                cutOrigin: originFromPoints(points),
                holeFill: { mode: "manual", color: "#ffffff" },
                replacement: { files: {}, fit: "stretch" },
              });
            }
          }}
        />
        <TextListPanel
          open={showTextPanel}
          bubbles={layout.bubbles}
          curvedTexts={layout.curvedTexts}
          languages={languages}
          panelLanguage={textPanelLanguage}
          onPanelLanguageChange={setTextPanelLanguage}
          onSelectBubble={(id) => store.selectBubble(id)}
          onSelectCurvedText={(id) => store.selectCurvedText(id)}
          onClose={() => setShowTextPanel(false)}
        />
        <TranslatorContextPanel
          open={showContextPanel}
          volumeId={volumeId}
          page={page}
          layout={layout}
          characters={characters}
          languages={languages}
          readingDirection={readingDirection}
          selectedBubbleId={selectedBubbleIds[0] ?? null}
          selectedPanelId={selectedPanelIds[0] ?? null}
          onSelectBubble={(id) => store.selectBubble(id)}
          onMove={(direction) => {
            const bubbleId = selectedBubbleIds[0];
            if (!bubbleId) return;
            const patches = moveBubbleInReadingOrder(layout.bubbles, layout.panels, activeLanguage, bubbleId, direction, readingDirection);
            patches.forEach(({ id, readingOrderOverride }) => store.updateBubble(id, { readingOrderOverride }));
          }}
          onClose={() => setShowContextPanel(false)}
        />
        <ScriptSidebar
          open={showScriptPanel}
          volumeId={volumeId}
          page={page}
          layout={layout}
          readingDirection={readingDirection}
          onInsertIntoBubble={
            selectedBubble
              ? (text) => store.updateBubble(selectedBubble.id, { text: { ...selectedBubble.text, [activeLanguage]: text } })
              : undefined
          }
          onClose={() => setShowScriptPanel(false)}
        />
        <CommentsPanel
          open={showCommentsPanel}
          comments={comments}
          currentPage={page}
          currentUserId={user?.id ?? ""}
          usernamesById={usernamesById}
          onSelectComment={handleSelectCommentFromPanel}
          onCreatePageComment={() => setCommentThreadState({ mode: "create", ...SIDEBAR_TRIGGERED_THREAD_POSITION, target: { kind: "page" } })}
          onClose={() => setShowCommentsPanel(false)}
        />
        <StoryBiblePanel open={showStoryBiblePanel} onClose={() => setShowStoryBiblePanel(false)} />
        <AIPanel
          open={showAIPanel}
          onClose={() => setShowAIPanel(false)}
          contextLabel={selectedBubble ? t("editor.aiPanel.contextSelectedBubble") : t("editor.aiPanel.contextCurrentPage")}
          contextText={buildPageContextText()}
          contextImageUrl={api.pageImageUrl(volumeId, page)}
        />
        <LanguageStrip languages={languages} active={activeLanguage} onChange={store.setActiveLanguage} onLanguagesChange={setLanguages} />
        <div className="editor-layout">
          <PageCanvas
            projectName={project?.name}
            volumeId={volumeId}
            page={page}
            imageUrl={api.pageImageUrl(volumeId, page)}
            imageWidth={layout.imageWidth}
            imageHeight={layout.imageHeight}
            bubbles={layout.bubbles}
            images={layout.images}
            curvedTexts={layout.curvedTexts}
            panels={layout.panels}
            characters={characters}
            presets={presets}
            selectedIds={selectedBubbleIds}
            selectedImageIds={selectedImageIds}
            selectedCurvedTextIds={selectedCurvedTextIds}
            selectedPanelIds={selectedPanelIds}
            activeLanguage={activeLanguage}
            fontsVersion={fontsVersion}
            drawTool={drawTool}
            readOnly={isTranslatorOnly}
            onSelect={store.selectBubble}
            onChange={store.updateBubble}
            onCreate={(shape, box) => {
              store.addBubble(shape, box);
              setDrawTool(null);
            }}
            onSelectImage={store.selectImage}
            onChangeImage={store.updateImage}
            onSelectCurvedText={store.selectCurvedText}
            onChangeCurvedText={store.updateCurvedText}
            onSelectPanel={store.selectPanel}
            onChangePanel={store.updatePanel}
            onCreatePanel={(points) => {
              store.addPanel(points);
              setDrawTool(null);
            }}
            onReassignPanel={(bubbleId, panelId) => store.reassignBubblePanel(bubbleId, panelId)}
            onDeselectAll={store.deselectAll}
            onDuplicateSelected={() => store.duplicateSelected()}
            onDeleteSelected={() => store.removeSelected()}
            comments={comments.filter((c) => c.page === page)}
            selectedCommentId={commentThreadState?.mode === "view" ? commentThreadState.commentId : null}
            onRequestCreateComment={handleRequestCreateComment}
            onSelectComment={handleSelectComment}
          />
          {selectedCount > 1 ? (
            <MultiSelectInspector
              bubbleCount={selectedBubbleIds.length}
              imageCount={selectedImageIds.length}
              curvedTextCount={selectedCurvedTextIds.length}
              panelCount={selectedPanelIds.length}
              onDuplicate={() => store.duplicateSelected()}
              onDelete={() => store.removeSelected()}
            />
          ) : selectedBubble ? (
            <BubbleInspector
              bubble={selectedBubble}
              activeLanguage={activeLanguage}
              panels={layout.panels}
              characters={characters}
              glossary={glossary}
              presets={presets}
              onChange={(patch) => store.updateBubble(selectedBubble.id, patch)}
              onReassignPanel={(panelId) => store.reassignBubblePanel(selectedBubble.id, panelId)}
              onDelete={() => store.removeBubble(selectedBubble.id)}
            />
          ) : selectedImage ? (
            <ImageInspector
              element={selectedImage}
              activeLanguage={activeLanguage}
              activeLanguageLabel={activeLangDef?.label ?? activeLanguage}
              onChange={(patch) => store.updateImage(selectedImage.id, patch)}
              onDelete={() => store.removeImage(selectedImage.id)}
            />
          ) : selectedCurvedText ? (
            <CurvedTextInspector
              element={selectedCurvedText}
              activeLanguage={activeLanguage}
              glossary={glossary}
              presets={presets}
              onChange={(patch) => store.updateCurvedText(selectedCurvedText.id, patch)}
              onDelete={() => store.removeCurvedText(selectedCurvedText.id)}
            />
          ) : selectedPanel ? (
            <PanelInspector
              panel={selectedPanel}
              index={selectedPanelIndex}
              activeLanguage={activeLanguage}
              onChange={(patch) => store.updatePanel(selectedPanel.id, patch)}
              onDelete={() => store.removePanel(selectedPanel.id)}
            />
          ) : (
            <div className="inspector">
              <p style={{ color: "var(--text-muted)", margin: 0 }}>
                {t("editor.editorRoute.selectOrCreateHint")}
              </p>
            </div>
          )}
        </div>
      </div>
      {commentThreadState?.mode === "create" && (
        <CommentThread
          mode="create"
          x={commentThreadState.x}
          y={commentThreadState.y}
          target={commentThreadState.target}
          mentionableMembers={mentionableMembers}
          onSubmit={handleSubmitNewComment}
          onCancel={() => setCommentThreadState(null)}
        />
      )}
      {commentThreadState?.mode === "view" &&
        (() => {
          const comment = comments.find((c) => c.id === commentThreadState.commentId);
          if (!comment) return null;
          return (
            <CommentThread
              mode="view"
              x={commentThreadState.x}
              y={commentThreadState.y}
              comment={comment}
              mentionableMembers={mentionableMembers}
              usernamesById={usernamesById}
              canDelete={canDeleteAnyComment || comment.authorId === user?.id}
              onReply={(fields) => handleReplyToComment(comment.id, fields)}
              onToggleResolved={() => handleToggleCommentResolved(comment)}
              onDelete={() => handleDeleteComment(comment.id)}
              onClose={() => setCommentThreadState(null)}
            />
          );
        })()}
    </div>
  );
}
