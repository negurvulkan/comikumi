import { randomUUID } from "node:crypto";
import type { PublishManifestInput, PublishingConnector } from "./connectors/types.js";

/**
 * Background job for a single connector publish — same in-memory Map + retention/sweep
 * pattern as server/src/lib/exportJobs.ts, just for "upload a ZIP to an external
 * service and poll its own async validation" instead of "render N pages server-side".
 * A job doesn't survive a server restart, same as every other in-flight state in this
 * app (see exportJobs.ts's own doc comment on why that's an acceptable trade-off here).
 */

export type PublishJobStatus = "uploading" | "validating" | "published" | "failed";

export interface PublishJobState {
  id: string;
  volumeId: string;
  connectorId: string;
  status: PublishJobStatus;
  publicUrl?: string;
  error?: string;
  createdAt: number;
}

const jobs = new Map<string, PublishJobState>();

const JOB_RETENTION_MS = 30 * 60 * 1000;
const POLL_INTERVAL_MS = 3000;
/** Exported so tokenManager.ts's refresh-skew calculation can guarantee an access token
 * handed to a fresh publish job outlives the longest this job will ever keep polling. */
export const PUBLISH_JOB_POLL_TIMEOUT_MS = 5 * 60 * 1000;

function sweepOldJobs(): void {
  const cutoff = Date.now() - JOB_RETENTION_MS;
  for (const [id, job] of jobs) {
    if (job.status !== "uploading" && job.status !== "validating" && job.createdAt < cutoff) jobs.delete(id);
  }
}

export function getPublishJob(id: string): PublishJobState | undefined {
  return jobs.get(id);
}

export interface StartPublishJobParams {
  volumeId: string;
  connector: PublishingConnector;
  accessToken: string;
  input: PublishManifestInput;
  /** Called once AI MANGA reports "published" — lets the route layer persist the
   * external ids back onto the project file (see shared/src/connectors.ts) without
   * this module needing to know anything about project storage. */
  onPublished?: (result: { publicUrl?: string }) => Promise<void>;
}

/** Starts uploading + polling in the background and returns immediately with the job's
 * initial "uploading" state — mirrors exportJobs.ts's startExportJob() in shape, not
 * just spirit, so the route layer's poll endpoint looks the same as the export one. */
export function startPublishJob(params: StartPublishJobParams): PublishJobState {
  sweepOldJobs();
  const job: PublishJobState = {
    id: randomUUID(),
    volumeId: params.volumeId,
    connectorId: params.connector.id,
    status: "uploading",
    createdAt: Date.now(),
  };
  jobs.set(job.id, job);
  void runPublishJob(job, params).catch((err) => {
    job.status = "failed";
    job.error = (err as Error).message;
  });
  return job;
}

async function runPublishJob(job: PublishJobState, params: StartPublishJobParams): Promise<void> {
  const { connector, accessToken, input } = params;
  const { importId } = await connector.publish(accessToken, input);
  job.status = "validating";

  const deadline = Date.now() + PUBLISH_JOB_POLL_TIMEOUT_MS;
  for (;;) {
    const status = await connector.pollStatus(accessToken, importId);
    if (status.state === "published") {
      job.status = "published";
      job.publicUrl = status.publicUrl;
      await params.onPublished?.({ publicUrl: status.publicUrl });
      return;
    }
    if (status.state === "failed") {
      job.status = "failed";
      job.error = status.error ?? "ai_manga_validation_failed";
      return;
    }
    if (Date.now() > deadline) {
      job.status = "failed";
      job.error = "ai_manga_status_timeout";
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }
}
