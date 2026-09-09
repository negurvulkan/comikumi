import { z } from "zod";

/**
 * Ids of the connectors the server registry (server/src/lib/connectors/registry.ts)
 * knows about — currently just one. Kept as its own type (not inlined as a string
 * literal everywhere) so a second publishing connector only needs to extend this list,
 * not hunt down every place "ai-manga" was typed by hand.
 */
export const CONNECTOR_IDS = ["ai-manga"] as const;
export type ConnectorId = (typeof CONNECTOR_IDS)[number];

/**
 * Per-chapter (= ComiKumi volume) external-id mapping for the AI MANGA connector — see
 * server/src/lib/connectors/aiMangaConnector.ts's manifest builder. Keyed by ComiKumi's
 * own volumeId in AiMangaProjectStateSchema.chapters below, so this object itself only
 * needs to carry AI MANGA's own identifiers, not ComiKumi's.
 */
export const AiMangaChapterMappingSchema = z.object({
  externalId: z.string().min(1),
  /** Set once AI MANGA's import validation succeeds for this chapter's most recent
   * publish — lets the Publish panel show "already published, republish?" instead of
   * always looking like a first-time publish. */
  lastPublishedAt: z.string().optional(),
});
export type AiMangaChapterMapping = z.infer<typeof AiMangaChapterMappingSchema>;

/**
 * AI MANGA connector state for one ComiKumi project — lives in ProjectFileSchema
 * (shared/src/project.ts), travels with the project file like `presets`/`glossary`,
 * since a series/chapter's external_id must stay stable across every team member who
 * publishes to it (see the manifest's own doc comment on why: retried/duplicate
 * uploads must resolve to the SAME AI MANGA work, not create a new one each time).
 */
export const AiMangaProjectStateSchema = z.object({
  seriesExternalId: z.string().optional(),
  /** AI MANGA's own series id, once `series.external_id` has been accepted at least
   * once — not strictly needed for publishing again (external_id alone is enough), but
   * lets the Publish panel link out to the series without another API round-trip. */
  seriesId: z.string().optional(),
  /** Keyed by ComiKumi volumeId (see shared/src/pageOrder.ts and friends for how
   * volumes are identified elsewhere in this app). */
  chapters: z.record(z.string(), AiMangaChapterMappingSchema).default({}),
});
export type AiMangaProjectState = z.infer<typeof AiMangaProjectStateSchema>;

/**
 * The full `connectors` field on ProjectFileSchema — one optional sub-object per known
 * connector id, all defaulting to "not yet used for this project" so existing project
 * files keep validating unchanged.
 */
export const ConnectorProjectStateSchema = z.object({
  aiManga: AiMangaProjectStateSchema.default({ chapters: {} }),
});
export type ConnectorProjectState = z.infer<typeof ConnectorProjectStateSchema>;

/**
 * What the client is allowed to see about a connector's configuration/connection state
 * — never a token, never a client secret (there isn't one, see aiMangaConnector.ts's
 * PKCE-only doc comment). `configured` is server-deployment-wide (is an
 * AI_MANGA_CLIENT_ID set at all); `connected`/`accountLabel` are per-calling-user.
 */
export const ConnectorStatusSchema = z.object({
  id: z.enum(CONNECTOR_IDS),
  configured: z.boolean(),
  connected: z.boolean(),
  accountLabel: z.string().optional(),
});
export type ConnectorStatus = z.infer<typeof ConnectorStatusSchema>;
