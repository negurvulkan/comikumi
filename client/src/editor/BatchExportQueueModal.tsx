import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import type { LanguageDef } from "../../../shared/src/languages";
import { api, type VolumeSummary } from "../api/client";
import { translateApiError } from "../i18n/translateApiError";
import { pollExportJob, type ExportJobResult } from "../export/pollExportJob";
import type { PdfXVersion } from "./ExportPanel";
import { LoadingIndicator } from "./LoadingIndicator";

interface Props {
  volumes: VolumeSummary[];
  onClose: () => void;
}

type QueueFormat = "vector-pdf" | "psd";

interface QueueEntryStatus {
  volumeId: string;
  bookFolderName: string;
  state: "pending" | "running" | "done" | "failed";
  completed: number;
  total: number;
  error?: string;
}

/**
 * Queues a server-rendered export (vector PDF or PSD — the two formats with real
 * per-page server rendering cost, see exportJobs.ts) across MULTIPLE volumes, one
 * after another. Each volume's export runs as a single background job
 * (api.startExportJob/pollExportJob) covering every page in that volume, instead of
 * the old N-sequential-blocking-requests shape — this is the "Batch-Export-Queue"
 * feature built directly on top of "Export als Background-Job"'s job infrastructure,
 * as a new additive entry point rather than a rewrite of the existing single-volume
 * export flow (ExportPanel.tsx/useExportRun.ts), which stays untouched.
 */
export function BatchExportQueueModal({ volumes, onClose }: Props) {
  const { t } = useTranslation();
  const [languages, setLanguages] = useState<LanguageDef[]>([]);
  const [selectedVolumeIds, setSelectedVolumeIds] = useState<Set<string>>(new Set());
  const [format, setFormat] = useState<QueueFormat>("vector-pdf");
  const [languageCode, setLanguageCode] = useState("");
  const [pdfxVersion, setPdfxVersion] = useState<PdfXVersion>("x4");
  const [running, setRunning] = useState(false);
  const [queue, setQueue] = useState<QueueEntryStatus[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.listLanguages().then((list) => {
      setLanguages(list);
      if (list.length > 0) setLanguageCode((cur) => cur || list[0].code);
    });
  }, []);

  function toggleVolume(id: string) {
    const next = new Set(selectedVolumeIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedVolumeIds(next);
  }

  async function handleStart() {
    const targets = volumes.filter((v) => selectedVolumeIds.has(v.id));
    const lang = languages.find((l) => l.code === languageCode);
    if (targets.length === 0 || !lang) return;
    setRunning(true);
    setError(null);
    const initialQueue: QueueEntryStatus[] = targets.map((v) => ({
      volumeId: v.id,
      bookFolderName: v.bookFolderName,
      state: "pending",
      completed: 0,
      total: 0,
    }));
    setQueue(initialQueue);

    for (const target of targets) {
      setQueue((cur) => cur!.map((e) => (e.volumeId === target.id ? { ...e, state: "running" } : e)));
      try {
        const pages = await api.listPages(target.id);
        const { jobId, total } = await api.startExportJob(target.id, format, pages.map((p) => p.page), lang.code, lang.folderSuffix, pdfxVersion);
        setQueue((cur) => cur!.map((e) => (e.volumeId === target.id ? { ...e, total } : e)));
        const finished: ExportJobResult = await pollExportJob(target.id, jobId, (job) => {
          setQueue((cur) => cur!.map((e) => (e.volumeId === target.id ? { ...e, completed: job.completed, total: job.total } : e)));
        });
        setQueue((cur) =>
          cur!.map((e) =>
            e.volumeId === target.id ? { ...e, state: finished.status === "done" ? "done" : "failed", error: finished.error } : e
          )
        );
      } catch (e) {
        setQueue((cur) => cur!.map((entry) => (entry.volumeId === target.id ? { ...entry, state: "failed", error: translateApiError(e, t) } : entry)));
      }
    }
    setRunning(false);
  }

  return (
    <div className="inspector" style={{ width: 480, maxWidth: "90vw", maxHeight: "85vh" }}>
      <p style={{ margin: 0, fontWeight: 600 }}>{t("batchExportQueue.title")}</p>
      <p className="hint" style={{ margin: "0 0 8px" }}>
        {t("batchExportQueue.scopeHint")}
      </p>
      {error && <div className="error-banner">{error}</div>}

      {!queue ? (
        <>
          <div className="field-row">
            <label>
              {t("batchExportQueue.formatLabel")}
              <select value={format} onChange={(e) => setFormat(e.target.value as QueueFormat)}>
                <option value="vector-pdf">{t("exportPanel.formatVectorPdf")}</option>
                <option value="psd">{t("exportPanel.formatPsd")}</option>
              </select>
            </label>
            <label>
              {t("batchExportQueue.languageLabel")}
              <select value={languageCode} onChange={(e) => setLanguageCode(e.target.value)}>
                {languages.map((l) => (
                  <option key={l.code} value={l.code}>
                    {l.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
          {format === "vector-pdf" && (
            <label>
              {t("exportPanel.pdfxVersionLabel")}
              <select value={pdfxVersion} onChange={(e) => setPdfxVersion(e.target.value as PdfXVersion)}>
                <option value="x4">PDF/X-4</option>
                <option value="x1a">PDF/X-1a</option>
              </select>
            </label>
          )}

          <p className="report-heading" style={{ margin: "8px 0 0" }}>
            {t("batchExportQueue.volumesHeading")}
          </p>
          <div className="text-list" style={{ flex: "0 0 auto", maxHeight: 240 }}>
            {volumes.map((v) => (
              <label key={v.id} className="text-list-row" style={{ cursor: "pointer" }}>
                <input type="checkbox" checked={selectedVolumeIds.has(v.id)} onChange={() => toggleVolume(v.id)} />
                <span className="text-list-content">{v.bookFolderName}</span>
              </label>
            ))}
          </div>

          <button type="button" className="primary" onClick={handleStart} disabled={selectedVolumeIds.size === 0 || !languageCode}>
            {t("batchExportQueue.startButton", { count: selectedVolumeIds.size })}
          </button>
        </>
      ) : (
        <div className="text-list" style={{ flex: "0 0 auto", maxHeight: 320 }}>
          {queue.map((entry) => (
            <div key={entry.volumeId} className="text-list-row" style={{ cursor: "default", display: "flex", alignItems: "center", gap: 8 }}>
              <span className="text-list-type">{entry.bookFolderName}</span>
              <span className="text-list-content" style={{ display: "flex", alignItems: "center", gap: 8 }}>
                {entry.state === "running" && (
                  <LoadingIndicator size="sm" progress={entry.total > 0 ? { current: entry.completed, total: entry.total } : null} />
                )}
                {t(`batchExportQueue.state.${entry.state}`)}
                {entry.state === "running" && entry.total > 0 ? ` (${entry.completed}/${entry.total})` : ""}
                {entry.error ? `: ${entry.error}` : ""}
              </span>
            </div>
          ))}
        </div>
      )}

      <button onClick={onClose} disabled={running}>
        {t("common.close")}
      </button>
    </div>
  );
}
