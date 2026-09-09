import { Router } from "express";
import multer from "multer";
import { z } from "zod";
import { asyncHandler } from "../lib/asyncHandler.js";
import { requireProjectRole } from "../lib/auth.js";
import { findVolume } from "../lib/projectScanner.js";
import { readConnectorState, writeConnectorState } from "../lib/projectStore.js";
import { getConnector } from "../lib/connectors/registry.js";
import { getValidAccessToken } from "../lib/connectors/tokenManager.js";
import { startPublishJob, getPublishJob } from "../lib/publishJobs.js";

/**
 * Volume-scoped publish flow for the AI MANGA connector — same mount shape and role
 * gate as routes/exportJobs.ts (requireLetterer: publishing is a production action,
 * not something a translator/viewer should trigger), separate from routes/connectors.ts
 * (account-level connect/disconnect, no project involved at all).
 *
 * Page rasterization happens CLIENT-SIDE, same as the existing PNG export path
 * (client/src/export/renderPageToPng.ts + useExportRun.ts) — this route only ever
 * receives already-rendered PNG bytes, exactly like POST .../export does (see
 * routes/export.ts). The server's only new work is building the manifest+ZIP and
 * talking to AI MANGA.
 */
export const connectorPublishRouter = Router();
const requireLetterer = requireProjectRole("letterer");
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 250 * 1024 * 1024 } });

const PublishMetadataSchema = z.object({
  seriesTitle: z.string().min(1),
  sourceLanguage: z.string().min(1),
  synopsis: z.string().default(""),
  genres: z.array(z.string()).default([]),
  chapterNumber: z.number().int().positive(),
  chapterTitle: z.string().min(1),
  published: z.boolean().default(false),
  accessMode: z.enum(["free", "paid"]).default("free"),
});

/** Deterministic, stable external ids for a given ComiKumi project+volume — created
 * once and reused for every future publish of the same chapter, so a retried/duplicate
 * delivery updates the SAME AI MANGA work instead of creating a new one each time (see
 * the manifest contract's own external_id doc comment). Persisted immediately (before
 * the actual publish attempt) so this holds even if the publish itself later fails. */
async function resolveExternalIds(
  ctx: Parameters<typeof readConnectorState>[0],
  projectId: string,
  volumeId: string
): Promise<{ seriesExternalId: string; chapterExternalId: string }> {
  const state = await readConnectorState(ctx);
  let changed = false;
  if (!state.aiManga.seriesExternalId) {
    state.aiManga.seriesExternalId = `comikumi-${projectId}`;
    changed = true;
  }
  if (!state.aiManga.chapters[volumeId]) {
    state.aiManga.chapters[volumeId] = { externalId: `comikumi-${projectId}-${volumeId}` };
    changed = true;
  }
  if (changed) await writeConnectorState(state, ctx);
  return { seriesExternalId: state.aiManga.seriesExternalId, chapterExternalId: state.aiManga.chapters[volumeId].externalId };
}

connectorPublishRouter.post(
  "/:id/connectors/ai-manga/publish",
  requireLetterer,
  upload.fields([{ name: "pages" }, { name: "cover", maxCount: 1 }]),
  asyncHandler(async (req, res) => {
    const volume = await findVolume(req.params.id, req.activeProject);
    if (!volume) {
      res.status(404).json({ error: "volume_not_found" });
      return;
    }
    const parsedMeta = PublishMetadataSchema.safeParse(JSON.parse((req.body as { metadata?: string }).metadata ?? "{}"));
    if (!parsedMeta.success) {
      res.status(400).json({ error: "publish_fields_required", details: parsedMeta.error.flatten() });
      return;
    }
    const files = req.files as { pages?: Express.Multer.File[]; cover?: Express.Multer.File[] } | undefined;
    const pages = files?.pages ?? [];
    if (pages.length === 0) {
      res.status(400).json({ error: "no_pages" });
      return;
    }

    const connector = getConnector("ai-manga");
    if (!connector || !connector.isConfigured()) {
      res.status(409).json({ error: "connector_not_configured" });
      return;
    }
    const accessToken = await getValidAccessToken(connector, req.user!.sub);
    if (!accessToken) {
      res.status(409).json({ error: "connector_not_connected" });
      return;
    }

    const projectId = req.activeProject?.id ?? "default";
    const { seriesExternalId, chapterExternalId } = await resolveExternalIds(req.activeProject, projectId, volume.id);
    const meta = parsedMeta.data;

    const job = startPublishJob({
      volumeId: volume.id,
      connector,
      accessToken,
      input: {
        seriesExternalId,
        seriesTitle: meta.seriesTitle,
        sourceLanguage: meta.sourceLanguage,
        synopsis: meta.synopsis,
        genres: meta.genres,
        cover: files?.cover?.[0]?.buffer ?? null,
        chapter: {
          externalId: chapterExternalId,
          number: meta.chapterNumber,
          title: meta.chapterTitle,
          pages: pages.map((f) => f.buffer),
          published: meta.published,
          accessMode: meta.accessMode,
        },
      },
      onPublished: async () => {
        const state = await readConnectorState(req.activeProject);
        state.aiManga.chapters[volume.id] = { ...state.aiManga.chapters[volume.id], lastPublishedAt: new Date().toISOString() };
        await writeConnectorState(state, req.activeProject);
      },
    });
    res.json({ jobId: job.id });
  })
);

connectorPublishRouter.get(
  "/:id/connectors/ai-manga/publish/:jobId",
  asyncHandler(async (req, res) => {
    const job = getPublishJob(req.params.jobId);
    if (!job || job.volumeId !== req.params.id) {
      res.status(404).json({ error: "publish_job_not_found" });
      return;
    }
    res.json(job);
  })
);
