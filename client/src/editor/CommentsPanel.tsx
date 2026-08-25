import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import type { Comment } from "../../../shared/src/comments";
import { useResizableSidebarWidth } from "./useResizableSidebarWidth";
import { SidebarResizeHandle } from "./SidebarResizeHandle";

interface Props {
  /** Always mounted (needed for the slide transition to animate) — see
   * TextListPanel.tsx's identical doc comment. */
  open: boolean;
  /** Every comment across the whole volume, not just the current page — the point of a
   * dedicated panel over just the canvas markers: "show me every open comment that
   * mentions me, wherever it is in this volume". */
  comments: Comment[];
  currentPage: string;
  currentUserId: string;
  usernamesById: Record<string, string>;
  onSelectComment: (comment: Comment) => void;
  /** Opens the "create" composer for a page-level comment (no canvas geometry) — the
   * only way to leave one, since there's no dedicated draw tool for it (see
   * ToolStrip.tsx's three comment-* tools, all of which need a spot on the canvas). */
  onCreatePageComment: () => void;
  onClose: () => void;
}

type Filter = "all" | "open" | "mine";

function toSingleLine(text: string): string {
  return text.trim().replace(/\s*\n+\s*/g, " ⏎ ");
}

/** Lists every review comment in the volume, filterable and sorted (current page's
 * comments first, then by page, newest first within a page) — structurally the same
 * "open/data-list/onSelect/onClose" shape as TextListPanel.tsx, just volume- instead of
 * page-scoped since markers on the canvas already cover the page-local view. */
export function CommentsPanel({ open, comments, currentPage, currentUserId, usernamesById, onSelectComment, onCreatePageComment, onClose }: Props) {
  const { t } = useTranslation();
  const resize = useResizableSidebarWidth();
  const [filter, setFilter] = useState<Filter>("all");

  const entries = useMemo(() => {
    const filtered = comments.filter((c) => {
      if (filter === "open") return !c.resolved;
      if (filter === "mine") return c.mentionedUserIds.includes(currentUserId);
      return true;
    });
    return [...filtered].sort((a, b) => {
      if (a.page !== b.page) {
        if (a.page === currentPage) return -1;
        if (b.page === currentPage) return 1;
        return a.page.localeCompare(b.page);
      }
      return b.createdAt.localeCompare(a.createdAt);
    });
  }, [comments, filter, currentPage, currentUserId]);

  return (
    <div className={`text-sidebar${open ? " open" : ""}`} style={{ width: open ? resize.width : undefined }}>
      <SidebarResizeHandle
        dragging={resize.dragging}
        onPointerDown={resize.handlePointerDown}
        onPointerMove={resize.handlePointerMove}
        onPointerUp={resize.handlePointerUp}
      />
      <div style={{ display: "flex", alignItems: "center", gap: 12, justifyContent: "space-between" }}>
        <p style={{ margin: 0, fontWeight: 600 }}>{t("editor.commentsPanel.title")}</p>
        <button onClick={onClose}>{t("common.close")}</button>
      </div>
      <button onClick={onCreatePageComment}>{t("editor.commentsPanel.newPageComment")}</button>
      <div className="field-row" style={{ gap: 4 }}>
        {(["all", "open", "mine"] as Filter[]).map((f) => (
          <button key={f} className={filter === f ? "primary" : ""} onClick={() => setFilter(f)}>
            {t(`editor.commentsPanel.filter${f === "all" ? "All" : f === "open" ? "Open" : "MentionsMe"}`)}
          </button>
        ))}
      </div>
      {entries.length === 0 ? (
        <p style={{ color: "var(--text-muted)", margin: 0 }}>{t("editor.commentsPanel.empty")}</p>
      ) : (
        <div className="text-list">
          {entries.map((c) => (
            <button key={c.id} className="text-list-row" onClick={() => onSelectComment(c)}>
              <span className="text-list-type">
                {c.page}
                {c.resolved ? ` · ${t("editor.commentsPanel.resolvedBadge")}` : ""}
              </span>
              <span className="text-list-content">{toSingleLine(c.body) || t("editor.commentsPanel.empty")}</span>
              <span className="hint" style={{ margin: 0 }}>
                {usernamesById[c.authorId] ?? c.authorId}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
