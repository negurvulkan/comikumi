import type { Bubble, Panel } from "../../../shared/src/layoutSchema";
import type { Character } from "../../../shared/src/characters";
import { characterName, groupBubblesByPanel, sortBubblesByPosition, uniqueCharacterNames } from "./reportUtils";

interface Props {
  bubbles: Bubble[];
  panels: Panel[];
  characters: Character[];
  activeLanguage: string;
  onClose: () => void;
}

function toSingleLine(text: string): string {
  return text.trim().replace(/\s*\n+\s*/g, " ⏎ ");
}

/** The four page-level reports requested: who says what, who-says-what per panel,
 * which characters appear on the page, and which characters appear per panel — all
 * computed live from the already-loaded layout, no extra request needed. */
export function ReportModal({ bubbles, panels, characters, activeLanguage, onClose }: Props) {
  const ordered = sortBubblesByPosition(bubbles, activeLanguage);
  const byPanel = groupBubblesByPanel(bubbles, panels, activeLanguage);
  const pageCharacters = uniqueCharacterNames(bubbles, characters);
  const panelCharacters = byPanel
    .map((g) => ({ label: g.label, characterNames: uniqueCharacterNames(g.bubbles, characters) }))
    .filter((g) => g.characterNames.length > 0);

  return (
    <div className="inspector" style={{ width: 480, maxWidth: "85vw", maxHeight: "80vh" }}>
      <p style={{ margin: 0, fontWeight: 600 }}>Bericht — diese Seite ({activeLanguage})</p>

      <p className="report-heading" style={{ margin: 0 }}>
        Wer sagt was?
      </p>
      {ordered.length === 0 ? (
        <p className="hint" style={{ margin: 0 }}>
          Keine Blasen auf dieser Seite.
        </p>
      ) : (
        <div className="text-list" style={{ flex: "0 0 auto", maxHeight: 160 }}>
          {ordered.map((b) => (
            <div key={b.id} className="text-list-row" style={{ cursor: "default" }}>
              <span className="text-list-type">{characterName(characters, b.characterId)}</span>
              <span className="text-list-content">{toSingleLine(b.text[activeLanguage] ?? "") || "(kein Text)"}</span>
            </div>
          ))}
        </div>
      )}

      <p className="report-heading" style={{ margin: 0 }}>
        Wer sagt was in welchem Panel?
      </p>
      {byPanel.length === 0 ? (
        <p className="hint" style={{ margin: 0 }}>
          Keine Panels auf dieser Seite.
        </p>
      ) : (
        byPanel.map((group) => (
          <div key={group.label} style={{ marginBottom: 4 }}>
            <p style={{ margin: "0 0 2px", fontSize: 12, fontWeight: 600 }}>{group.label}</p>
            {group.bubbles.length === 0 ? (
              <p className="hint" style={{ margin: "0 0 0 8px" }}>
                (keine Blasen)
              </p>
            ) : (
              group.bubbles.map((b) => (
                <div key={b.id} className="text-list-row" style={{ cursor: "default" }}>
                  <span className="text-list-type">{characterName(characters, b.characterId)}</span>
                  <span className="text-list-content">{toSingleLine(b.text[activeLanguage] ?? "") || "(kein Text)"}</span>
                </div>
              ))
            )}
          </div>
        ))
      )}

      <p className="report-heading" style={{ margin: 0 }}>
        Welche Charaktere kommen auf der Seite vor?
      </p>
      <p className="hint" style={{ margin: 0 }}>
        {pageCharacters.length > 0 ? pageCharacters.join(", ") : "Keine Charaktere zugeordnet."}
      </p>

      <p className="report-heading" style={{ margin: 0 }}>
        Welche Charaktere kommen in welchen Panels vor?
      </p>
      {panelCharacters.length === 0 ? (
        <p className="hint" style={{ margin: 0 }}>
          Keine Panels mit zugeordneten Charakteren.
        </p>
      ) : (
        panelCharacters.map((g) => (
          <p key={g.label} className="hint" style={{ margin: 0 }}>
            <strong style={{ color: "var(--text)" }}>{g.label}:</strong> {g.characterNames.join(", ")}
          </p>
        ))
      )}

      <button onClick={onClose}>Schließen</button>
    </div>
  );
}
