import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { LanguageDef } from "../../../shared/src/languages";
import { api, type PageSummary } from "../api/client";
import { translateApiError } from "../i18n/translateApiError";
import { ensureFontsLoaded } from "../editor/fontLoader";
import { canvasToBlob, renderPageToPng, type RasterExportOptions, type RasterImageFormat } from "./renderPageToPng";
import { computeDistortion, resizeToUniformFormat, DISTORTION_WARNING_THRESHOLD, type UniformFitMode } from "./uniformFormat";
import { selectPages, type PageSelection } from "./pageSelection";
import { pageHasTranslation } from "./useExportRun";

const EXTENSION_BY_IMAGE_FORMAT: Record<RasterImageFormat, string> = {
  png: "png",
  jpeg: "jpg",
  webp: "webp",
};

export interface FlaggedPage extends PageSummary {
  distortion: number;
}

export interface NormalizeAnalysis {
  autoPages: PageSummary[];
  flaggedPages: FlaggedPage[];
}

function loadHtmlImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "use-credentials";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Bild konnte nicht geladen werden: ${url.replace(/([?&]token=)[^&]+/, "$1***")}`));
    img.src = url;
  });
}

/**
 * Drives the "uniform format" export path — a variant of useExportRun's PNG export
 * that additionally forces every page onto the same targetWidth×targetHeight, split
 * into two phases so a page whose aspect ratio deviates too much from the target can
 * be flagged for a user decision (see NormalizePreviewDialog.tsx) before anything is
 * actually rendered/uploaded.
 */
export function useNormalizeRun(volumeId: string, languages: LanguageDef[]) {
  const { t } = useTranslation();
  const [exporting, setExporting] = useState(false);
  const [exportMsg, setExportMsg] = useState<string | null>(null);

  async function analyze(selection: PageSelection, currentPage: string, targetWidth: number, targetHeight: number): Promise<NormalizeAnalysis> {
    const pages = await api.listPages(volumeId);
    const selected = selectPages(pages, selection, currentPage);
    const autoPages: PageSummary[] = [];
    const flaggedPages: FlaggedPage[] = [];
    for (const page of selected) {
      const distortion = computeDistortion(page.width, page.height, targetWidth, targetHeight);
      if (distortion > DISTORTION_WARNING_THRESHOLD) flaggedPages.push({ ...page, distortion });
      else autoPages.push(page);
    }
    return { autoPages, flaggedPages };
  }

  function loadPlacedImage(fileName: string): Promise<HTMLImageElement> {
    return loadHtmlImage(api.imagesFileUrl(fileName));
  }

  /**
   * `resolutions` maps a flagged page's `page` id to the fit mode the user picked in
   * the review dialog, or `"skip"` to leave that page out entirely. Pages not present
   * in the map (i.e. `autoPages` from analyze()) default to `"stretch"`, since they
   * were already below the distortion threshold.
   */
  async function run(
    pages: PageSummary[],
    resolutions: Map<string, UniformFitMode | "skip">,
    targetWidth: number,
    targetHeight: number,
    imageOptions: RasterExportOptions,
    languageFilter: "all" | string,
    onlyTranslated: boolean
  ) {
    if (languages.length === 0 || pages.length === 0) return;
    setExporting(true);
    setExportMsg(null);
    const format = imageOptions.format ?? "png";
    const extension = EXTENSION_BY_IMAGE_FORMAT[format];
    try {
      await ensureFontsLoaded();
      const presets = await api.listPresets();
      const targetLanguages = languageFilter === "all" ? languages : languages.filter((l) => l.code === languageFilter);
      let exportCount = 0;
      let skipCount = 0;
      for (const p of pages) {
        const resolution = resolutions.get(p.page) ?? "stretch";
        if (resolution === "skip") {
          skipCount++;
          continue;
        }
        const pageLayout = await api.getLayout(volumeId, p.page);
        const langsForPage = onlyTranslated ? targetLanguages.filter((l) => pageHasTranslation(pageLayout, l.code)) : targetLanguages;
        if (langsForPage.length === 0) continue;

        const img = await loadHtmlImage(api.pageImageUrl(volumeId, p.page));
        for (const lang of langsForPage) {
          const rendered = await renderPageToPng(img, pageLayout, lang.code, loadPlacedImage, presets, { format, quality: imageOptions.quality });
          const renderedBitmap = await createImageBitmap(rendered);
          const resized = resizeToUniformFormat(renderedBitmap, renderedBitmap.width, renderedBitmap.height, targetWidth, targetHeight, resolution);
          renderedBitmap.close();
          const blob = await canvasToBlob(resized, format, imageOptions.quality);
          await api.exportPage(volumeId, p.page, lang.folderSuffix, blob, extension);
          exportCount++;
          setExportMsg(t("useExportRun.progress", { count: exportCount }));
        }
      }
      const doneMsg =
        exportCount === 0
          ? t("useExportRun.noneFound")
          : skipCount > 0
            ? t("normalizePreview.doneWithSkipped", { count: exportCount, skipped: skipCount })
            : t("useExportRun.done", { count: exportCount });
      setExportMsg(doneMsg);
    } catch (e) {
      setExportMsg(t("pageGrid.importErrorPrefix", { message: translateApiError(e, t) }));
    } finally {
      setExporting(false);
    }
  }

  return { exporting, exportMsg, setExportMsg, analyze, run };
}
