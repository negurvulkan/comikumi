import { useState } from "react";
import type { LanguageDef } from "../../../shared/src/languages";
import type { PageSelection, PageSelectionMode } from "../export/pageSelection";
import { parseCustomSelection } from "../export/pageSelection";

interface Props {
  languages: LanguageDef[];
  /** Omitted in views with no single active page (e.g. the volume overview) — hides the "Aktuelle Seite" option. */
  currentPage?: string;
  exporting: boolean;
  onExport: (selection: PageSelection, onlyTranslated: boolean, languageFilter: "all" | string) => void;
  onClose: () => void;
}

const MODE_LABELS: Record<PageSelectionMode, string> = {
  current: "Aktuelle Seite",
  all: "Alle Seiten",
  even: "Gerade Seiten",
  odd: "Ungerade Seiten",
  range: "Bereich",
  custom: "Eigene Auswahl",
};

export function ExportPanel({ languages, currentPage, exporting, onExport, onClose }: Props) {
  const [mode, setMode] = useState<PageSelectionMode>(currentPage ? "current" : "all");
  const [rangeFrom, setRangeFrom] = useState(1);
  const [rangeTo, setRangeTo] = useState(1);
  const [custom, setCustom] = useState("");
  const [onlyTranslated, setOnlyTranslated] = useState(false);
  const [languageFilter, setLanguageFilter] = useState<"all" | string>("all");

  let customError: string | null = null;
  if (mode === "custom") {
    try {
      parseCustomSelection(custom);
    } catch (e) {
      customError = (e as Error).message;
    }
  }
  const canSubmit = !exporting && (mode !== "custom" || customError === null);

  function buildSelection(): PageSelection {
    if (mode === "range") return { mode, rangeFrom, rangeTo };
    if (mode === "custom") return { mode, custom };
    return { mode };
  }

  function handleSubmit() {
    if (!canSubmit) return;
    onExport(buildSelection(), onlyTranslated, languageFilter);
  }

  return (
    <div className="inspector" style={{ maxWidth: 340 }}>
      <p style={{ margin: 0, fontWeight: 600 }}>Export</p>

      <label>Seiten</label>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
        {(Object.keys(MODE_LABELS) as PageSelectionMode[])
          .filter((m) => m !== "current" || !!currentPage)
          .map((m) => (
            <button key={m} className={mode === m ? "active" : ""} onClick={() => setMode(m)}>
              {MODE_LABELS[m]}
            </button>
          ))}
      </div>

      {mode === "current" && currentPage && (
        <p style={{ color: "var(--text-muted)", margin: "-4px 0 0", fontSize: 12 }}>Nur „{currentPage}".</p>
      )}

      {mode === "range" && (
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <label style={{ flex: 1 }}>
            von Seite
            <input type="number" min={1} value={rangeFrom} onChange={(e) => setRangeFrom(Number(e.target.value))} />
          </label>
          <label style={{ flex: 1 }}>
            bis Seite
            <input type="number" min={1} value={rangeTo} onChange={(e) => setRangeTo(Number(e.target.value))} />
          </label>
        </div>
      )}

      {mode === "custom" && (
        <label>
          Seitenzahlen (z. B. 1,3,5,10-14)
          <input type="text" value={custom} onChange={(e) => setCustom(e.target.value)} placeholder="1,3,5,10-14" />
        </label>
      )}
      {customError && (
        <p style={{ color: "#ff8a95", margin: "-4px 0 0", fontSize: 12 }}>{customError}</p>
      )}

      <label style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <input type="checkbox" checked={onlyTranslated} onChange={(e) => setOnlyTranslated(e.target.checked)} />
        Nur Seiten mit Übersetzung
      </label>

      <label>
        Sprache
        <select value={languageFilter} onChange={(e) => setLanguageFilter(e.target.value)}>
          <option value="all">Alle Sprachen</option>
          {languages.map((l) => (
            <option key={l.code} value={l.code}>
              {l.label}
            </option>
          ))}
        </select>
      </label>

      <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
        <button className="primary" onClick={handleSubmit} disabled={!canSubmit}>
          {exporting ? "Exportiert…" : "Exportieren"}
        </button>
        <button onClick={onClose} disabled={exporting}>
          Schließen
        </button>
      </div>
    </div>
  );
}
