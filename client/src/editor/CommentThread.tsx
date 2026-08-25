import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { Comment, CommentTarget } from "../../../shared/src/comments";
import type { ProjectRole } from "../../../shared/src/users";
import { MentionInput, type MentionableMember } from "./MentionInput";

interface MentionFields {
  body: string;
  mentionedUserIds: string[];
  mentionedRoles: ProjectRole[];
}

type Props =
  | {
      mode: "create";
      x: number;
      y: number;
      target: CommentTarget;
      mentionableMembers: MentionableMember[];
      onSubmit: (fields: MentionFields) => void;
      onCancel: () => void;
    }
  | {
      mode: "view";
      x: number;
      y: number;
      comment: Comment;
      mentionableMembers: MentionableMember[];
      usernamesById: Record<string, string>;
      canDelete: boolean;
      onReply: (fields: MentionFields) => void;
      onToggleResolved: () => void;
      onDelete: () => void;
      onClose: () => void;
    };

function useMentionFields() {
  const [body, setBody] = useState("");
  const [mentionedUserIds, setMentionedUserIds] = useState<string[]>([]);
  const [mentionedRoles, setMentionedRoles] = useState<ProjectRole[]>([]);
  return { body, setBody, mentionedUserIds, setMentionedUserIds, mentionedRoles, setMentionedRoles };
}

function MentionChips({ userIds, roles, usernamesById }: { userIds: string[]; roles: ProjectRole[]; usernamesById: Record<string, string> }) {
  const { t } = useTranslation();
  if (userIds.length === 0 && roles.length === 0) return null;
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
      {userIds.map((id) => (
        <span key={id} className="comment-chip">
          @{usernamesById[id] ?? id}
        </span>
      ))}
      {roles.map((r) => (
        <span key={r} className="comment-chip">
          @{t(`roles.${r}`)}
        </span>
      ))}
    </div>
  );
}

function formatTimestamp(iso: string): string {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

/** Floating popover for a Cut-Panel-tool-adjacent QC comment — positioned at a fixed
 * screen point like ContextMenu.tsx (not a Modal backdrop), since it needs to stay
 * anchored near the marker that was clicked while the canvas underneath stays usable.
 * Same self-closing behavior as ContextMenu.tsx (outside-click, Escape). Handles both
 * composing a brand-new comment ("create") and viewing/replying to an existing thread
 * ("view") — the two share layout/positioning/mention-input machinery closely enough
 * that splitting them into separate components would mostly duplicate this shell. */
export function CommentThread(props: Props) {
  const { t } = useTranslation();
  const rootRef = useRef<HTMLDivElement>(null);
  const create = useMentionFields();
  const reply = useMentionFields();

  useEffect(() => {
    function onMouseDown(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        props.mode === "create" ? props.onCancel() : props.onClose();
      }
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") (props.mode === "create" ? props.onCancel : props.onClose)();
    }
    document.addEventListener("mousedown", onMouseDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onMouseDown);
      document.removeEventListener("keydown", onKeyDown);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.mode]);

  const style = { left: props.x, top: props.y };

  if (props.mode === "create") {
    return (
      <div className="comment-thread" ref={rootRef} style={style}>
        <p style={{ margin: 0, fontWeight: 600 }}>{t("editor.commentThread.newTitle")}</p>
        <MentionInput
          value={create.body}
          onChange={create.setBody}
          mentionedUserIds={create.mentionedUserIds}
          onMentionedUserIdsChange={create.setMentionedUserIds}
          mentionedRoles={create.mentionedRoles}
          onMentionedRolesChange={create.setMentionedRoles}
          mentionableMembers={props.mentionableMembers}
          placeholder={t("editor.commentThread.bodyPlaceholder")}
          autoFocus
        />
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button onClick={props.onCancel}>{t("common.cancel")}</button>
          <button
            className="primary"
            disabled={!create.body.trim()}
            onClick={() =>
              props.onSubmit({ body: create.body.trim(), mentionedUserIds: create.mentionedUserIds, mentionedRoles: create.mentionedRoles })
            }
          >
            {t("editor.commentThread.submit")}
          </button>
        </div>
      </div>
    );
  }

  const { comment } = props;
  return (
    <div className="comment-thread" ref={rootRef} style={style}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
        <span style={{ fontWeight: 600 }}>{props.usernamesById[comment.authorId] ?? comment.authorId}</span>
        <button onClick={props.onClose}>{t("common.close")}</button>
      </div>
      <span className="hint">{formatTimestamp(comment.createdAt)}</span>
      <p style={{ margin: 0, whiteSpace: "pre-wrap" }}>{comment.body}</p>
      <MentionChips userIds={comment.mentionedUserIds} roles={comment.mentionedRoles} usernamesById={props.usernamesById} />

      {comment.replies.length > 0 && (
        <div className="comment-reply-list">
          {comment.replies.map((r) => (
            <div key={r.id} className="comment-reply">
              <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                <span style={{ fontWeight: 600 }}>{props.usernamesById[r.authorId] ?? r.authorId}</span>
                <span className="hint">{formatTimestamp(r.createdAt)}</span>
              </div>
              <p style={{ margin: 0, whiteSpace: "pre-wrap" }}>{r.body}</p>
              <MentionChips userIds={r.mentionedUserIds} roles={r.mentionedRoles} usernamesById={props.usernamesById} />
            </div>
          ))}
        </div>
      )}

      <MentionInput
        value={reply.body}
        onChange={reply.setBody}
        mentionedUserIds={reply.mentionedUserIds}
        onMentionedUserIdsChange={reply.setMentionedUserIds}
        mentionedRoles={reply.mentionedRoles}
        onMentionedRolesChange={reply.setMentionedRoles}
        mentionableMembers={props.mentionableMembers}
        placeholder={t("editor.commentThread.replyPlaceholder")}
      />
      <div style={{ display: "flex", gap: 8, justifyContent: "space-between", flexWrap: "wrap" }}>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={props.onToggleResolved}>
            {comment.resolved ? t("editor.commentThread.reopen") : t("editor.commentThread.resolve")}
          </button>
          {props.canDelete && (
            <button style={{ color: "#ff8a95" }} onClick={props.onDelete}>
              {t("common.delete")}
            </button>
          )}
        </div>
        <button
          className="primary"
          disabled={!reply.body.trim()}
          onClick={() => {
            props.onReply({ body: reply.body.trim(), mentionedUserIds: reply.mentionedUserIds, mentionedRoles: reply.mentionedRoles });
            reply.setBody("");
            reply.setMentionedUserIds([]);
            reply.setMentionedRoles([]);
          }}
        >
          {t("editor.commentThread.reply")}
        </button>
      </div>
    </div>
  );
}
