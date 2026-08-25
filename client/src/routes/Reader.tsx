import { useEffect, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import type { PageLayout } from "../../../shared/src/layoutSchema";
import type { Character } from "../../../shared/src/characters";
import type { GlossaryEntry } from "../../../shared/src/glossary";
import type { LanguageDef } from "../../../shared/src/languages";
import type { ScriptDocument } from "../../../shared/src/script";
import type { Comment, CommentTarget } from "../../../shared/src/comments";
import type { ProjectRole } from "../../../shared/src/users";
import type { LetteringPreset } from "../../../shared/src/presets";
import { api, type PageSummary } from "../api/client";
import { ReaderPageCell } from "../editor/ReaderPageCell";
import { ReaderToolStrip, type ReaderDrawTool, type ReaderViewMode } from "../editor/ReaderToolStrip";
import { ReaderComparePicker } from "../editor/ReaderComparePicker";
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

type CommentThreadState =
  | { mode: "create"; x: number; y: number; page: string; target: CommentTarget }
  | { mode: "view"; x: number; y: number; commentId: string };

/** Read-only QC/review screen — a comfortable page-by-page viewer with free zoom/pan,
 * zoom-to-panel, comment tools, and access to characters/glossary/script, but none of
 * the Editor's geometry tools or save/undo machinery. Deliberately loads everything via
 * plain api.* calls into local state instead of useEditorStore, which carries a dirty/
 * undo/autosave model that has no purpose here (this screen never writes layout data).
 * The comment wiring below mirrors Editor.tsx's block closely on purpose — same
 * feature, same server contract, just a second place it's wired up.
 *
 * Shows 1–4 pages at once depending on `viewMode` (ReaderPageCell.tsx is the
 * per-page unit, each with its own independent selection/zoom-target state) —
 * "single" (just the routed page), "spread" (that page auto-paired with its logical
 * neighbor, reading-direction ordered), or "compare" (an arbitrary manually-picked set,
 * see ReaderComparePicker.tsx). */
export function Reader() {
  const { volumeId = "", page = "" } = useParams();
  const navigate = useNavigate();
  const { project } = useProject();
  const { user } = useSession();
  const { hasAtLeast } = useProjectRole();
  const readingDirection = project?.readingDirection ?? "rtl";

  const [layouts, setLayouts] = useState<Record<string, PageLayout>>({});
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
  const [viewMode, setViewMode] = useState<ReaderViewMode>("single");
  const [comparePages, setComparePages] = useState<string[]>([]);
  const [showComparePicker, setShowComparePicker] = useState(false);
  const [comments, setComments] = useState<Comment[]>([]);
  const [mentionableMembers, setMentionableMembers] = useState<MentionableMember[]>([]);
  const [commentThreadState, setCommentThreadState] = useState<CommentThreadState | null>(null);
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

  const pageIndex = pages.findIndex((p) => p.page === page);

  // Which pages to actually show right now — the one piece every view mode differs on.
  const displayedPages: string[] =
    viewMode === "compare"
      ? comparePages
      : viewMode === "spread"
        ? (() => {
            const partner = pageIndex >= 0 && pageIndex < pages.length - 1 ? pages[pageIndex + 1].page : null;
            if (!partner) return [page];
            // `page` is always the earlier-read of the pair (its neighbor comes later
            // in the array) — rtl reads right-to-left, so it goes on the right (second
            // in this left-to-right-rendered array); ltr puts it on the left (first).
            return readingDirection === "rtl" ? [partner, page] : [page, partner];
          })()
        : [page];

  // Same "fetch whatever's missing, cache the rest" shape as
  // TranslatorContextPanel.tsx's neighborCache — only re-runs when the actual page SET
  // changes (a stable joined-string key), not on every render (displayedPages above is
  // a fresh array each time). Also warms the cache for whichever page(s) a forward/back
  // flip would land on next (one "step" away in either direction — 2 pages in spread
  // mode, matching stepPage()'s own step size) even though they're not rendered yet, so
  // by the time the reviewer actually flips, the fetch has usually already finished and
  // ReaderPageCell.tsx's own loading placeholder never has to show at all.
  useEffect(() => {
    const step = viewMode === "spread" ? 2 : 1;
    // Nothing to prefetch in "compare" mode — there's no "next"/"previous" page to
    // step to, just the manually picked set already in displayedPages.
    const prefetch =
      viewMode === "compare" ? [] : [pageIndex - step, pageIndex + step].map((idx) => pages[idx]?.page).filter((p): p is string => !!p);
    const toFetch = [...new Set([...displayedPages, ...prefetch])].filter((p) => !(p in layouts));
    if (toFetch.length === 0) return;
    toFetch.forEach((p) => {
      api.getLayout(volumeId, p).then((l) => setLayouts((prev) => ({ ...prev, [p]: l })));
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [displayedPages.join("|"), volumeId, pageIndex, viewMode, pages.length]);

  // SVG-contour-bubble preload, same as Editor.tsx — a sceneFunc can't await, so every
  // currently-displayed page's referenced SVG files get loaded/cached up front, then
  // force-remount (fontsVersion, reused for both purposes there too).
  useEffect(() => {
    const fileNames = new Set<string>();
    for (const p of displayedPages) {
      const layout = layouts[p];
      if (!layout) continue;
      for (const bubble of layout.bubbles) {
        if (bubble.svgFileName) fileNames.add(bubble.svgFileName);
        for (const override of Object.values(bubble.formOverride ?? {})) {
          if (override.svgFileName) fileNames.add(override.svgFileName);
        }
      }
    }
    const uncached = [...fileNames].filter((fileName) => !isSvgBubbleBoundaryCached(fileName));
    if (uncached.length === 0) return;
    Promise.all(uncached.map((fileName) => ensureSvgBubbleBoundaryLoaded(fileName))).then(() => {
      setFontsVersion((v) => v + 1);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [displayedPages.join("|"), layouts]);

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

  function goToPage(target: string | null) {
    if (!target) return;
    navigate(`/volumes/${encodeURIComponent(volumeId)}/read/${encodeURIComponent(target)}`);
  }

  // "compare" has no single "current page" to step from — navigation is meaningless
  // there, not just temporarily unavailable (ReaderToolStrip.tsx disables the buttons
  // accordingly, this guards the keyboard shortcut the same way).
  function stepPage(direction: 1 | -1) {
    if (viewMode === "compare" || pageIndex === -1) return;
    const step = viewMode === "spread" ? 2 : 1;
    const targetIdx = Math.min(pages.length - 1, Math.max(0, pageIndex + direction * step));
    if (targetIdx !== pageIndex) goToPage(pages[targetIdx].page);
  }
  const canGoNext = viewMode !== "compare" && pageIndex >= 0 && pageIndex < pages.length - 1;
  const canGoPrev = viewMode !== "compare" && pageIndex > 0;

  // Keyboard page-flip — which arrow key means "forward" depends on the project's
  // reading direction, same convention a physical/manga-app reader uses (rtl: flip
  // left to advance). See ReaderToolStrip.tsx for the matching button-side/icon flip.
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.target instanceof HTMLElement && (e.target.tagName === "TEXTAREA" || e.target.tagName === "INPUT")) return;
      const forwardKey = readingDirection === "rtl" ? "ArrowLeft" : "ArrowRight";
      const backKey = readingDirection === "rtl" ? "ArrowRight" : "ArrowLeft";
      if (e.key === forwardKey) stepPage(1);
      else if (e.key === backKey) stepPage(-1);
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [readingDirection, viewMode, pageIndex, pages]);

  function handleRequestCreateComment(commentPage: string, target: CommentTarget, clientX: number, clientY: number) {
    setCommentThreadState({ mode: "create", x: clientX, y: clientY, page: commentPage, target });
  }

  function handleSelectComment(commentId: string, clientX: number, clientY: number) {
    setCommentThreadState({ mode: "view", x: clientX, y: clientY, commentId });
  }

  function handleSelectCommentFromPanel(comment: Comment) {
    if (!displayedPages.includes(comment.page)) {
      navigate(`/volumes/${encodeURIComponent(volumeId)}/read/${encodeURIComponent(comment.page)}?comment=${encodeURIComponent(comment.id)}`);
      return;
    }
    setCommentThreadState({ mode: "view", ...SIDEBAR_TRIGGERED_THREAD_POSITION, commentId: comment.id });
  }

  async function handleSubmitNewComment(fields: { body: string; mentionedUserIds: string[]; mentionedRoles: ProjectRole[] }) {
    if (!commentThreadState || commentThreadState.mode !== "create") return;
    setDrawTool(null);
    setCommentThreadState(null);
    await api.createComment(volumeId, { page: commentThreadState.page, target: commentThreadState.target, ...fields });
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

  // Deliberately NOT gated on `layouts[page]` being ready — that used to swap out the
  // ENTIRE screen (toolbar, sidebars, everything) for a bare loading message on every
  // single page flip, since a freshly-navigated-to page's layout is rarely cached yet.
  // Each ReaderPageCell already renders its own small loading placeholder while ITS
  // page's layout is in flight, which is all that's actually missing — the rest of the
  // UI (toolbar, comments/info sidebars) needs no layout data at all to render.

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
          onPrevPage={() => stepPage(-1)}
          onNextPage={() => stepPage(1)}
          canGoPrev={canGoPrev}
          canGoNext={canGoNext}
          viewMode={viewMode}
          onSetViewMode={setViewMode}
          onOpenComparePicker={() => setShowComparePicker(true)}
        />
        <CommentsPanel
          open={showCommentsPanel}
          comments={comments}
          currentPage={page}
          currentUserId={user?.id ?? ""}
          usernamesById={usernamesById}
          onSelectComment={handleSelectCommentFromPanel}
          onCreatePageComment={() =>
            setCommentThreadState({ mode: "create", ...SIDEBAR_TRIGGERED_THREAD_POSITION, page, target: { kind: "page" } })
          }
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
        <div className={`reader-page-grid${displayedPages.length >= 3 ? " grid" : ""}`}>
          {displayedPages.map((p) => (
            <ReaderPageCell
              key={p}
              volumeId={volumeId}
              page={p}
              layout={layouts[p] ?? null}
              characters={characters}
              presets={presets}
              activeLanguage={activeLanguage}
              fontsVersion={fontsVersion}
              drawTool={drawTool}
              readingDirection={readingDirection}
              comments={comments.filter((c) => c.page === p)}
              selectedCommentId={commentThreadState?.mode === "view" ? commentThreadState.commentId : null}
              onRequestCreateComment={handleRequestCreateComment}
              onSelectComment={handleSelectComment}
            />
          ))}
        </div>
      </div>
      {showComparePicker && (
        <ReaderComparePicker
          volumeId={volumeId}
          initialSelection={comparePages}
          onConfirm={(selected) => {
            setComparePages(selected);
            setViewMode("compare");
            setShowComparePicker(false);
          }}
          onClose={() => setShowComparePicker(false)}
        />
      )}
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
