import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { ProjectRole } from "../../../shared/src/users";

const ALL_ROLES: ProjectRole[] = ["viewer", "translator", "letterer", "admin"];

export interface MentionableMember {
  userId: string;
  username: string;
}

interface Props {
  value: string;
  onChange: (value: string) => void;
  mentionedUserIds: string[];
  onMentionedUserIdsChange: (ids: string[]) => void;
  mentionedRoles: ProjectRole[];
  onMentionedRolesChange: (roles: ProjectRole[]) => void;
  mentionableMembers: MentionableMember[];
  placeholder?: string;
  autoFocus?: boolean;
}

type MentionOption = { kind: "user"; userId: string; label: string } | { kind: "role"; role: ProjectRole; label: string };

/** Textarea with @-mention autocomplete — typing "@" opens a filtered dropdown of
 * project members (accounts) and the 4 fixed project roles; picking one inserts
 * "@label " into the text and records the mention in the parent's mentionedUserIds/
 * mentionedRoles state (this component never talks to the server itself). Mirrors
 * AdminDashboard.tsx's username-search-combobox pattern, generalized to also match
 * role names and to work inline inside free text instead of a standalone field. */
export function MentionInput({
  value,
  onChange,
  mentionedUserIds,
  onMentionedUserIdsChange,
  mentionedRoles,
  onMentionedRolesChange,
  mentionableMembers,
  placeholder,
  autoFocus,
}: Props) {
  const { t } = useTranslation();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [query, setQuery] = useState<string | null>(null); // null = dropdown closed
  const [triggerIndex, setTriggerIndex] = useState(0); // index of the "@" that opened it

  const options: MentionOption[] =
    query === null
      ? []
      : [
          ...mentionableMembers
            .filter((m) => m.username.toLowerCase().includes(query.toLowerCase()))
            .map((m): MentionOption => ({ kind: "user", userId: m.userId, label: m.username })),
          ...ALL_ROLES.filter((r) => r.toLowerCase().includes(query.toLowerCase())).map(
            (r): MentionOption => ({ kind: "role", role: r, label: t(`roles.${r}`) })
          ),
        ];

  function handleChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const next = e.target.value;
    onChange(next);
    const cursor = e.target.selectionStart;
    const beforeCursor = next.slice(0, cursor);
    const match = /@([\w-]*)$/.exec(beforeCursor);
    if (match) {
      setQuery(match[1]);
      setTriggerIndex(cursor - match[0].length);
    } else {
      setQuery(null);
    }
  }

  function pickOption(option: MentionOption) {
    if (query === null) return;
    const cursor = textareaRef.current?.selectionStart ?? value.length;
    const before = value.slice(0, triggerIndex);
    const after = value.slice(cursor);
    const inserted = `@${option.label} `;
    onChange(before + inserted + after);
    if (option.kind === "user" && !mentionedUserIds.includes(option.userId)) {
      onMentionedUserIdsChange([...mentionedUserIds, option.userId]);
    } else if (option.kind === "role" && !mentionedRoles.includes(option.role)) {
      onMentionedRolesChange([...mentionedRoles, option.role]);
    }
    setQuery(null);
    // Refocus + place the cursor right after the inserted mention, same spot a native
    // autocomplete would leave it — the browser's own DOM update from onChange happens
    // synchronously enough here that a plain setTimeout(0) is unnecessary.
    requestAnimationFrame(() => {
      const el = textareaRef.current;
      if (!el) return;
      el.focus();
      const pos = before.length + inserted.length;
      el.setSelectionRange(pos, pos);
    });
  }

  return (
    <div style={{ position: "relative" }}>
      <textarea
        ref={textareaRef}
        value={value}
        onChange={handleChange}
        onKeyDown={(e) => e.key === "Escape" && setQuery(null)}
        placeholder={placeholder}
        autoFocus={autoFocus}
        rows={3}
        style={{ width: "100%", resize: "vertical" }}
      />
      {query !== null && options.length > 0 && (
        <div className="mention-dropdown">
          {options.map((o) => (
            <button
              key={o.kind === "user" ? `u-${o.userId}` : `r-${o.role}`}
              type="button"
              className="menu-item"
              onClick={() => pickOption(o)}
            >
              {o.kind === "role" ? `@${o.label}` : o.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
