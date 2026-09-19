import { useTranslation } from "react-i18next";
import type { Tag } from "../../../shared/src/tags";

interface Props {
  /** The project's full tag list. */
  tags: Tag[];
  /** Currently-assigned tag ids on the element (stale ids are simply not rendered). */
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  disabled?: boolean;
}

/** Compact multi-select of projectwide semantic tags, shown in the bubble/curved-text
 * inspector. Each tag is a toggle chip; clicking adds/removes its id from the element's
 * `tagIds`. Purely assignment — the tag list itself is managed in TagManager.tsx. */
export function TagPicker({ tags, selectedIds, onChange, disabled }: Props) {
  const { t } = useTranslation();
  // Legacy bubbles/curved texts saved before `tagIds` existed can arrive without it.
  const ids = selectedIds ?? [];
  if (tags.length === 0) {
    return <p className="hint" style={{ margin: "2px 0" }}>{t("managers.tags.pickerEmpty")}</p>;
  }
  const toggle = (id: string) => {
    if (disabled) return;
    onChange(ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]);
  };
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
      {tags.map((tag) => {
        const on = ids.includes(tag.id);
        return (
          <button
            key={tag.id}
            type="button"
            onClick={() => toggle(tag.id)}
            disabled={disabled}
            title={tag.name}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 5,
              padding: "2px 8px",
              borderRadius: 999,
              border: on ? `1px solid ${tag.color}` : "1px solid var(--border, #444)",
              background: on ? `${tag.color}33` : "transparent",
              color: "inherit",
              opacity: disabled ? 0.5 : 1,
              cursor: disabled ? "default" : "pointer",
              fontSize: 12,
            }}
          >
            <span style={{ width: 9, height: 9, borderRadius: 2, background: tag.color, display: "inline-block" }} />
            {tag.name}
          </button>
        );
      })}
    </div>
  );
}
