import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { PageLayoutSchema } from "../../../shared/src/layoutSchema.js";
import { findVolume, listPages } from "./projectScanner.js";
import { languageFolderName, letteringFolderName } from "./paths.js";
import { readPresets, readSettings, type ActiveProject } from "./projectStore.js";
import { buildVectorPdfPage } from "./vectorPdf/buildPdfPage.js";
import { buildLayeredPsd } from "./psdExport.js";
import { resolveImageFilePath } from "./imageResolver.js";

/**
 * Background export jobs for server-rendered formats (vector PDF / PSD) — the two
 * export routes (export-vector-pdf, export-psd in routes/export.ts) that do real
 * per-page rendering work (font rasterization, canvas compositing) on the server.
 * Raster/print exports render client-side and only ever write one already-rendered
 * blob per request, so they stay on the existing synchronous routes — there's no
 * server-side rendering cost there to move off the request thread.
 *
 * In-memory job store (Map), matching the rest of this app's "small self-hosted
 * process, no external services" architecture (see TODO.md's Such-Index entry for the
 * same reasoning applied to the search index) — a job doesn't survive a server
 * restart, same as every other piece of in-flight state in this app.
 */

export type ExportJobFormat = "vector-pdf" | "psd";

export interface ExportJobPageResult {
  page: string;
  status: "done" | "skipped" | "error";
  /** Set for "skipped" (why there was nothing to export) and "error" (the render
   * failure's message) — absent for "done". */
  message?: string;
}

export interface ExportJobState {
  id: string;
  volumeId: string;
  format: ExportJobFormat;
  languageCode: string;
  total: number;
  completed: number;
  status: "running" | "done" | "failed";
  /** Only populated once a page has actually been processed — length grows from 0 to
   * `total` as the job runs, so a poller can show per-page results incrementally. */
  results: ExportJobPageResult[];
  /** Set only when `status` is "failed" — a whole-job failure (e.g. volume not found),
   * distinct from a per-page "error" result, which still lets the rest of the job run. */
  error?: string;
  createdAt: number;
}

const jobs = new Map<string, ExportJobState>();

// A finished job stays queryable for this long after completion — plenty of time for
// a normal poll loop to observe "done" and stop, swept out afterward so a long-running
// server process doesn't accumulate job history forever in memory.
const JOB_RETENTION_MS = 30 * 60 * 1000;

function sweepOldJobs(): void {
  const cutoff = Date.now() - JOB_RETENTION_MS;
  for (const [id, job] of jobs) {
    if (job.status !== "running" && job.createdAt < cutoff) jobs.delete(id);
  }
}

export function getExportJob(id: string): ExportJobState | undefined {
  return jobs.get(id);
}

export interface StartExportJobParams {
  volumeId: string;
  format: ExportJobFormat;
  pages: string[];
  languageCode: string;
  folderSuffix: string;
  /** Only meaningful for format "vector-pdf" — mirrors export-vector-pdf's own
   * required body field, defaulted here since a batch job call is less likely to
   * always specify it explicitly. */
  pdfxVersion?: "x1a" | "x4";
  ctx?: ActiveProject;
}

/** Creates a job and starts processing it in the background — returns immediately
 * with the job's initial ("running", 0 completed) state, WITHOUT waiting for any page
 * to finish rendering. The caller (the route handler) responds to the client with the
 * job id right away; progress is observed by polling getExportJob(id) afterward. */
export function startExportJob(params: StartExportJobParams): ExportJobState {
  sweepOldJobs();
  const job: ExportJobState = {
    id: randomUUID(),
    volumeId: params.volumeId,
    format: params.format,
    languageCode: params.languageCode,
    total: params.pages.length,
    completed: 0,
    status: "running",
    results: [],
    createdAt: Date.now(),
  };
  jobs.set(job.id, job);
  // Deliberately not awaited — runs after this function has already returned.
  void runExportJob(job, params).catch((err) => {
    job.status = "failed";
    job.error = (err as Error).message;
  });
  return job;
}

async function runExportJob(job: ExportJobState, params: StartExportJobParams): Promise<void> {
  const volume = await findVolume(params.volumeId, params.ctx);
  if (!volume) {
    job.status = "failed";
    job.error = "volume_not_found";
    return;
  }
  const settings = await readSettings(params.ctx);
  const presets = await readPresets(params.ctx);
  const pages = await listPages(volume);
  const pageByName = new Map(pages.map((p) => [p.page, p]));
  const outDir = path.join(volume.parentDir, languageFolderName(volume.bookFolderName, params.folderSuffix, settings.exportFolderTemplate));
  await fs.mkdir(outDir, { recursive: true });
  const letteringDir = path.join(volume.parentDir, letteringFolderName(volume.bookFolderName, settings.letteringSuffix));

  // Sequential, not Promise.all — each page render is real CPU + memory work (font
  // rasterization, canvas compositing), and this app runs as a single small
  // self-hosted process. Rendering pages in parallel would spike memory/CPU for no
  // real wall-clock win once the bottleneck is CPU-bound, not I/O wait — and would
  // make "cancel"/progress reporting far less precise.
  for (const page of params.pages) {
    try {
      const pageInfo = pageByName.get(page);
      if (!pageInfo) {
        job.results.push({ page, status: "skipped", message: "page_not_found" });
        continue;
      }
      let layoutRaw: string;
      try {
        layoutRaw = await fs.readFile(path.join(letteringDir, `${page}.json`), "utf-8");
      } catch {
        job.results.push({ page, status: "skipped", message: "no_saved_layout" });
        continue;
      }
      const layout = PageLayoutSchema.parse(JSON.parse(layoutRaw));

      if (params.format === "vector-pdf") {
        const result = await buildVectorPdfPage({
          baseImagePath: pageInfo.absolutePath,
          layout,
          languageCode: params.languageCode,
          presets,
          resolveImagePath: resolveImageFilePath,
          pdfxVersion: params.pdfxVersion ?? "x4",
        });
        await fs.writeFile(path.join(outDir, `${page}.pdf`), result.bytes);
      } else {
        const bytes = await buildLayeredPsd({
          baseImagePath: pageInfo.absolutePath,
          layout,
          languageCode: params.languageCode,
          presets,
          resolveImagePath: resolveImageFilePath,
        });
        await fs.writeFile(path.join(outDir, `${page}.psd`), bytes);
      }
      job.results.push({ page, status: "done" });
    } catch (err) {
      job.results.push({ page, status: "error", message: (err as Error).message });
    } finally {
      job.completed++;
    }
  }
  job.status = "done";
}
