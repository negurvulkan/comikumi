import { useState } from "react";
import { useTranslation } from "react-i18next";
import { translateApiError } from "../i18n/translateApiError";
import { api } from "../api/client";
import { runCleanupDetection } from "./workerClient";

export interface CleanBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Busy/progress state for one Cleaning/Inpainting run on the current page — same
 * shape as useAutoBubblesRun.ts (running boolean + a translated status string, try/
 * catch/finally), but TWO review-gated stages instead of one:
 *
 * 1. `pendingBoxes` — the auto-detected regions (same client-side detector as
 *    Auto-Bubbles, see runCleanupDetection()), shown in CleanPageMaskEditor.tsx for
 *    the user to add/move/resize/delete BEFORE anything runs server-side. Detection
 *    boxes only cover the TEXT a model found, not necessarily the whole bubble
 *    (outline, tail) — letting the user extend the marked area directly addresses
 *    that gap, not something automatic re-detection can fix. Always shown, even when
 *    detection found nothing (an all-manual page is a valid starting point too).
 * 2. `pendingPreviewUrl` — the actual server-reconstructed before/after result, once
 *    the user confirms the mask in step 1 (see confirmMask()), shown in
 *    CleanPageReviewPanel.tsx.
 *
 * Nothing is written to the layout (not even `useCleanedBackground`) until the user
 * explicitly confirms the FINAL before/after review — same "propose, then a separate
 * confirm actually commits it" principle as every other automation this session. */
export function useCleanPageRun(volumeId: string, page: string) {
  const { t } = useTranslation();
  const [running, setRunning] = useState(false);
  const [progressMsg, setProgressMsg] = useState<string | null>(null);
  const [pendingBoxes, setPendingBoxes] = useState<CleanBox[] | null>(null);
  const [pendingPreviewUrl, setPendingPreviewUrl] = useState<string | null>(null);

  /** Runs detection and opens the mask editor — never calls the (expensive) server
   * reconstruction itself. */
  async function start(imageBitmap: ImageBitmap) {
    setRunning(true);
    setProgressMsg(null);
    try {
      const regions = await runCleanupDetection(imageBitmap, (stage, current, total) => {
        setProgressMsg(t(`ocr.progress.${stage}`, { current, total }));
      });
      setPendingBoxes(regions.map((r) => ({ x: r.x, y: r.y, width: r.width, height: r.height })));
    } catch (e) {
      setProgressMsg(translateApiError(e, t));
    } finally {
      setRunning(false);
    }
  }

  /** The mask editor's "Weiter" action — runs the actual (slow) server-side
   * reconstruction over the user-confirmed box list and stages the result as
   * `pendingPreviewUrl`. A no-op-ish empty `boxes` list still round-trips through the
   * server (cleanPage() just copies the source through, see inpainting.ts), so
   * CleanPageReviewPanel's before/after still works consistently even if the user
   * removed every box. */
  async function confirmMask(boxes: CleanBox[]) {
    setPendingBoxes(null);
    setRunning(true);
    setProgressMsg(t("editor.cleanPage.reconstructing"));
    try {
      await api.cleanPage(volumeId, page, boxes);
      // Cache-bust: the server may have cleaned this exact page before (same URL),
      // and the browser's own HTTP cache (see the route's maxAge) would otherwise
      // serve the stale prior result instead of the one just generated. The base URL
      // always already has a "?token=..." query param (see api/authFetch.ts's
      // authUrl()) when logged in, but don't assume that — pick the right separator.
      const baseUrl = api.cleanedImageUrl(volumeId, page);
      const separator = baseUrl.includes("?") ? "&" : "?";
      setPendingPreviewUrl(`${baseUrl}${separator}t=${Date.now()}`);
    } catch (e) {
      setProgressMsg(translateApiError(e, t));
    } finally {
      setRunning(false);
    }
  }

  /** Discards the pending mask edit without running anything server-side. */
  function cancelMask() {
    setPendingBoxes(null);
  }

  /** Discards the pending preview without touching the layout — the review panel's
   * "Cancel"/"Verwerfen" action. The already-generated cache file on the server is
   * left as-is (harmless, cheap to regenerate/overwrite on the next attempt). */
  function cancelPreview() {
    setPendingPreviewUrl(null);
  }

  return { running, progressMsg, pendingBoxes, pendingPreviewUrl, start, confirmMask, cancelMask, cancelPreview };
}
