import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { Bubble } from "../../../shared/src/layoutSchema";
import type { LetteringPreset } from "../../../shared/src/presets";

interface Props {
  bubbleCount: number;
  imageCount: number;
  curvedTextCount: number;
  panelCount: number;
  onDuplicate: () => void;
  onDelete: () => void;
  /** Bulk lock/unlock across every currently-selected element, regardless of type
   * (editorStore.ts's setLockedForSelection) — the multi-select counterpart to
   * LockToggleHandle.tsx's per-element toggle. */
  onLockSelection: () => void;
  onUnlockSelection: () => void;
  /** Whether the current selection actually qualifies for editorStore.ts's
   * mergeSelectedBubbles() (>=2 unlocked, non-"quad" bubbles) — computed by the caller,
   * which has the full bubble data this component only receives as counts. */
  canMerge: boolean;
  onMerge: () => void;
  /** Whether the selection includes at least one already-merged bubble. */
  canUnmerge: boolean;
  onUnmerge: () => void;
  /** Only relevant when `bubbleCount > 0` — the project's presets, for the bulk-assign
   * dropdown, and the patch callback bulk field edits go through (editorStore.ts's
   * updateSelectedBubbles). Optional so callers that never have a bubble in the mix
   * (shouldn't happen given `bubbleCount > 0` gates the section, but keeps this component
   * usable without them) don't have to pass empty arrays/no-op callbacks. */
  presets?: LetteringPreset[];
  onApplyToSelectedBubbles?: (patch: Partial<Bubble>) => void;
}

/** Shown instead of the per-element inspector once more than one element is selected (shift-click on the canvas) — bulk duplicate/delete/merge, everything else (nudging, per-element style edits) goes through keyboard shortcuts or single-selection. */
export function MultiSelectInspector({
  bubbleCount,
  imageCount,
  curvedTextCount,
  panelCount,
  onDuplicate,
  onDelete,
  onLockSelection,
  onUnlockSelection,
  canMerge,
  onMerge,
  canUnmerge,
  onUnmerge,
  presets,
  onApplyToSelectedBubbles,
}: Props) {
  const { t } = useTranslation();
  const [paddingEnabled, setPaddingEnabled] = useState(false);
  const [paddingValue, setPaddingValue] = useState(15);
  const [fontSizeValue, setFontSizeValue] = useState(24);

  const total = bubbleCount + imageCount + curvedTextCount + panelCount;
  const parts: string[] = [];
  if (bubbleCount > 0) parts.push(t("editor.multiSelect.bubbleCount", { count: bubbleCount }));
  if (imageCount > 0) parts.push(t("editor.multiSelect.imageCount", { count: imageCount }));
  if (curvedTextCount > 0) parts.push(t("editor.multiSelect.curvedTextCount", { count: curvedTextCount }));
  if (panelCount > 0) parts.push(t("editor.multiSelect.panelCount", { count: panelCount }));

  return (
    <div className="inspector">
      <p style={{ margin: 0, fontWeight: 600 }}>{t("editor.multiSelect.selectedTotal", { count: total })}</p>
      <p style={{ color: "var(--text-muted)", margin: "0 0 8px", fontSize: 12 }}>{parts.join(", ")}</p>
      <p className="hint" style={{ margin: "0 0 8px" }}>
        {t("editor.multiSelect.keyboardHint")}
      </p>
      <button onClick={onDuplicate}>{t("editor.multiSelect.duplicateButton")}</button>
      <div className="field-row">
        <button onClick={onLockSelection}>{t("editor.multiSelect.lockButton")}</button>
        <button onClick={onUnlockSelection}>{t("editor.multiSelect.unlockButton")}</button>
      </div>
      {canMerge && <button onClick={onMerge}>{t("editor.multiSelect.mergeButton")}</button>}
      {canUnmerge && <button onClick={onUnmerge}>{t("editor.multiSelect.unmergeButton")}</button>}
      <button onClick={onDelete} style={{ color: "#ff8a95" }}>
        {t("editor.multiSelect.deleteSelection")}
      </button>

      {bubbleCount > 0 && onApplyToSelectedBubbles && (
        <>
          <p className="report-heading" style={{ margin: "8px 0 0" }}>
            {t("editor.multiSelect.bulkEditHeading")}
          </p>
          <p className="hint" style={{ margin: "0 0 8px" }}>
            {t("editor.multiSelect.bulkEditHint", { count: bubbleCount })}
          </p>

          <label>
            {t("editor.multiSelect.bulkPresetLabel")}
            <select
              defaultValue=""
              onChange={(e) => {
                if (!e.target.value) return;
                onApplyToSelectedBubbles({ presetId: e.target.value });
                e.target.value = "";
              }}
            >
              <option value="" disabled>
                {t("editor.multiSelect.bulkPresetPlaceholder")}
              </option>
              {(presets ?? []).map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>

          <label style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <input type="checkbox" checked={paddingEnabled} onChange={(e) => setPaddingEnabled(e.target.checked)} />
            {t("editor.multiSelect.bulkPaddingLabel")}
          </label>
          {paddingEnabled && (
            <div className="field-row">
              <input
                type="range"
                min={0}
                max={90}
                value={paddingValue}
                onChange={(e) => setPaddingValue(Number(e.target.value))}
                style={{ flex: 1 }}
              />
              <span className="hint">{paddingValue}%</span>
              <button type="button" onClick={() => onApplyToSelectedBubbles({ paddingRatio: paddingValue / 100 })}>
                {t("editor.multiSelect.bulkApplyButton")}
              </button>
            </div>
          )}

          <label>
            {t("managers.presets.fontSizeLabel")}
            <div className="field-row">
              <input type="number" min={4} value={fontSizeValue} onChange={(e) => setFontSizeValue(Number(e.target.value))} />
              <button type="button" onClick={() => onApplyToSelectedBubbles({ fontSize: fontSizeValue })}>
                {t("editor.multiSelect.bulkApplyButton")}
              </button>
            </div>
          </label>
        </>
      )}
    </div>
  );
}
