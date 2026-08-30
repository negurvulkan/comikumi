import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Modal } from "./Modal";

export interface CommandItem {
  id: string;
  /** Short group label shown before the item's own text, e.g. "Bubble", "Preset" — lets
   * the same flat filtered list stay scannable without a real grouped/sectioned UI. */
  category: string;
  label: string;
  onSelect: () => void;
}

interface Props {
  open: boolean;
  onClose: () => void;
  items: CommandItem[];
}

/** Ctrl/Cmd+K quick-jump palette (Editor.tsx) — fuzzy-ish substring filter over every
 * menu action, plus (when the underlying data is available) bubbles on the current page,
 * presets, and characters, all in one flat searchable list instead of hunting through the
 * menu bar / manager dialogs. Arrow keys move the highlight, Enter runs the highlighted
 * item, Escape closes (via Modal). Deliberately no fuzzy-matching library — a plain
 * case-insensitive substring test is enough for a few hundred items at most and keeps
 * this dependency-free. */
export function CommandPalette({ open, onClose, items }: Props) {
  const { t } = useTranslation();
  const [query, setQuery] = useState("");
  const [highlighted, setHighlighted] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setQuery("");
      setHighlighted(0);
      // Modal mounts synchronously in the same render this effect reacts to, so the
      // input already exists by the time this runs.
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter((item) => item.label.toLowerCase().includes(q) || item.category.toLowerCase().includes(q));
  }, [items, query]);

  function run(item: CommandItem | undefined) {
    if (!item) return;
    item.onSelect();
    onClose();
  }

  if (!open) return null;

  return (
    <Modal onClose={onClose}>
      <div className="command-palette">
        <input
          ref={inputRef}
          type="text"
          className="command-palette-input"
          placeholder={t("editor.commandPalette.placeholder")}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setHighlighted(0);
          }}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setHighlighted((h) => Math.min(h + 1, filtered.length - 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setHighlighted((h) => Math.max(h - 1, 0));
            } else if (e.key === "Enter") {
              e.preventDefault();
              run(filtered[highlighted]);
            }
          }}
        />
        <div className="command-palette-list">
          {filtered.length === 0 && <p className="hint" style={{ padding: "8px 4px" }}>{t("editor.commandPalette.empty")}</p>}
          {filtered.map((item, i) => (
            <button
              key={item.id}
              type="button"
              className={"command-palette-item" + (i === highlighted ? " active" : "")}
              onMouseEnter={() => setHighlighted(i)}
              onClick={() => run(item)}
            >
              <span className="command-palette-category">{item.category}</span>
              <span>{item.label}</span>
            </button>
          ))}
        </div>
      </div>
    </Modal>
  );
}
