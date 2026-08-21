import { useMemo } from "react";
import type { Bubble, CurvedTextElement } from "../../../shared/src/layoutSchema";
import { resolveBubbleForm } from "../../../shared/src/layoutSchema";
import type { LanguageDef } from "../../../shared/src/languages";

interface Props {
  /** Always mounted (needed for the slide transition to animate) — this controls whether it's slid into view or off-screen to the left, see index.css's .text-sidebar/.text-sidebar.open. */
  open: boolean;
  bubbles: Bubble[];
  curvedTexts: CurvedTextElement[];
  languages: LanguageDef[];
  panelLanguage: string;
  onPanelLanguageChange: (code: string) => void;
  onSelectBubble: (id: string) => void;
  onSelectCurvedText: (id: string) => void;
  onClose: () => void;
}

interface TextEntry {
  type: "bubble" | "curvedText";
  id: string;
  y: number;
  text: string;
}

/** Collapses a possibly-multiline bubble/curved-text string into a single display line — line breaks become a visible separator instead of silently vanishing, so multi-line text doesn't look truncated to just its first line. */
function toSingleLine(text: string): string {
  return text.trim().replace(/\s*\n+\s*/g, " ⏎ ");
}

/** All texts on the page in one flat list, sorted top-to-bottom by position — a rough reading-order overview, independent of the page's own active-language tab (see Editor.tsx's `textPanelLanguage`). */
export function TextListPanel({
  open,
  bubbles,
  curvedTexts,
  languages,
  panelLanguage,
  onPanelLanguageChange,
  onSelectBubble,
  onSelectCurvedText,
  onClose,
}: Props) {
  const entries = useMemo(() => {
    const bubbleEntries: TextEntry[] = bubbles.map((b) => ({
      type: "bubble",
      id: b.id,
      y: resolveBubbleForm(b, panelLanguage).y,
      text: b.text[panelLanguage] ?? "",
    }));
    const curvedEntries: TextEntry[] = curvedTexts.map((el) => ({
      type: "curvedText",
      id: el.id,
      y: Math.min(...el.points.map((p) => p.y)),
      text: el.text[panelLanguage] ?? "",
    }));
    return [...bubbleEntries, ...curvedEntries].sort((a, b) => a.y - b.y);
  }, [bubbles, curvedTexts, panelLanguage]);

  return (
    <div className={`text-sidebar${open ? " open" : ""}`}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, justifyContent: "space-between" }}>
        <p style={{ margin: 0, fontWeight: 600 }}>Texte auf dieser Seite</p>
        <button onClick={onClose}>Schließen</button>
      </div>
      <div className="langstrip langstrip-horizontal">
        {languages.map((l) => (
          <button
            key={l.code}
            className={`lang-chip${l.code === panelLanguage ? " active" : ""}`}
            onClick={() => onPanelLanguageChange(l.code)}
            title={l.label}
          >
            {l.code.toUpperCase()}
          </button>
        ))}
      </div>
      <p className="hint" style={{ margin: 0 }}>
        Sprache hier ist unabhängig von der oben aktiven Sprache — Klick auf einen Eintrag wählt nur die Blase aus.
      </p>
      {entries.length === 0 ? (
        <p style={{ color: "var(--text-muted)", margin: 0 }}>Noch keine Bubbles oder Kurventexte auf dieser Seite.</p>
      ) : (
        <div className="text-list">
          {entries.map((entry) => {
            const line = toSingleLine(entry.text);
            return (
              <button
                key={`${entry.type}-${entry.id}`}
                className="text-list-row"
                onClick={() => (entry.type === "bubble" ? onSelectBubble(entry.id) : onSelectCurvedText(entry.id))}
              >
                <span className="text-list-type">{entry.type === "bubble" ? "Bubble" : "Kurventext"}</span>
                {line ? <span className="text-list-content">{line}</span> : <span className="text-list-empty">(kein Text)</span>}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
