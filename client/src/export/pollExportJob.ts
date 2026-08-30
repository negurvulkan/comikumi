import { api } from "../api/client";

export interface ExportJobResult {
  id: string;
  status: "running" | "done" | "failed";
  total: number;
  completed: number;
  results: { page: string; status: "done" | "skipped" | "error"; message?: string }[];
  error?: string;
}

/** Polls api.getExportJob() until it reaches a terminal state ("done"/"failed"),
 * calling `onProgress` after every poll (including the first) so a caller can update a
 * progress bar as `completed`/`total` change. Fixed interval rather than adaptive
 * backoff — background exports are short-lived (seconds to low minutes for a whole
 * volume), so the extra complexity of backoff isn't worth it. */
export async function pollExportJob(
  volumeId: string,
  jobId: string,
  onProgress?: (job: ExportJobResult) => void,
  intervalMs = 500
): Promise<ExportJobResult> {
  for (;;) {
    const job = await api.getExportJob(volumeId, jobId);
    onProgress?.(job);
    if (job.status !== "running") return job;
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
}
