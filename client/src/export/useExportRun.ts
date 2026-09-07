import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { LanguageDef } from "../../../shared/src/languages";
import type { PageLayout } from "../../../shared/src/layoutSchema";
import { api } from "../api/client";
import { translateApiError } from "../i18n/translateApiError";
import { ensureFontsLoaded } from "../editor/fontLoader";
import { canvasToBlob, maxSafeRasterScale, renderPageToPng, type RasterExportOptions } from "./renderPageToPng";
import { placeInFinalFormat } from "./finalFormat";
import { selectPages, type PageSelection } from "./pageSelection";
import type { ExportFormat, PdfXVersion } from "../editor/ExportPanel";
import { collectPreferredCuts, collectSliceObstacles, computeSliceCuts, sliceFileName } from "../../../shared/src/webtoonSlicing";

export interface FinalFormatOptions {
  targetWidthPx: number;
  targetHeightPx: number;
  marginPx: number;
}

/** Batch W — Webtoon support: cuts a long strip into multiple, upload-ready segment
 * images instead of one giant file — see shared/src/webtoonSlicing.ts. Only consulted
 * for `format === "png"` — print/final-format/vector-pdf/psd all target a single
 * physical/vector page and slicing them wouldn't mean anything (see ExportPanel.tsx,
 * which also only ever offers this alongside "png"). */
export interface SliceOptions {
  maxHeightPx: number;
  minHeightPx: number;
}

const EXTENSION_BY_IMAGE_FORMAT: Record<NonNullable<RasterExportOptions["format"]>, string> = {
  png: "png",
  jpeg: "jpg",
  webp: "webp",
};

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
    // See useHtmlImage.ts's doc comment — "use-credentials" instead of "anonymous" so
    // the demo broker's session-routing cookie is sent on this cross-origin load too.
    img.crossOrigin = "use-credentials";
    img.onload = () => resolve(img);
    // img.onerror fires with a raw DOM Event, not an Error — translateApiError()
    // only special-cases actual Error instances, so a bare `reject(event)` here would
    // surface as an opaque "[object Event]" instead of something diagnosable. Include
    // the failing URL (with the auth token stripped — see authUrl() — since this
    // message can end up in an error banner the user might screenshot/share).
    img.onerror = () => reject(new Error(`Bild konnte nicht geladen werden: ${url.replace(/([?&]token=)[^&]+/, "$1***")}`));
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
    pdfxVersion: PdfXVersion = "x4",
    /** Only consulted when `format === "png"` — the raster (client-rendered) export path. */
    imageOptions: RasterExportOptions = {},
    /** Only consulted when `format === "final-format"`. */
    finalFormatOptions?: FinalFormatOptions,
    /** Only consulted when `format === "psd"` — see ExportPanel.tsx's checkbox and
     * server/src/lib/psdExport.ts's own doc comment for what this actually does. */
    psdEditableTextLayers = false,
    /** Only consulted when `format === "png"` — see SliceOptions's own doc comment. */
    sliceOptions?: SliceOptions
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
      let sliceWarningCount = 0;
      const slicing = format === "png" && !!sliceOptions;
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
            await api.exportPsdPage(volumeId, p.page, lang.folderSuffix, pageLayout, lang.code, psdEditableTextLayers);
            exportCount++;
            setExportMsg(t("useExportRun.progress", { count: exportCount }));
          }
          continue;
        }

        // Batch W — Webtoon support: every remaining format below rasterizes this page onto
        // an in-memory canvas at SOME resolution multiplier — "png" at whatever the user
        // picked, everything else at native (1x). Checking once here, before the (possibly
        // slow) image load + render even starts, turns a page that's simply too big for the
        // browser's canvas limits into one clear, translated, per-page error instead of the
        // opaque "Bild-Export fehlgeschlagen" canvasToBlob() throws after the fact — see
        // maxSafeRasterScale's own doc comment for why this can happen even outside webtoon
        // support (any sufficiently tall/high-res page), just much more easily with one.
        // Slicing renders each segment at its OWN (much smaller) height — see
        // renderPageToPng's cropHeight doc comment — so the guard below would reject a
        // page it doesn't need to; skip it here and check each segment's own height
        // inside the slicing branch instead.
        const requestedScale = format === "png" ? (imageOptions.scale ?? 1) : 1;
        if (!slicing) {
          const safeScale = maxSafeRasterScale(pageLayout.imageWidth, pageLayout.imageHeight);
          if (requestedScale > safeScale + 1e-9) {
            throw new Error(
              t("useExportRun.errors.resolutionTooLarge", { page: p.page, maxScale: safeScale.toFixed(2) })
            );
          }
        }

        const img = await loadHtmlImage(api.pageImageUrl(volumeId, p.page));
        for (const lang of langsForPage) {
          if (slicing && sliceOptions) {
            // Obstacles/preferred cuts are language-dependent (bubble text, panel
            // language overrides) — computed once per language, not once per page.
            const obstacles = collectSliceObstacles(pageLayout, lang.code, presets);
            const preferredCuts = collectPreferredCuts(pageLayout, lang.code);
            const plan = computeSliceCuts({
              imageHeight: pageLayout.imageHeight,
              maxHeight: sliceOptions.maxHeightPx,
              minHeight: sliceOptions.minHeightPx,
              obstacles,
              preferredCuts,
            });
            sliceWarningCount += plan.warnings.length;
            for (const slice of plan.slices) {
              const safeScale = maxSafeRasterScale(pageLayout.imageWidth, slice.height);
              if (requestedScale > safeScale + 1e-9) {
                throw new Error(
                  t("useExportRun.errors.resolutionTooLarge", { page: sliceFileName(p.page, slice.index), maxScale: safeScale.toFixed(2) })
                );
              }
              const blob = await renderPageToPng(img, pageLayout, lang.code, loadPlacedImage, presets, {
                ...imageOptions,
                cropY: slice.y,
                cropHeight: slice.height,
              });
              const extension = EXTENSION_BY_IMAGE_FORMAT[imageOptions.format ?? "png"];
              await api.exportPage(volumeId, sliceFileName(p.page, slice.index), lang.folderSuffix, blob, extension);
            }
            exportCount++;
            setExportMsg(t("useExportRun.progress", { count: exportCount }));
            continue;
          }
          if (format === "print") {
            // Print export always needs a lossless full-resolution source to convert to CMYK TIFF —
            // the image format/quality/resolution controls are for the "png" web-image path only.
            const blob = await renderPageToPng(img, pageLayout, lang.code, loadPlacedImage, presets);
            await api.exportPrintPage(volumeId, p.page, lang.folderSuffix, blob);
          } else if (format === "final-format" && finalFormatOptions) {
            // Renders at native resolution first (scale left at 1 — the final pixel size
            // comes entirely from the target format + DPI, not a resolution multiplier),
            // then places the result centered inside the target page with a guaranteed
            // margin on all sides (see finalFormat.ts's placeInFinalFormat).
            const rendered = await renderPageToPng(img, pageLayout, lang.code, loadPlacedImage, presets, {
              format: imageOptions.format,
              quality: imageOptions.quality,
            });
            const bitmap = await createImageBitmap(rendered);
            const placed = placeInFinalFormat(
              bitmap,
              bitmap.width,
              bitmap.height,
              finalFormatOptions.targetWidthPx,
              finalFormatOptions.targetHeightPx,
              finalFormatOptions.marginPx
            );
            bitmap.close();
            const imageFormat = imageOptions.format ?? "png";
            const blob = await canvasToBlob(placed, imageFormat, imageOptions.quality);
            await api.exportPage(volumeId, p.page, lang.folderSuffix, blob, EXTENSION_BY_IMAGE_FORMAT[imageFormat]);
          } else {
            const blob = await renderPageToPng(img, pageLayout, lang.code, loadPlacedImage, presets, imageOptions);
            const extension = EXTENSION_BY_IMAGE_FORMAT[imageOptions.format ?? "png"];
            await api.exportPage(volumeId, p.page, lang.folderSuffix, blob, extension);
          }
          exportCount++;
          setExportMsg(t("useExportRun.progress", { count: exportCount }));
        }
      }
      const doneMsg = exportCount === 0 ? t("useExportRun.noneFound") : t("useExportRun.done", { count: exportCount });
      const withPdfx = anyNotPdfxStamped ? `${doneMsg} ${t("useExportRun.pdfxNotStamped")}` : doneMsg;
      setExportMsg(sliceWarningCount > 0 ? `${withPdfx} ${t("useExportRun.sliceWarnings", { count: sliceWarningCount })}` : withPdfx);
    } catch (e) {
      setExportMsg(t("pageGrid.importErrorPrefix", { message: translateApiError(e, t) }));
    } finally {
      setExporting(false);
    }
  }

  return { exporting, exportMsg, setExportMsg, runExport };
}
