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
  const total = bubbleCount + imageCount + curvedTextCount + panelCount;
  const parts: string[] = [];
  if (bubbleCount > 0) parts.push(`${bubbleCount} Bubble${bubbleCount === 1 ? "" : "s"}`);
  if (imageCount > 0) parts.push(`${imageCount} Bild${imageCount === 1 ? "" : "er"}`);
  if (curvedTextCount > 0) parts.push(`${curvedTextCount} Kurventext${curvedTextCount === 1 ? "" : "e"}`);
  if (panelCount > 0) parts.push(`${panelCount} Panel${panelCount === 1 ? "" : "s"}`);

  return (
    <div className="inspector">
      <p style={{ margin: 0, fontWeight: 600 }}>{total} Objekte ausgewählt</p>
      <p style={{ color: "var(--text-muted)", margin: "0 0 8px", fontSize: 12 }}>{parts.join(", ")}</p>
      <p className="hint" style={{ margin: "0 0 8px" }}>
        Pfeiltasten zum Verschieben (Shift = größere Schritte) · Strg+D duplizieren · Entf löschen · Shift-Klick zum
        Hinzufügen/Entfernen
      </p>
      <button onClick={onDuplicate}>Duplizieren</button>
      <button onClick={onDelete} style={{ color: "#ff8a95" }}>
        Auswahl löschen
      </button>
    </div>
  );
}
