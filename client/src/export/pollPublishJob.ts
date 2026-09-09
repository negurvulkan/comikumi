import { api, type AiMangaPublishJob } from "../api/client";

/** Polls api.getAiMangaPublishJob() until it reaches a terminal state ("published"/
 * "failed") — same fixed-interval polling shape as pollExportJob.ts, just for the
 * connector publish job (server/src/lib/publishJobs.ts) instead of an export job.
 * A longer default interval than pollExportJob's 500ms: this job spends most of its
 * time waiting on AI MANGA's own asynchronous validation, not local work. */
export async function pollPublishJob(
  volumeId: string,
  jobId: string,
  onProgress?: (job: AiMangaPublishJob) => void,
  intervalMs = 2000
): Promise<AiMangaPublishJob> {
  for (;;) {
    const job = await api.getAiMangaPublishJob(volumeId, jobId);
    onProgress?.(job);
    if (job.status === "published" || job.status === "failed") return job;
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
}
