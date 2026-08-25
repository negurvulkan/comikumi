import { useEffect, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import type { PageLayout } from "../../../shared/src/layoutSchema";
import type { Character } from "../../../shared/src/characters";
import type { GlossaryEntry } from "../../../shared/src/glossary";
import type { LanguageDef } from "../../../shared/src/languages";
import type { ScriptDocument } from "../../../shared/src/script";
import type { Comment, CommentTarget } from "../../../shared/src/comments";
import type { ProjectRole } from "../../../shared/src/users";
import type { LetteringPreset } from "../../../shared/src/presets";
import { api, type PageSummary } from "../api/client";
import { PageCanvas } from "../editor/PageCanvas";
import { ReaderToolStrip, type ReaderDrawTool } from "../editor/ReaderToolStrip";
import { ReaderPanelStrip } from "../editor/ReaderPanelStrip";
import { ReaderInfoPanel } from "../editor/ReaderInfoPanel";
import { CommentsPanel } from "../editor/CommentsPanel";
import { CommentThread } from "../editor/CommentThread";
import type { MentionableMember } from "../editor/MentionInput";
import { useProject } from "../state/ProjectContext";
import { useSession } from "../state/SessionContext";
import { useProjectRole } from "../state/useProjectRole";
import { ensureFontsLoaded } from "../editor/fontLoader";
import { ensureSvgBubbleBoundaryLoaded, isSvgBubbleBoundaryCached } from "../export/svgBubbleGeometry";

/** Where the CommentThread popover opens when triggered from somewhere with no natural
 * click position (CommentsPanel's rows, a `?comment=` deep link) — see Editor.tsx's
 * identical constant/reasoning. */
const SIDEBAR_TRIGGERED_THREAD_POSITION = { x: 260, y: 120 };

type CommentThreadState = { mode: "create"; x: number; y: number; target: CommentTarget } | { mode: "view"; x: number; y: number; commentId: string };

/** Read-only QC/review screen — a comfortable page-by-page viewer with free zoom/pan,
 * zoom-to-panel, comment tools, and access to characters/glossary/script, but none of
 * the Editor's geometry tools or save/undo machinery. Deliberately loads everything via
 * plain api.* calls into local state instead of useEditorStore, which carries a dirty/
 * undo/autosave model that has no purpose here (this screen never writes layout data).
 * The comment wiring below mirrors Editor.tsx's block closely on purpose — same
 * feature, same server contract, just a second place it's wired up. */
export function Reader() {
  const { t } = useTranslation();
  const { volumeId = "", page = "" } = useParams();
  const navigate = useNavigate();
  const { project } = useProject();
  const { user } = useSession();
  const { hasAtLeast } = useProjectRole();
  const readingDirection = project?.readingDirection ?? "rtl";

  const [layout, setLayout] = useState<PageLayout | null>(null);
  const [pages, setPages] = useState<PageSummary[]>([]);
  const [languages, setLanguages] = useState<LanguageDef[]>([]);
  const [characters, setCharacters] = useState<Character[]>([]);
  const [glossary, setGlossary] = useState<GlossaryEntry[]>([]);
  const [script, setScript] = useState<ScriptDocument | null>(null);
  const [presets, setPresets] = useState<LetteringPreset[]>([]);
  const [activeLanguage, setActiveLanguage] = useState("");
  const [drawTool, setDrawTool] = useState<ReaderDrawTool | null>(null);
  const [showCommentsPanel, setShowCommentsPanel] = useState(false);
  const [showInfoPanel, setShowInfoPanel] = useState(false);
  const [comments, setComments] = useState<Comment[]>([]);
  const [mentionableMembers, setMentionableMembers] = useState<MentionableMember[]>([]);
  const [commentThreadState, setCommentThreadState] = useState<CommentThreadState | null>(null);
  const [focusRequest, setFocusRequest] = useState<{ panelId: string; requestId: number } | null>(null);
  const [selectedBubbleId, setSelectedBubbleId] = useState<string | null>(null);
  const [selectedPanelId, setSelectedPanelId] = useState<string | null>(null);
  const [selectedImageId, setSelectedImageId] = useState<string | null>(null);
  const [selectedCurvedTextId, setSelectedCurvedTextId] = useState<string | null>(null);
  const [searchParams, setSearchParams] = useSearchParams();
  // Bubbles first paint with a browser fallback font; bumping this once the real
  // uploaded fonts finish loading force-remounts them with the correct glyphs — same
  // reasoning/pattern as Editor.tsx's identical fontsVersion state (a QC visitor may
  // land straight on the Reader without ever having opened the Editor first, so the
  // fonts can't be assumed already cached from there).
  const [fontsVersion, setFontsVersion] = useState(0);

  useEffect(() => {
    ensureFontsLoaded().then(() => setFontsVersion((v) => v + 1));
  }, []);

  // Same SVG-contour-bubble preload as Editor.tsx — a sceneFunc can't await, so this
  // loads/caches every SVG file this page's bubbles reference before the canvas draws
  // them, then force-remounts (fontsVersion, reused for both purposes there too).
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

  useEffect(() => {
    setLayout(null);
    api.getLayout(volumeId, page).then(setLayout);
  }, [volumeId, page]);

  useEffect(() => {
    api.listPages(volumeId).then(setPages);
  }, [volumeId]);

  useEffect(() => {
    api.listLanguages().then((langs) => {
      setLanguages(langs);
      setActiveLanguage((prev) => (prev && langs.some((l) => l.code === prev) ? prev : (langs[0]?.code ?? "")));
    });
  }, [volumeId]);

  useEffect(() => {
    api.listCharacters().then(setCharacters);
  }, []);

  useEffect(() => {
    api.listGlossary().then(setGlossary);
  }, []);

  useEffect(() => {
    api.getScript(volumeId).then(setScript);
  }, [volumeId]);

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

  // Deep-link support: a comment-mention email or a CommentsPanel row for a comment on
  // a DIFFERENT page both navigate here with "?comment=<id>" — same mechanism as
  // Editor.tsx's identical effect.
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

  // A fresh page is a fresh view — no leftover selection/zoom-target/draw-tool from
  // whatever was previously being looked at.
  useEffect(() => {
    setSelectedBubbleId(null);
    setSelectedPanelId(null);
    setSelectedImageId(null);
    setSelectedCurvedTextId(null);
    setFocusRequest(null);
    setDrawTool(null);
  }, [page]);

  const pageIndex = pages.findIndex((p) => p.page === page);
  const prevPage = pageIndex > 0 ? pages[pageIndex - 1].page : null;
  const nextPage = pageIndex >= 0 && pageIndex < pages.length - 1 ? pages[pageIndex + 1].page : null;

  function goToPage(target: string | null) {
    if (!target) return;
    navigate(`/volumes/${encodeURIComponent(volumeId)}/read/${encodeURIComponent(target)}`);
  }

  // Keyboard page-flip — which arrow key means "forward" depends on the project's
  // reading direction, same convention a physical/manga-app reader uses (rtl: flip
  // left to advance). See ReaderToolStrip.tsx for the matching button-side/icon flip.
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.target instanceof HTMLElement && (e.target.tagName === "TEXTAREA" || e.target.tagName === "INPUT")) return;
      const forwardKey = readingDirection === "rtl" ? "ArrowLeft" : "ArrowRight";
      const backKey = readingDirection === "rtl" ? "ArrowRight" : "ArrowLeft";
      if (e.key === forwardKey) goToPage(nextPage);
      else if (e.key === backKey) goToPage(prevPage);
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [readingDirection, nextPage, prevPage, volumeId]);

  function handleRequestCreateComment(target: CommentTarget, clientX: number, clientY: number) {
    setCommentThreadState({ mode: "create", x: clientX, y: clientY, target });
  }

  function handleSelectComment(commentId: string, clientX: number, clientY: number) {
    setCommentThreadState({ mode: "view", x: clientX, y: clientY, commentId });
  }

  function handleSelectCommentFromPanel(comment: Comment) {
    if (comment.page !== page) {
      navigate(`/volumes/${encodeURIComponent(volumeId)}/read/${encodeURIComponent(comment.page)}?comment=${encodeURIComponent(comment.id)}`);
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

  const usernamesById: Record<string, string> = Object.fromEntries(mentionableMembers.map((m) => [m.userId, m.username]));
  const canDeleteAnyComment = hasAtLeast("admin");
  const pageComments = comments.filter((c) => c.page === page);

  if (!layout) return <p>{t("editor.editorRoute.loadingPage")}</p>;

  return (
    <div className="page">
      <div className="editor-body">
        <ReaderToolStrip
          drawTool={drawTool}
          onSetDrawTool={setDrawTool}
          commentsPanelOpen={showCommentsPanel}
          onToggleCommentsPanel={() => {
            setShowCommentsPanel((v) => !v);
            setShowInfoPanel(false);
          }}
          infoPanelOpen={showInfoPanel}
          onToggleInfoPanel={() => {
            setShowInfoPanel((v) => !v);
            setShowCommentsPanel(false);
          }}
          languages={languages}
          activeLanguage={activeLanguage}
          onChangeLanguage={setActiveLanguage}
          readingDirection={readingDirection}
          onPrevPage={() => goToPage(prevPage)}
          onNextPage={() => goToPage(nextPage)}
          canGoPrev={!!prevPage}
          canGoNext={!!nextPage}
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
        <ReaderInfoPanel
          open={showInfoPanel}
          page={page}
          characters={characters}
          glossary={glossary}
          script={script}
          languages={languages}
          onClose={() => setShowInfoPanel(false)}
        />
        <div style={{ display: "flex", flexDirection: "column", flex: "1 1 auto", minWidth: 0, minHeight: 0 }}>
          <PageCanvas
            // Keyed on `page` so PageCanvas's own internal zoom/pan state resets on
            // every page flip instead of carrying over — unlike the Editor (where you
            // typically dwell on one page and an occasional cross-page jump keeping
            // your zoom is a minor thing), this Reader's whole point is comfortable
            // page-by-page flipping; keeping a leftover zoomed-in rectangle from the
            // previous page would show an unrelated crop of the new one.
            key={page}
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
            selectedIds={selectedBubbleId ? [selectedBubbleId] : []}
            selectedImageIds={selectedImageId ? [selectedImageId] : []}
            selectedCurvedTextIds={selectedCurvedTextId ? [selectedCurvedTextId] : []}
            selectedPanelIds={selectedPanelId ? [selectedPanelId] : []}
            activeLanguage={activeLanguage}
            fontsVersion={fontsVersion}
            drawTool={drawTool}
            readOnly
            onSelect={setSelectedBubbleId}
            onChange={() => {}}
            onCreate={() => {}}
            onSelectImage={setSelectedImageId}
            onChangeImage={() => {}}
            onSelectCurvedText={setSelectedCurvedTextId}
            onChangeCurvedText={() => {}}
            onSelectPanel={setSelectedPanelId}
            onChangePanel={() => {}}
            onCreatePanel={() => {}}
            onReassignPanel={() => {}}
            onDeselectAll={() => {
              setSelectedBubbleId(null);
              setSelectedPanelId(null);
              setSelectedImageId(null);
              setSelectedCurvedTextId(null);
            }}
            onDuplicateSelected={() => {}}
            onDeleteSelected={() => {}}
            comments={pageComments}
            selectedCommentId={commentThreadState?.mode === "view" ? commentThreadState.commentId : null}
            onRequestCreateComment={handleRequestCreateComment}
            onSelectComment={handleSelectComment}
            focusRequest={focusRequest}
          />
          <ReaderPanelStrip
            imageUrl={api.pageImageUrl(volumeId, page)}
            panels={layout.panels}
            bubbles={layout.bubbles}
            activeLanguage={activeLanguage}
            readingDirection={readingDirection}
            selectedPanelId={selectedPanelId}
            onFocusPanel={(panelId) => {
              setSelectedPanelId(panelId);
              setFocusRequest((prev) => ({ panelId, requestId: (prev?.requestId ?? 0) + 1 }));
            }}
          />
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
