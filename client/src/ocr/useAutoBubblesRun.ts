import { useState } from "react";
import { useTranslation } from "react-i18next";
import { translateApiError } from "../i18n/translateApiError";
import { runAutoBubbles } from "./workerClient";
import type { DetectedRegion } from "./types";

/** Busy/progress state for one Auto-Bubbles detection run — same shape as
 * export/useExportRun.ts's `exporting`/`exportMsg` (running boolean + a translated
 * status string, try/catch/finally). The critical difference: the result never
 * touches editorStore directly — it's staged into `pendingRegions` for the review
 * panel, which is the only thing allowed to call addBubbles() (see
 * AutoBubblesReviewPanel.tsx), so a detection run can never silently write to the
 * layout. */
export function useAutoBubblesRun() {
  const { t } = useTranslation();
  const [running, setRunning] = useState(false);
  const [progressMsg, setProgressMsg] = useState<string | null>(null);
  /** current/total for a real progress bar, whenever the active stage reports a known
   * total (bytes-as-MB for "downloading-models", region count for "recognizing") — null
   * while a stage has no meaningful fraction yet (e.g. "detecting", or "downloading-
   * models" before any Content-Length is known), so LoadingIndicator falls back to an
   * indeterminate spinner instead of showing a stuck/wrong bar. */
  const [progress, setProgress] = useState<{ current: number; total: number } | null>(null);
  const [pendingRegions, setPendingRegions] = useState<DetectedRegion[] | null>(null);

  async function start(imageBitmap: ImageBitmap) {
    setRunning(true);
    setProgressMsg(null);
    setProgress(null);
    try {
      const regions = await runAutoBubbles(imageBitmap, (stage, current, total) => {
        // "downloading-models" reports current/total in MB and 0 total means "size
        // unknown" (no Content-Length header) — the "-unknown" i18n key drops the
        // "/{{total}} MB" half instead of showing "/0 MB".
        const key = stage === "downloading-models" && total <= 0 ? "ocr.progress.downloading-models-unknown" : `ocr.progress.${stage}`;
        setProgressMsg(t(key, { current, total }));
        setProgress(total > 0 ? { current, total } : null);
      });
      setProgress(null);
      if (regions.length === 0) {
        setProgressMsg(t("ocr.noneFound"));
      } else {
        setPendingRegions(regions);
      }
    } catch (e) {
      setProgress(null);
      setProgressMsg(translateApiError(e, t));
    } finally {
      setRunning(false);
    }
  }

  /** Discards pending detections without touching the layout — the review panel's
   * "Cancel" action. */
  function cancel() {
    setPendingRegions(null);
  }

  return { running, progressMsg, progress, pendingRegions, start, cancel, setPendingRegions };
}
