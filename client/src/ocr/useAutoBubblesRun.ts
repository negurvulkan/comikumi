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
  const [pendingRegions, setPendingRegions] = useState<DetectedRegion[] | null>(null);

  async function start(imageBitmap: ImageBitmap) {
    setRunning(true);
    setProgressMsg(null);
    try {
      const regions = await runAutoBubbles(imageBitmap, (stage, current, total) => {
        setProgressMsg(t(`ocr.progress.${stage}`, { current, total }));
      });
      if (regions.length === 0) {
        setProgressMsg(t("ocr.noneFound"));
      } else {
        setPendingRegions(regions);
      }
    } catch (e) {
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

  return { running, progressMsg, pendingRegions, start, cancel, setPendingRegions };
}
