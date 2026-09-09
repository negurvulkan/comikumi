import { useState } from "react";
import { useTranslation } from "react-i18next";
import { api, type AiMangaPublishJob } from "../api/client";
import { translateApiError } from "../i18n/translateApiError";
import { ensureFontsLoaded } from "../editor/fontLoader";
import { renderPageToPng } from "./renderPageToPng";
import { pollPublishJob } from "./pollPublishJob";

/** Same crossOrigin="use-credentials" HTMLImageElement loader as useExportRun.ts's own
 * private loadHtmlImage() — duplicated rather than imported since that one isn't
 * exported and this hook needs the identical page-rendering pipeline as the normal PNG
 * export path (see the connector-subsystem plan's "rasterization stays client-side"
 * decision), not a new one. */
function loadHtmlImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "use-credentials";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Bild konnte nicht geladen werden: ${url.replace(/([?&]token=)[^&]+/, "$1***")}`));
    img.src = url;
  });
}

export interface PublishChapterInput {
  pages: string[]; // page ids, in reading order
  languageCode: string;
  seriesTitle: string;
  sourceLanguage: string;
  synopsis?: string;
  genres?: string[];
  chapterNumber: number;
  chapterTitle: string;
  published: boolean;
  accessMode: "free" | "paid";
  includeCover: boolean;
}

/** Drives the Publish panel's render+upload flow — same client-renders/server-assembles
 * split as useExportRun.ts's "png" branch (renderPageToPng + POST the blob), just
 * collecting every page's blob first and sending them together to
 * api.publishToAiManga() instead of one POST per page, since the server needs the
 * whole chapter at once to build a single ZIP (see server/src/lib/connectors/
 * aiMangaConnector.ts's package contract). */
export function usePublishRun(volumeId: string) {
  const { t } = useTranslation();
  const [publishing, setPublishing] = useState(false);
  const [publishMsg, setPublishMsg] = useState<string | null>(null);
  const [job, setJob] = useState<AiMangaPublishJob | null>(null);

  async function runPublish(input: PublishChapterInput): Promise<void> {
    if (input.pages.length === 0) return;
    setPublishing(true);
    setPublishMsg(null);
    setJob(null);
    try {
      await ensureFontsLoaded();
      const presets = await api.listPresets();
      const blobs: Blob[] = [];
      for (const pageId of input.pages) {
        const layout = await api.getLayout(volumeId, pageId);
        const img = await loadHtmlImage(api.pageImageUrl(volumeId, pageId));
        const blob = await renderPageToPng(img, layout, input.languageCode, (fileName) => loadHtmlImage(api.imagesFileUrl(fileName)), presets);
        blobs.push(blob);
        setPublishMsg(t("publishPanel.renderingProgress", { count: blobs.length, total: input.pages.length }));
      }
      setPublishMsg(t("publishPanel.uploading"));
      const { jobId } = await api.publishToAiManga(
        volumeId,
        {
          seriesTitle: input.seriesTitle,
          sourceLanguage: input.sourceLanguage,
          synopsis: input.synopsis,
          genres: input.genres,
          chapterNumber: input.chapterNumber,
          chapterTitle: input.chapterTitle,
          published: input.published,
          accessMode: input.accessMode,
        },
        blobs,
        input.includeCover ? blobs[0] : null
      );
      const finished = await pollPublishJob(volumeId, jobId, (progress) => {
        setJob(progress);
        setPublishMsg(t(`publishPanel.status.${progress.status}`));
      });
      setJob(finished);
      setPublishMsg(finished.status === "published" ? t("publishPanel.published", { url: finished.publicUrl }) : t("publishPanel.failed", { error: finished.error }));
    } catch (e) {
      setPublishMsg(translateApiError(e, t));
    } finally {
      setPublishing(false);
    }
  }

  return { publishing, publishMsg, job, runPublish };
}
