import { useEffect, useState } from "react";
import type { Bubble } from "../../../shared/src/layoutSchema";
import type { Character } from "../../../shared/src/characters";
import { api } from "../api/client";
import { characterName, sortBubblesByPosition } from "./reportUtils";

interface Props {
  volumeId: string;
  characters: Character[];
  onClose: () => void;
}

function toSingleLine(text: string): string {
  return text.trim().replace(/\s*\n+\s*/g, " ⏎ ");
}

/** Aggregates the same underlying data as ReportModal.tsx but across every saved
 * page of the volume (via the new /reports route) instead of just the currently
 * open one — "welche Charaktere kommen im Band vor" only makes sense at this
 * scope, so it's a separate view rather than the page report reused verbatim. */
export function VolumeReportModal({ volumeId, characters, onClose }: Props) {
  const [pages, setPages] = useState<{ page: string; bubbles: Bubble[] }[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [language, setLanguage] = useState("de");

  useEffect(() => {
    api
      .getVolumeReport(volumeId)
      .then((rows) => setPages(rows.map((r) => ({ page: r.page, bubbles: r.layout.bubbles }))))
      .catch((e) => setError((e as Error).message));
  }, [volumeId]);

  const languageCodes = pages
    ? [...new Set(pages.flatMap((p) => p.bubbles.flatMap((b) => Object.keys(b.text))))].sort()
    : [];

  const characterPages = new Map<string, Set<string>>();
  if (pages) {
    for (const p of pages) {
      for (const b of p.bubbles) {
        if (!b.characterId) continue;
        const name = characterName(characters, b.characterId);
        if (!characterPages.has(name)) characterPages.set(name, new Set());
        characterPages.get(name)!.add(p.page);
      }
    }
  }
  const characterRows = [...characterPages.entries()].sort((a, b) => a[0].localeCompare(b[0]));

  return (
    <div className="inspector" style={{ width: 520, maxWidth: "85vw", maxHeight: "80vh" }}>
      <p style={{ margin: 0, fontWeight: 600 }}>Bericht für den ganzen Band</p>
      {error && <div className="error-banner">{error}</div>}
      {!pages ? (
        <p className="hint" style={{ margin: 0 }}>
          Lädt…
        </p>
      ) : pages.length === 0 ? (
        <p className="hint" style={{ margin: 0 }}>
          Noch keine gespeicherten Seiten in diesem Band.
        </p>
      ) : (
        <>
          <p className="report-heading" style={{ margin: 0 }}>
            Welche Charaktere kommen im Band vor?
          </p>
          {characterRows.length === 0 ? (
            <p className="hint" style={{ margin: 0 }}>
              Keine Charaktere zugeordnet.
            </p>
          ) : (
            characterRows.map(([name, pageSet]) => (
              <p key={name} className="hint" style={{ margin: 0 }}>
                <strong style={{ color: "var(--text)" }}>{name}:</strong> {[...pageSet].sort().join(", ")}
              </p>
            ))
          )}

          <div className="field-label-row">
            <p className="report-heading" style={{ margin: 0 }}>
              Wer sagt was — je Seite
            </p>
            <select value={language} onChange={(e) => setLanguage(e.target.value)} style={{ width: 90 }}>
              {(languageCodes.length > 0 ? languageCodes : ["de"]).map((code) => (
                <option key={code} value={code}>
                  {code.toUpperCase()}
                </option>
              ))}
            </select>
          </div>
          <div className="text-list" style={{ flex: "0 0 auto", maxHeight: 280 }}>
            {pages.map((p) => {
              const ordered = sortBubblesByPosition(p.bubbles, language);
              if (ordered.length === 0) return null;
              return (
                <div key={p.page} style={{ marginBottom: 4 }}>
                  <p style={{ margin: "0 0 2px", fontSize: 12, fontWeight: 600 }}>{p.page}</p>
                  {ordered.map((b) => (
                    <div key={b.id} className="text-list-row" style={{ cursor: "default" }}>
                      <span className="text-list-type">{characterName(characters, b.characterId)}</span>
                      <span className="text-list-content">{toSingleLine(b.text[language] ?? "") || "(kein Text)"}</span>
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        </>
      )}
      <button onClick={onClose}>Schließen</button>
    </div>
  );
}
