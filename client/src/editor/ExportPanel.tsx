import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import type { LanguageDef } from "../../../shared/src/languages";
import { api } from "../api/client";
import type { PageSelection, PageSelectionMode } from "../export/pageSelection";
import { parseCustomSelection, PageSelectionError } from "../export/pageSelection";
import type { RasterExportOptions, RasterImageFormat } from "../export/renderPageToPng";
import { suggestUniformTarget } from "../export/uniformFormat";
import { COMIC_PAGE_PRESETS, toPx, type LengthUnit } from "../export/finalFormat";
import type { FinalFormatOptions } from "../export/useExportRun";

export type ExportFormat = "png" | "uniform" | "final-format" | "print" | "vector-pdf" | "psd";
export type PdfXVersion = "x1a" | "x4";
const DEFAULT_FINAL_FORMAT_DPI = 300;

// Resolution presets relative to the page's native pixel size — kept modest (0.25x-3x) since
// upscaling beyond the source image's real detail just produces a larger, not sharper, file.
const RESOLUTION_SCALES = [0.25, 0.5, 1, 1.5, 2, 3] as const;

interface Props {
  volumeId: string;
  languages: LanguageDef[];
  /** Omitted in views with no single active page (e.g. the volume overview) — hides the "Aktuelle Seite" option. */
  currentPage?: string;
  exporting: boolean;
  /** `pdfxVersion` is only meaningful when `format === "vector-pdf"`; `imageOptions` only when
   * `format === "png"`/`"final-format"`; `finalFormatOptions` only when `format === "final-format"`
   * — always passed for a uniform signature, ignored otherwise by callers. */
  onExport: (
    selection: PageSelection,
    onlyTranslated: boolean,
    languageFilter: "all" | string,
    format: ExportFormat,
    pdfxVersion: PdfXVersion,
    imageOptions: RasterExportOptions,
    finalFormatOptions?: FinalFormatOptions
  ) => void;
  /** Only called for `format === "uniform"` — the caller runs a distortion analysis
   * first (see useNormalizeRun.ts's analyze()) before any page is actually rendered,
   * since a page whose aspect ratio deviates too much needs a user decision first. */
  onAnalyzeUniform: (
    selection: PageSelection,
    onlyTranslated: boolean,
    languageFilter: "all" | string,
    targetWidth: number,
    targetHeight: number,
    imageOptions: RasterExportOptions
  ) => void;
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

export function ExportPanel({ volumeId, languages, currentPage, exporting, onExport, onAnalyzeUniform, onClose }: Props) {
  const { t } = useTranslation();
  const [mode, setMode] = useState<PageSelectionMode>(currentPage ? "current" : "all");
  const [rangeFrom, setRangeFrom] = useState(1);
  const [rangeTo, setRangeTo] = useState(1);
  const [custom, setCustom] = useState("");
  const [onlyTranslated, setOnlyTranslated] = useState(false);
  const [languageFilter, setLanguageFilter] = useState<"all" | string>("all");
  const [format, setFormat] = useState<ExportFormat>("png");
  const [pdfxVersion, setPdfxVersion] = useState<PdfXVersion>("x4");
  const [imageFormat, setImageFormat] = useState<RasterImageFormat>("png");
  const [scale, setScale] = useState(1);
  const [quality, setQuality] = useState(92);
  const [targetWidth, setTargetWidth] = useState(0);
  const [targetHeight, setTargetHeight] = useState(0);
  const [targetSuggested, setTargetSuggested] = useState(false);
  const [unit, setUnit] = useState<LengthUnit>("mm");
  const [finalWidth, setFinalWidth] = useState(COMIC_PAGE_PRESETS[0].widthMm);
  const [finalHeight, setFinalHeight] = useState(COMIC_PAGE_PRESETS[0].heightMm);
  const [margin, setMargin] = useState(10);
  const [dpi, setDpi] = useState(DEFAULT_FINAL_FORMAT_DPI);

  // The target size is only meaningful once — computed lazily on first switch to
  // "uniform" so opening the panel for any other format never pays for a listPages()
  // round-trip. Still overwritable by hand afterwards.
  useEffect(() => {
    if (format !== "uniform" || targetSuggested) return;
    setTargetSuggested(true);
    api.listPages(volumeId).then((pages) => {
      const suggestion = suggestUniformTarget(pages);
      setTargetWidth(suggestion.width);
      setTargetHeight(suggestion.height);
    });
  }, [format, targetSuggested, volumeId]);

  let customError: string | null = null;
  if (mode === "custom") {
    try {
      parseCustomSelection(custom);
    } catch (e) {
      customError = translateSelectionError(e, t);
    }
  }

  // Recomputed on every render from the physical inputs — cheap, and keeps the live
  // pixel-size hint (and validation) always in sync with width/height/margin/dpi/unit.
  const finalWidthPx = Math.round(toPx(finalWidth, unit, dpi));
  const finalHeightPx = Math.round(toPx(finalHeight, unit, dpi));
  const finalMarginPx = Math.round(toPx(margin, unit, dpi));
  const finalFormatMarginTooLarge = finalMarginPx * 2 >= finalWidthPx || finalMarginPx * 2 >= finalHeightPx;

  const canSubmit =
    !exporting &&
    (mode !== "custom" || customError === null) &&
    (format !== "uniform" || (targetWidth > 0 && targetHeight > 0)) &&
    (format !== "final-format" || (finalWidthPx > 0 && finalHeightPx > 0 && !finalFormatMarginTooLarge));

  function convertLength(value: number, from: LengthUnit, to: LengthUnit): number {
    if (from === to) return value;
    const mm = from === "mm" ? value : value * 25.4;
    return Math.round((to === "mm" ? mm : mm / 25.4) * 100) / 100;
  }

  function handleUnitChange(nextUnit: LengthUnit) {
    if (nextUnit === unit) return;
    setFinalWidth((w) => convertLength(w, unit, nextUnit));
    setFinalHeight((h) => convertLength(h, unit, nextUnit));
    setMargin((m) => convertLength(m, unit, nextUnit));
    setUnit(nextUnit);
  }

  function applyPreset(preset: (typeof COMIC_PAGE_PRESETS)[number]) {
    setFinalWidth(convertLength(preset.widthMm, "mm", unit));
    setFinalHeight(convertLength(preset.heightMm, "mm", unit));
  }

  function buildSelection(): PageSelection {
    if (mode === "range") return { mode, rangeFrom, rangeTo };
    if (mode === "custom") return { mode, custom };
    return { mode };
  }

  function handleSubmit() {
    if (!canSubmit) return;
    const imageOptions: RasterExportOptions = { format: imageFormat, scale, quality: quality / 100 };
    if (format === "uniform") {
      onAnalyzeUniform(buildSelection(), onlyTranslated, languageFilter, targetWidth, targetHeight, imageOptions);
      return;
    }
    if (format === "final-format") {
      onExport(buildSelection(), onlyTranslated, languageFilter, format, pdfxVersion, imageOptions, {
        targetWidthPx: finalWidthPx,
        targetHeightPx: finalHeightPx,
        marginPx: finalMarginPx,
      });
      return;
    }
    onExport(buildSelection(), onlyTranslated, languageFilter, format, pdfxVersion, imageOptions);
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
        <button className={format === "uniform" ? "active" : ""} onClick={() => setFormat("uniform")}>
          {t("exportPanel.formatUniform")}
        </button>
        <button className={format === "final-format" ? "active" : ""} onClick={() => setFormat("final-format")}>
          {t("exportPanel.formatFinalFormat")}
        </button>
        <button className={format === "print" ? "active" : ""} onClick={() => setFormat("print")}>
          {t("exportPanel.formatPrint")}
        </button>
        <button className={format === "vector-pdf" ? "active" : ""} onClick={() => setFormat("vector-pdf")}>
          {t("exportPanel.formatVectorPdf")}
        </button>
        <button className={format === "psd" ? "active" : ""} onClick={() => setFormat("psd")}>
          {t("exportPanel.formatPsd")}
        </button>
      </div>
      {(format === "png" || format === "uniform" || format === "final-format") && (
        <>
          <label>{t("exportPanel.imageFormatLabel")}</label>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            <button className={imageFormat === "png" ? "active" : ""} onClick={() => setImageFormat("png")}>
              {t("exportPanel.imageFormatPng")}
            </button>
            <button className={imageFormat === "jpeg" ? "active" : ""} onClick={() => setImageFormat("jpeg")}>
              {t("exportPanel.imageFormatJpeg")}
            </button>
            <button className={imageFormat === "webp" ? "active" : ""} onClick={() => setImageFormat("webp")}>
              {t("exportPanel.imageFormatWebp")}
            </button>
          </div>

          {format === "png" && (
            <label>
              {t("exportPanel.resolutionLabel")}
              <select value={scale} onChange={(e) => setScale(Number(e.target.value))}>
                {RESOLUTION_SCALES.map((s) => (
                  <option key={s} value={s}>
                    {s}x{s === 1 ? ` (${t("exportPanel.resolutionNative")})` : ""}
                  </option>
                ))}
              </select>
            </label>
          )}

          {format === "uniform" && (
            <>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <label style={{ flex: 1 }}>
                  {t("exportPanel.targetWidthLabel")}
                  <input type="number" min={1} value={targetWidth} onChange={(e) => setTargetWidth(Number(e.target.value))} />
                </label>
                <label style={{ flex: 1 }}>
                  {t("exportPanel.targetHeightLabel")}
                  <input type="number" min={1} value={targetHeight} onChange={(e) => setTargetHeight(Number(e.target.value))} />
                </label>
              </div>
              <p style={{ color: "var(--text-muted)", margin: "-4px 0 0", fontSize: 12 }}>{t("exportPanel.uniformHint")}</p>
            </>
          )}

          {format === "final-format" && (
            <>
              <label>{t("exportPanel.unitLabel")}</label>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                <button className={unit === "mm" ? "active" : ""} onClick={() => handleUnitChange("mm")}>
                  {t("exportPanel.unitMm")}
                </button>
                <button className={unit === "inch" ? "active" : ""} onClick={() => handleUnitChange("inch")}>
                  {t("exportPanel.unitInch")}
                </button>
              </div>

              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {COMIC_PAGE_PRESETS.map((preset) => (
                  <button key={preset.labelKey} onClick={() => applyPreset(preset)}>
                    {t(`exportPanel.${preset.labelKey}`)}
                  </button>
                ))}
              </div>

              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <label style={{ flex: 1 }}>
                  {t("exportPanel.finalWidthLabel")}
                  <input type="number" min={0} step={0.1} value={finalWidth} onChange={(e) => setFinalWidth(Number(e.target.value))} />
                </label>
                <label style={{ flex: 1 }}>
                  {t("exportPanel.finalHeightLabel")}
                  <input type="number" min={0} step={0.1} value={finalHeight} onChange={(e) => setFinalHeight(Number(e.target.value))} />
                </label>
              </div>

              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <label style={{ flex: 1 }}>
                  {t("exportPanel.marginLabel")}
                  <input type="number" min={0} step={0.1} value={margin} onChange={(e) => setMargin(Number(e.target.value))} />
                </label>
                <label style={{ flex: 1 }}>
                  {t("exportPanel.dpiLabel")}
                  <input type="number" min={1} value={dpi} onChange={(e) => setDpi(Number(e.target.value))} />
                </label>
              </div>

              <p style={{ color: "var(--text-muted)", margin: "-4px 0 0", fontSize: 12 }}>
                {t("exportPanel.finalFormatPixelHint", { width: finalWidthPx, height: finalHeightPx, margin: finalMarginPx })}
              </p>
              {finalFormatMarginTooLarge && (
                <p style={{ color: "#ff8a95", margin: "-4px 0 0", fontSize: 12 }}>{t("exportPanel.finalFormatMarginTooLarge")}</p>
              )}
            </>
          )}

          {imageFormat !== "png" && (
            <label>
              {t("exportPanel.qualityLabel", { value: quality })}
              <input type="range" min={10} max={100} step={1} value={quality} onChange={(e) => setQuality(Number(e.target.value))} />
            </label>
          )}
        </>
      )}
      {format === "print" && (
        <p style={{ color: "var(--text-muted)", margin: "-4px 0 0", fontSize: 12 }}>{t("exportPanel.formatPrintHint")}</p>
      )}
      {format === "psd" && (
        <p style={{ color: "var(--text-muted)", margin: "-4px 0 0", fontSize: 12 }}>{t("exportPanel.formatPsdHint")}</p>
      )}
      {format === "vector-pdf" && (
        <>
          <label>{t("exportPanel.pdfxVersionLabel")}</label>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            <button className={pdfxVersion === "x1a" ? "active" : ""} onClick={() => setPdfxVersion("x1a")}>
              PDF/X-1a
            </button>
            <button className={pdfxVersion === "x4" ? "active" : ""} onClick={() => setPdfxVersion("x4")}>
              PDF/X-4
            </button>
          </div>
          <p style={{ color: "var(--text-muted)", margin: "-4px 0 0", fontSize: 12 }}>{t("exportPanel.formatVectorPdfHint")}</p>
        </>
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
