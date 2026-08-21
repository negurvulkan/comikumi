import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { ChevronDownIcon } from "./Icons";

export interface MenuAction {
  type: "action";
  label: string;
  onClick: () => void;
  disabled?: boolean;
}
export interface MenuSeparator {
  type: "separator";
}
export interface MenuSubLabel {
  type: "sublabel";
  label: string;
}
export type MenuEntry = MenuAction | MenuSeparator | MenuSubLabel;

export interface MenuGroup {
  key: string;
  label: string;
  /** Plain nav link instead of a dropdown — used for e.g. "Einstellungen". */
  href?: string;
  entries?: MenuEntry[];
}

interface Props {
  groups: MenuGroup[];
  /** Rendered right-aligned at the end of the bar, e.g. a save-status pill. */
  trailing?: ReactNode;
}

/** Reusable Photoshop-style menu bar — same component/markup on every screen
 * (Editor, page overview) so the whole app reads as one cohesive UI. Each screen
 * supplies its own menu groups; only the visual shell is shared. */
export function MenuBar({ groups, trailing }: Props) {
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onMouseDown(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpenMenu(null);
      }
    }
    document.addEventListener("mousedown", onMouseDown);
    return () => document.removeEventListener("mousedown", onMouseDown);
  }, []);

  function toggle(key: string) {
    setOpenMenu((cur) => (cur === key ? null : key));
  }

  function runAndClose(action: () => void) {
    return () => {
      action();
      setOpenMenu(null);
    };
  }

  return (
    <div className="menubar" ref={rootRef}>
      {groups.map((group) =>
        group.href ? (
          <Link key={group.key} to={group.href} className="menu-trigger">
            {group.label}
          </Link>
        ) : (
          <div className="menu" key={group.key}>
            <button className={`menu-trigger${openMenu === group.key ? " active" : ""}`} onClick={() => toggle(group.key)}>
              {group.label} <ChevronDownIcon />
            </button>
            {openMenu === group.key && (
              <div className="menu-dropdown">
                {(group.entries ?? []).map((entry, i) => {
                  if (entry.type === "separator") return <div className="menu-sep" key={i} />;
                  if (entry.type === "sublabel") return (
                    <div className="menu-sub-label" key={i}>
                      {entry.label}
                    </div>
                  );
                  return (
                    <button className="menu-item" key={i} onClick={runAndClose(entry.onClick)} disabled={entry.disabled}>
                      {entry.label}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )
      )}
      <span className="menubar-spacer" />
      {trailing}
    </div>
  );
}
