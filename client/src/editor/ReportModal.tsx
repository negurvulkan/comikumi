import { useTranslation } from "react-i18next";
import type { Bubble, Panel } from "../../../shared/src/layoutSchema";
import type { Character } from "../../../shared/src/characters";
import { characterName, groupBubblesByPanel, sortBubblesByPosition, uniqueCharacterNames, type ReadingDirection } from "./reportUtils";

interface Props {
  bubbles: Bubble[];
  panels: Panel[];
  characters: Character[];
  activeLanguage: string;
  readingDirection: ReadingDirection;
  onClose: () => void;
}

function toSingleLine(text: string): string {
  return text.trim().replace(/\s*\n+\s*/g, " ⏎ ");
}

/** The four page-level reports requested: who says what, who-says-what per panel,
 * which characters appear on the page, and which characters appear per panel — all
 * computed live from the already-loaded layout, no extra request needed. */
export function ReportModal({ bubbles, panels, characters, activeLanguage, readingDirection, onClose }: Props) {
  const { t } = useTranslation();
  // Effect (SFX) bubbles aren't dialogue — excluded from every report on this page (but
  // not from the Layers navigator or reading-order navigation, see Bubble.isEffect).
  const dialogueBubbles = bubbles.filter((b) => !b.isEffect);
  const ordered = sortBubblesByPosition(dialogueBubbles, activeLanguage, readingDirection);
  const byPanel = groupBubblesByPanel(dialogueBubbles, panels, activeLanguage, readingDirection);
  const pageCharacters = uniqueCharacterNames(dialogueBubbles, characters);
  const panelCharacters = byPanel
    .map((g) => ({ label: g.label, characterNames: uniqueCharacterNames(g.bubbles, characters) }))
    .filter((g) => g.characterNames.length > 0);

  return (
    <div className="inspector" style={{ width: 480, maxWidth: "85vw", maxHeight: "80vh" }}>
      <p style={{ margin: 0, fontWeight: 600 }}>{t("editor.reportModal.title", { language: activeLanguage })}</p>

      <p className="report-heading" style={{ margin: 0 }}>
        {t("editor.reportModal.whoSaysWhat")}
      </p>
      {ordered.length === 0 ? (
        <p className="hint" style={{ margin: 0 }}>
          {t("editor.reportModal.noBubbles")}
        </p>
      ) : (
        <div className="text-list" style={{ flex: "0 0 auto", maxHeight: 160 }}>
          {ordered.map((b) => (
            <div key={b.id} className="text-list-row" style={{ cursor: "default" }}>
              <span className="text-list-type">{characterName(characters, b.characterId)}</span>
              <span className="text-list-content">{toSingleLine(b.text[activeLanguage] ?? "") || t("volumeReport.noText")}</span>
            </div>
          ))}
        </div>
      )}

      <p className="report-heading" style={{ margin: 0 }}>
        {t("editor.reportModal.whoSaysWhatByPanel")}
      </p>
      {byPanel.length === 0 ? (
        <p className="hint" style={{ margin: 0 }}>
          {t("editor.reportModal.noPanels")}
        </p>
      ) : (
        byPanel.map((group) => (
          <div key={group.label} style={{ marginBottom: 4 }}>
            <p style={{ margin: "0 0 2px", fontSize: 12, fontWeight: 600 }}>{group.label}</p>
            {group.bubbles.length === 0 ? (
              <p className="hint" style={{ margin: "0 0 0 8px" }}>
                {t("editor.reportModal.noBubblesShort")}
              </p>
            ) : (
              group.bubbles.map((b) => (
                <div key={b.id} className="text-list-row" style={{ cursor: "default" }}>
                  <span className="text-list-type">{characterName(characters, b.characterId)}</span>
                  <span className="text-list-content">{toSingleLine(b.text[activeLanguage] ?? "") || t("volumeReport.noText")}</span>
                </div>
              ))
            )}
          </div>
        ))
      )}

      <p className="report-heading" style={{ margin: 0 }}>
        {t("editor.reportModal.charactersOnPage")}
      </p>
      <p className="hint" style={{ margin: 0 }}>
        {pageCharacters.length > 0 ? pageCharacters.join(", ") : t("volumeReport.noCharacters")}
      </p>

      <p className="report-heading" style={{ margin: 0 }}>
        {t("editor.reportModal.charactersByPanel")}
      </p>
      {panelCharacters.length === 0 ? (
        <p className="hint" style={{ margin: 0 }}>
          {t("editor.reportModal.noPanelsWithCharacters")}
        </p>
      ) : (
        panelCharacters.map((g) => (
          <p key={g.label} className="hint" style={{ margin: 0 }}>
            <strong style={{ color: "var(--text)" }}>{g.label}:</strong> {g.characterNames.join(", ")}
          </p>
        ))
      )}

      <button onClick={onClose}>{t("common.close")}</button>
    </div>
  );
}
