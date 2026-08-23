import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { LanguageDef } from "../../../shared/src/languages";
import type { PageLayout } from "../../../shared/src/layoutSchema";
import { api } from "../api/client";
import { translateApiError } from "../i18n/translateApiError";
import { ensureFontsLoaded } from "../editor/fontLoader";
import { renderPageToPng } from "./renderPageToPng";
import { selectPages, type PageSelection } from "./pageSelection";
import type { ExportFormat, PdfXVersion } from "../editor/ExportPanel";

// A page counts as "translated" for a language if at least one bubble has
// non-empty text for it, or a placed image has a file assigned for it —
// pages that are still fully blank for that language should be skipped by
// the "nur übersetzte Seiten" export instead of writing an empty-looking PNG.
export function pageHasTranslation(layout: PageLayout, languageCode: string): boolean {
  return (
    layout.bubbles.some((b) => (b.text[languageCode] ?? "").trim().length > 0) ||
    layout.images.some((img) => !!img.files[languageCode]) ||
    layout.curvedTexts.some((el) => (el.text[languageCode] ?? "").trim().length > 0)
  );
}

function loadHtmlImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = url;
  });
}

/**
 * Drives the ExportPanel's actual render+upload loop — shared by Editor.tsx
 * (single-page view, has a `page`/`layout` already loaded) and PageGrid.tsx
 * (volume overview, no page loaded at all). `preloadedLayout` lets the caller
 * skip a redundant getLayout() round-trip for a page it already has in memory.
 */
export function useExportRun(volumeId: string, languages: LanguageDef[]) {
  const { t } = useTranslation();
  const [exporting, setExporting] = useState(false);
  const [exportMsg, setExportMsg] = useState<string | null>(null);

  function loadPlacedImage(fileName: string): Promise<HTMLImageElement> {
    return loadHtmlImage(api.imagesFileUrl(fileName));
  }

  async function runExport(
    selection: PageSelection,
    onlyTranslated: boolean,
    languageFilter: "all" | string,
    format: ExportFormat = "png",
    preloadedLayout?: { page: string; layout: PageLayout } | null,
    pdfxVersion: PdfXVersion = "x4"
  ) {
    if (languages.length === 0) return;
    setExporting(true);
    setExportMsg(null);
    try {
      await ensureFontsLoaded();
      const presets = await api.listPresets();
      const pages = await api.listPages(volumeId);
      const selected = selectPages(pages, selection, preloadedLayout?.page ?? "");
      const targetLanguages = languageFilter === "all" ? languages : languages.filter((l) => l.code === languageFilter);
      let exportCount = 0;
      let anyNotPdfxStamped = false;
      for (const p of selected) {
        const pageLayout =
          preloadedLayout && p.page === preloadedLayout.page ? preloadedLayout.layout : await api.getLayout(volumeId, p.page);
        const langsForPage = onlyTranslated ? targetLanguages.filter((l) => pageHasTranslation(pageLayout, l.code)) : targetLanguages;
        if (langsForPage.length === 0) continue;

        if (format === "vector-pdf") {
          // No client-side render at all — the server renders straight from this raw
          // layout JSON so bubble/curved text becomes real PDF vector text (see
          // server/src/lib/vectorPdf/buildPdfPage.ts) instead of a rasterized blob.
          for (const lang of langsForPage) {
            const result = await api.exportVectorPdfPage(volumeId, p.page, lang.folderSuffix, pageLayout, lang.code, pdfxVersion);
            if (!result.pdfxStamped) anyNotPdfxStamped = true;
            exportCount++;
            setExportMsg(t("useExportRun.progress", { count: exportCount }));
          }
          continue;
        }

        if (format === "psd") {
          // Same server-side-rendering pattern as vector-pdf — no client render, the
          // server builds the layered PSD straight from this raw layout JSON.
          for (const lang of langsForPage) {
            await api.exportPsdPage(volumeId, p.page, lang.folderSuffix, pageLayout, lang.code);
            exportCount++;
            setExportMsg(t("useExportRun.progress", { count: exportCount }));
          }
          continue;
        }

        const img = await loadHtmlImage(api.pageImageUrl(volumeId, p.page));
        for (const lang of langsForPage) {
          const blob = await renderPageToPng(img, pageLayout, lang.code, loadPlacedImage, presets);
          if (format === "print") {
            await api.exportPrintPage(volumeId, p.page, lang.folderSuffix, blob);
          } else {
            await api.exportPage(volumeId, p.page, lang.folderSuffix, blob);
          }
          exportCount++;
          setExportMsg(t("useExportRun.progress", { count: exportCount }));
        }
      }
      const doneMsg = exportCount === 0 ? t("useExportRun.noneFound") : t("useExportRun.done", { count: exportCount });
      setExportMsg(anyNotPdfxStamped ? `${doneMsg} ${t("useExportRun.pdfxNotStamped")}` : doneMsg);
    } catch (e) {
      setExportMsg(t("pageGrid.importErrorPrefix", { message: translateApiError(e, t) }));
    } finally {
      setExporting(false);
    }
  }

  return { exporting, exportMsg, setExportMsg, runExport };
}
