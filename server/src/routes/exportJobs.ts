import { Router } from "express";
import { z } from "zod";
import { asyncHandler } from "../lib/asyncHandler.js";
import { requireProjectRole } from "../lib/auth.js";
import { findVolume } from "../lib/projectScanner.js";
import { getExportJob, startExportJob } from "../lib/exportJobs.js";

export const exportJobsRouter = Router();
const requireLetterer = requireProjectRole("letterer");

const StartExportJobSchema = z.object({
  format: z.enum(["vector-pdf", "psd"]),
  pages: z.array(z.string().min(1)).min(1),
  languageCode: z.string().min(1),
  folderSuffix: z.string().min(1),
  pdfxVersion: z.enum(["x1a", "x4"]).optional(),
});

/**
 * Background job wrapper around the same server-side renderers export-vector-pdf/
 * export-psd (routes/export.ts) already use for one page at a time — this is the
 * many-pages-in-one-go entry point (see exportJobs.ts's own doc comment for why only
 * these two formats, not raster/print). Deliberately reads each page's already-SAVED
 * layout from disk (same file routes/layout.ts's GET .../layout reads) rather than
 * requiring the client to re-POST every page's full layout JSON in one big batch
 * request — exports what's actually persisted, and keeps the start-job request small
 * regardless of how many pages are queued.
 */
exportJobsRouter.post(
  "/:id/export-jobs",
  requireLetterer,
  asyncHandler(async (req, res) => {
    const volume = await findVolume(req.params.id, req.activeProject);
    if (!volume) {
      res.status(404).json({ error: "volume_not_found" });
      return;
    }
    const parsed = StartExportJobSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "export_job_fields_required", details: parsed.error.flatten() });
      return;
    }
    const job = startExportJob({ volumeId: req.params.id, ctx: req.activeProject, ...parsed.data });
    res.json({ jobId: job.id, total: job.total });
  })
);

exportJobsRouter.get(
  "/:id/export-jobs/:jobId",
  asyncHandler(async (req, res) => {
    const job = getExportJob(req.params.jobId);
    if (!job || job.volumeId !== req.params.id) {
      res.status(404).json({ error: "export_job_not_found" });
      return;
    }
    res.json(job);
  })
);
