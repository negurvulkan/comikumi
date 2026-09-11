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
  synopsis?: string;
  genres?: string[];
  /** The specific ResolvedChapter (shared/src/pageMeta.ts) being published within
   * `volumeId` — see shared/src/connectors.ts's aiMangaChapterKey() doc comment. */
  chapterId: string;
  chapterNumber: number;
  chapterTitle: string;
  published: boolean;
  accessMode: "free" | "supporter_only";
}

/** Drives the Publish panel's render+upload flow — same client-renders/server-assembles
 * split as useExportRun.ts's "png" branch (renderPageToPng + POST the blob), just
 * collecting every page's blob first and sending them together to
 * api.publishToAiManga() instead of one POST per page, since the server needs the
 * whole chapter at once to build a single ZIP (see server/src/lib/connectors/
 * aiMangaConnector.ts's package contract). No cover is ever synthesized from a page —
 * AI MANGA already falls back to the chapter's first page when none is supplied (see
 * the developer guide's package contract), so sending one derived from the same first
 * page again would be redundant, not more correct.
 */
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
          languageCode: input.languageCode,
          synopsis: input.synopsis,
          genres: input.genres,
          chapterId: input.chapterId,
          chapterNumber: input.chapterNumber,
          chapterTitle: input.chapterTitle,
          published: input.published,
          accessMode: input.accessMode,
        },
        blobs
      );
      const finished = await pollPublishJob(volumeId, jobId, (progress) => {
        setJob(progress);
        setPublishMsg(t(`publishPanel.status.${progress.status}`));
      });
      setJob(finished);
      if (finished.status === "published") {
        // "published" also covers a successfully validated DRAFT — AI MANGA's exact
        // status string for that case isn't documented (see PublishStatusState's own
        // doc comment server-side), so a missing publicUrl is the signal to show the
        // more neutral "completed" message instead of implying a public page exists.
        setPublishMsg(finished.publicUrl ? t("publishPanel.published", { url: finished.publicUrl }) : t("publishPanel.completed"));
      } else {
        setPublishMsg(t("publishPanel.failed", { error: finished.error }));
      }
    } catch (e) {
      setPublishMsg(translateApiError(e, t));
    } finally {
      setPublishing(false);
    }
  }

  return { publishing, publishMsg, job, runPublish };
}
