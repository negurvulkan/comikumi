import { useTranslation } from "react-i18next";

interface Props {
  onClose?: () => void;
}

/** One row's key combo — rendered as one or more <kbd> chips joined by "+", e.g.
 * ["Strg", "Z"] -> "Strg" + "Z". Kept as an array (not a pre-joined string) so each
 * key gets its own chip instead of one long pill. */
type KeyCombo = string[];

/** Static reference list mirroring Editor.tsx's actual `handleKeyDown` handler and the
 * canvas's own mouse-interaction conventions (documented across BubbleShape.tsx/
 * MultiSelectInspector.tsx's own keyboardHint) — update this alongside any shortcut
 * change there, there's no single shared source of truth to derive it from
 * automatically. */
function useShortcutGroups(): { title: string; rows: { combo: KeyCombo; description: string }[] }[] {
  const { t } = useTranslation();
  return [
    {
      title: t("editor.shortcuts.groupGeneral"),
      rows: [
        { combo: ["Ctrl", "K"], description: t("editor.commandPalette.menuEntry") },
        { combo: ["Ctrl", "Z"], description: t("editor.shortcuts.undo") },
        { combo: ["Ctrl", "Y"], description: t("editor.shortcuts.redo") },
        { combo: ["Esc"], description: t("editor.shortcuts.deselectAll") },
      ],
    },
    {
      title: t("editor.shortcuts.groupSelection"),
      rows: [
        { combo: [t("editor.shortcuts.shiftClick")], description: t("editor.shortcuts.addToSelection") },
        { combo: ["Ctrl", "D"], description: t("editor.shortcuts.duplicateSelection") },
        { combo: ["Del"], description: t("editor.shortcuts.deleteSelection") },
        { combo: ["←↑→↓"], description: t("editor.shortcuts.nudgeSelection") },
        { combo: ["Shift", "←↑→↓"], description: t("editor.shortcuts.nudgeSelectionLarge") },
      ],
    },
    {
      title: t("editor.shortcuts.groupTextField"),
      rows: [
        { combo: ["Tab"], description: t("editor.shortcuts.nextBubble") },
        { combo: ["Shift", "Tab"], description: t("editor.shortcuts.previousBubble") },
        { combo: ["Ctrl", "Enter"], description: t("editor.shortcuts.nextBubble") },
        { combo: [t("editor.shortcuts.selectText")], description: t("editor.shortcuts.insertMarkupHint") },
      ],
    },
  ];
}

/** Read-only cheat sheet for the editor's keyboard shortcuts — opened from the "Hilfe"
 * menu (Editor.tsx). Same Modal-wrapped "manager" card shape as GlossaryManager/
 * PresetManager/etc. for visual consistency, even though it has no editable state. */
export function ShortcutsModal({ onClose }: Props) {
  const { t } = useTranslation();
  const groups = useShortcutGroups();

  return (
    <div className="inspector" style={{ maxWidth: 420 }}>
      <p style={{ margin: 0, fontWeight: 600 }}>{t("editor.shortcuts.title")}</p>
      {groups.map((group) => (
        <div key={group.title} style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <p className="report-heading" style={{ margin: "8px 0 0" }}>
            {group.title}
          </p>
          {group.rows.map((row, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
              <span style={{ fontSize: 13 }}>{row.description}</span>
              <span style={{ display: "flex", gap: 4, flexShrink: 0 }}>
                {row.combo.map((key, j) => (
                  <kbd className="kbd" key={j}>
                    {key}
                  </kbd>
                ))}
              </span>
            </div>
          ))}
        </div>
      ))}
      {onClose && (
        <button type="button" onClick={onClose} style={{ marginTop: 8 }}>
          {t("common.close")}
        </button>
      )}
    </div>
  );
}
