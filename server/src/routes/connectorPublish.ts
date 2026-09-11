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
import { getAiMangaAccountId } from "../lib/authStore.js";
import { aiMangaChapterKey, mapToAiMangaLanguage } from "../../../shared/src/connectors.js";

/**
 * Volume-scoped publish flow for the AI MANGA connector — same mount shape and role
 * gate as routes/exportJobs.ts (requireLetterer: publishing is a production action,
 * not something a translator/viewer should trigger), separate from routes/connectors.ts
 * (account-level connect/disconnect, no project involved at all).
 *
 * Page rasterization happens CLIENT-SIDE, same as the existing PNG export path
 * (client/src/export/renderPageToPng.ts + useExportRun.ts) — this route only ever
 * receives already-rendered PNG bytes, exactly like POST .../export does (see
 * routes/export.ts). The server's only new work is validating those bytes against AI
 * MANGA's documented limits, building the manifest+ZIP, and talking to AI MANGA.
 */
export const connectorPublishRouter = Router();
const requireLetterer = requireProjectRole("letterer");

// AI MANGA's documented per-image ceiling (developer guide's "Current limits" section)
// — set as multer's own fileSize limit so an oversized upload is rejected as it
// streams in, not after being buffered into memory in full.
const MAX_PAGE_BYTES = 10 * 1024 * 1024;
const MIN_PAGE_BYTES = 1024;
const MAX_PAGES_PER_CHAPTER = 100;

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_PAGE_BYTES } });

const PublishMetadataSchema = z
  .object({
    seriesTitle: z.string().min(1),
    /** A ComiKumi LanguageDef.code (shared/src/languages.ts), NOT an AI MANGA
     * source_language directly — mapToAiMangaLanguage() below translates it, and this
     * route 400s if that mapping doesn't exist for the given code. */
    languageCode: z.string().min(1).max(10),
    synopsis: z.string().default(""),
    genres: z.array(z.string()).default([]),
    /** The specific ResolvedChapter (shared/src/pageMeta.ts) within this volume being
     * published — required so multiple chapters of the same volume get their own
     * external id instead of colliding (see aiMangaChapterKey()'s own doc comment). */
    chapterId: z.string().min(1),
    chapterNumber: z.number().int().positive(),
    chapterTitle: z.string().min(1),
    published: z.boolean().default(false),
    accessMode: z.enum(["free", "supporter_only"]).default("free"),
  })
  // AI MANGA only allows immediate publication for a free chapter (see the developer
  // guide's Q4 FAQ answer: "published: true, access_mode: free, and successful
  // validation") — reject the combination server-side even though the Publish panel
  // itself already prevents selecting it, since this route is the actual boundary.
  .refine((data) => !data.published || data.accessMode === "free", {
    message: "published_requires_free_access_mode",
    path: ["accessMode"],
  });

/** Deterministic, stable external ids for a given ComiKumi project+chapter — created
 * once and reused for every future publish of the same chapter, so a retried/duplicate
 * delivery updates the SAME AI MANGA work instead of creating a new one each time (see
 * the manifest contract's own external_id doc comment). Persisted immediately (before
 * the actual publish attempt) so this holds even if the publish itself later fails. */
async function resolveExternalIds(
  ctx: Parameters<typeof readConnectorState>[0],
  projectId: string,
  volumeId: string,
  chapterId: string
): Promise<{ seriesExternalId: string; chapterExternalId: string }> {
  const state = await readConnectorState(ctx);
  const key = aiMangaChapterKey(volumeId, chapterId);
  let changed = false;
  if (!state.aiManga.seriesExternalId) {
    state.aiManga.seriesExternalId = `comikumi-${projectId}`;
    changed = true;
  }
  if (!state.aiManga.chapters[key]) {
    state.aiManga.chapters[key] = { externalId: `comikumi-${projectId}-${key}` };
    changed = true;
  }
  if (changed) await writeConnectorState(state, ctx);
  return { seriesExternalId: state.aiManga.seriesExternalId, chapterExternalId: state.aiManga.chapters[key].externalId };
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
    const meta = parsedMeta.data;

    const sourceLanguage = mapToAiMangaLanguage(meta.languageCode);
    if (!sourceLanguage) {
      res.status(400).json({ error: "unsupported_source_language", params: { languageCode: meta.languageCode } });
      return;
    }

    const files = req.files as { pages?: Express.Multer.File[]; cover?: Express.Multer.File[] } | undefined;
    const pages = files?.pages ?? [];
    if (pages.length === 0) {
      res.status(400).json({ error: "no_pages" });
      return;
    }
    if (pages.length > MAX_PAGES_PER_CHAPTER) {
      res.status(400).json({ error: "too_many_pages", params: { count: String(pages.length), max: String(MAX_PAGES_PER_CHAPTER) } });
      return;
    }
    const undersizedIndex = [...pages, ...(files?.cover ?? [])].findIndex((f) => f.buffer.length < MIN_PAGE_BYTES);
    if (undersizedIndex !== -1) {
      res.status(400).json({ error: "page_too_small", params: { min: String(MIN_PAGE_BYTES) } });
      return;
    }
    // Upper bound per file is already enforced by multer's fileSize limit above (a
    // request exceeding it never reaches this handler at all — see app.ts's error
    // middleware for how that's turned into a friendly response).

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

    // A project's series/chapter external ids are shared by every team member (see
    // resolveExternalIds()'s own doc comment), but OAuth tokens are per ComiKumi user —
    // without this check, a project first published under AI-MANGA-account A and later
    // published by a different ComiKumi user under AI-MANGA-account B would try to reuse
    // account A's external ids against account B's credentials (see shared/src/
    // connectors.ts's AiMangaProjectState.creatorId doc comment for the full reasoning).
    const connectedAccountId = await getAiMangaAccountId(req.user!.sub);
    const connectorState = await readConnectorState(req.activeProject);
    if (connectorState.aiManga.creatorId && connectorState.aiManga.creatorId !== connectedAccountId) {
      res.status(409).json({ error: "connector_account_mismatch" });
      return;
    }
    if (!connectorState.aiManga.creatorId && connectedAccountId) {
      connectorState.aiManga.creatorId = connectedAccountId;
      await writeConnectorState(connectorState, req.activeProject);
    }

    const projectId = req.activeProject?.id ?? "default";
    const { seriesExternalId, chapterExternalId } = await resolveExternalIds(req.activeProject, projectId, volume.id, meta.chapterId);

    const job = startPublishJob({
      volumeId: volume.id,
      connector,
      accessToken,
      input: {
        seriesExternalId,
        seriesTitle: meta.seriesTitle,
        sourceLanguage,
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
        const key = aiMangaChapterKey(volume.id, meta.chapterId);
        const state = await readConnectorState(req.activeProject);
        state.aiManga.chapters[key] = { ...state.aiManga.chapters[key], lastPublishedAt: new Date().toISOString() };
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
