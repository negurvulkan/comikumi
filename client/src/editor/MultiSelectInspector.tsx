import { useTranslation } from "react-i18next";

interface Props {
  bubbleCount: number;
  imageCount: number;
  curvedTextCount: number;
  panelCount: number;
  onDuplicate: () => void;
  onDelete: () => void;
}

/** Shown instead of the per-element inspector once more than one element is selected (shift-click on the canvas) — bulk duplicate/delete, everything else (nudging, per-element style edits) goes through keyboard shortcuts or single-selection. */
export function MultiSelectInspector({ bubbleCount, imageCount, curvedTextCount, panelCount, onDuplicate, onDelete }: Props) {
  const { t } = useTranslation();
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
      <button onClick={onDelete} style={{ color: "#ff8a95" }}>
        {t("editor.multiSelect.deleteSelection")}
      </button>
    </div>
  );
}
