import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { LanguageDef } from "../../../shared/src/languages";
import type { PageSelection, PageSelectionMode } from "../export/pageSelection";
import { parseCustomSelection, PageSelectionError } from "../export/pageSelection";

export type ExportFormat = "png" | "print";

interface Props {
  languages: LanguageDef[];
  /** Omitted in views with no single active page (e.g. the volume overview) — hides the "Aktuelle Seite" option. */
  currentPage?: string;
  exporting: boolean;
  onExport: (selection: PageSelection, onlyTranslated: boolean, languageFilter: "all" | string, format: ExportFormat) => void;
  onClose: () => void;
}

const MODE_LABEL_KEYS: Record<PageSelectionMode, string> = {
  current: "exportPanel.modeCurrent",
  all: "exportPanel.modeAll",
  even: "exportPanel.modeEven",
  odd: "exportPanel.modeOdd",
  range: "exportPanel.modeRange",
  custom: "exportPanel.modeCustom",
};

function translateSelectionError(err: unknown, t: (key: string, params?: Record<string, string>) => string): string {
  if (err instanceof PageSelectionError) return t(`exportPanel.errors.${err.code}`, err.params);
  return err instanceof Error ? err.message : String(err);
}

export function ExportPanel({ languages, currentPage, exporting, onExport, onClose }: Props) {
  const { t } = useTranslation();
  const [mode, setMode] = useState<PageSelectionMode>(currentPage ? "current" : "all");
  const [rangeFrom, setRangeFrom] = useState(1);
  const [rangeTo, setRangeTo] = useState(1);
  const [custom, setCustom] = useState("");
  const [onlyTranslated, setOnlyTranslated] = useState(false);
  const [languageFilter, setLanguageFilter] = useState<"all" | string>("all");
  const [format, setFormat] = useState<ExportFormat>("png");

  let customError: string | null = null;
  if (mode === "custom") {
    try {
      parseCustomSelection(custom);
    } catch (e) {
      customError = translateSelectionError(e, t);
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
    onExport(buildSelection(), onlyTranslated, languageFilter, format);
  }

  return (
    <div className="inspector" style={{ maxWidth: 340 }}>
      <p style={{ margin: 0, fontWeight: 600 }}>{t("exportPanel.title")}</p>

      <label>{t("exportPanel.pagesLabel")}</label>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
        {(Object.keys(MODE_LABEL_KEYS) as PageSelectionMode[])
          .filter((m) => m !== "current" || !!currentPage)
          .map((m) => (
            <button key={m} className={mode === m ? "active" : ""} onClick={() => setMode(m)}>
              {t(MODE_LABEL_KEYS[m])}
            </button>
          ))}
      </div>

      {mode === "current" && currentPage && (
        <p style={{ color: "var(--text-muted)", margin: "-4px 0 0", fontSize: 12 }}>
          {t("exportPanel.onlyPage", { page: currentPage })}
        </p>
      )}

      {mode === "range" && (
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <label style={{ flex: 1 }}>
            {t("exportPanel.fromPage")}
            <input type="number" min={1} value={rangeFrom} onChange={(e) => setRangeFrom(Number(e.target.value))} />
          </label>
          <label style={{ flex: 1 }}>
            {t("exportPanel.toPage")}
            <input type="number" min={1} value={rangeTo} onChange={(e) => setRangeTo(Number(e.target.value))} />
          </label>
        </div>
      )}

      {mode === "custom" && (
        <label>
          {t("exportPanel.customLabel")}
          <input type="text" value={custom} onChange={(e) => setCustom(e.target.value)} placeholder="1,3,5,10-14" />
        </label>
      )}
      {customError && (
        <p style={{ color: "#ff8a95", margin: "-4px 0 0", fontSize: 12 }}>{customError}</p>
      )}

      <label style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <input type="checkbox" checked={onlyTranslated} onChange={(e) => setOnlyTranslated(e.target.checked)} />
        {t("exportPanel.onlyTranslated")}
      </label>

      <label>
        {t("exportPanel.languageLabel")}
        <select value={languageFilter} onChange={(e) => setLanguageFilter(e.target.value)}>
          <option value="all">{t("exportPanel.allLanguages")}</option>
          {languages.map((l) => (
            <option key={l.code} value={l.code}>
              {l.label}
            </option>
          ))}
        </select>
      </label>

      <label>{t("exportPanel.formatLabel")}</label>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
        <button className={format === "png" ? "active" : ""} onClick={() => setFormat("png")}>
          {t("exportPanel.formatPng")}
        </button>
        <button className={format === "print" ? "active" : ""} onClick={() => setFormat("print")}>
          {t("exportPanel.formatPrint")}
        </button>
      </div>
      {format === "print" && (
        <p style={{ color: "var(--text-muted)", margin: "-4px 0 0", fontSize: 12 }}>{t("exportPanel.formatPrintHint")}</p>
      )}

      <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
        <button className="primary" onClick={handleSubmit} disabled={!canSubmit}>
          {exporting ? t("exportPanel.exporting") : t("exportPanel.exportButton")}
        </button>
        <button onClick={onClose} disabled={exporting}>
          {t("common.close")}
        </button>
      </div>
    </div>
  );
}
