import { useEffect, useRef, useState } from "react";

export interface ContextMenuAction {
  type: "action";
  label: string;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
}
export interface ContextMenuSeparator {
  type: "separator";
}
export interface ContextMenuSubmenu {
  type: "submenu";
  label: string;
  options: { label: string; onClick: () => void; selected?: boolean }[];
}
export type ContextMenuEntry = ContextMenuAction | ContextMenuSeparator | ContextMenuSubmenu;

interface Props {
  /** Screen position (native MouseEvent clientX/clientY) — independent of canvas zoom/pan. */
  x: number;
  y: number;
  entries: ContextMenuEntry[];
  onClose: () => void;
}

/** Generic right-click menu, positioned at the click point in fixed/viewport coordinates
 * (not canvas-relative) so it works the same regardless of Stage zoom/pan. A submenu
 * expands inline (accordion-style) rather than as a hover flyout — simpler and more
 * reliable than tracking flyout hover/mouseleave races for a menu this small. */
export function ContextMenu({ x, y, entries, onClose }: Props) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [openSubmenu, setOpenSubmenu] = useState<string | null>(null);
  const [pos, setPos] = useState({ x, y });

  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const clampedX = Math.min(x, window.innerWidth - rect.width - 8);
    const clampedY = Math.min(y, window.innerHeight - rect.height - 8);
    setPos({ x: Math.max(8, clampedX), y: Math.max(8, clampedY) });
    // Re-clamp only once per open (entries identity changes each open) — not on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entries]);

  useEffect(() => {
    function onMouseDown(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) onClose();
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("mousedown", onMouseDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onMouseDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [onClose]);

  function runAndClose(action: () => void) {
    action();
    onClose();
  }

  return (
    <div className="context-menu" ref={rootRef} style={{ left: pos.x, top: pos.y }}>
      {entries.map((entry, i) => {
        if (entry.type === "separator") return <div className="menu-sep" key={i} />;
        if (entry.type === "submenu") {
          const open = openSubmenu === entry.label;
          return (
            <div key={i}>
              <button
                className="menu-item context-menu-submenu-trigger"
                onClick={() => setOpenSubmenu(open ? null : entry.label)}
              >
                {entry.label} <span className="context-menu-caret">{open ? "▾" : "▸"}</span>
              </button>
              {open && (
                <div className="context-menu-submenu">
                  {entry.options.map((opt, j) => (
                    <button
                      key={j}
                      className={`menu-item${opt.selected ? " context-menu-selected" : ""}`}
                      onClick={() => runAndClose(opt.onClick)}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          );
        }
        return (
          <button
            className={`menu-item${entry.danger ? " context-menu-danger" : ""}`}
            key={i}
            onClick={() => runAndClose(entry.onClick)}
            disabled={entry.disabled}
          >
            {entry.label}
          </button>
        );
      })}
    </div>
  );
}
