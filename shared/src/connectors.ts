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
 * Per-chapter external-id mapping for the AI MANGA connector — see server/src/lib/
 * connectors/aiMangaConnector.ts's manifest builder. Keyed in AiMangaProjectStateSchema
 * .chapters below by `${volumeId}:${chapterId}` — NOT by volumeId alone. A ComiKumi
 * volume can (and normally does) contain several chapters (see shared/src/pageMeta.ts's
 * ResolvedChapter); keying by volumeId alone would hand every chapter of a volume the
 * SAME external_id, so publishing chapter 2 after chapter 1 would silently overwrite
 * chapter 1's AI MANGA work instead of creating its own.
 */
export const AiMangaChapterMappingSchema = z.object({
  externalId: z.string().min(1),
  /** Set once AI MANGA's import validation succeeds for this chapter's most recent
   * publish — lets the Publish panel show "already published, republish?" instead of
   * always looking like a first-time publish. */
  lastPublishedAt: z.string().optional(),
});
export type AiMangaChapterMapping = z.infer<typeof AiMangaChapterMappingSchema>;

/** Builds the composite key AiMangaProjectStateSchema.chapters is indexed by — see that
 * field's own doc comment for why volumeId alone isn't enough. */
export function aiMangaChapterKey(volumeId: string, chapterId: string): string {
  return `${volumeId}:${chapterId}`;
}

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
  /** AI MANGA's own immutable creator/account id (from GET /api/v1/connect/me, NOT the
   * connected user's ComiKumi id) that first published this project — set on the first
   * successful publish, then checked on every later one (see server/src/routes/
   * connectorPublish.ts). Since OAuth tokens are stored per ComiKumi user account while
   * this series/chapter state is per PROJECT, without this check user A publishing a
   * project under AI-MANGA-account A and user B later publishing the same project under
   * their own AI-MANGA-account B would silently reuse account A's external ids against
   * account B's credentials — AI MANGA would reject that (imports are scoped to the
   * creator that owns them), surfacing as a confusing failure instead of a clear
   * "different AI MANGA account" error. */
  creatorId: z.string().optional(),
  /** Keyed by `aiMangaChapterKey(volumeId, chapterId)` — see AiMangaChapterMappingSchema's
   * own doc comment for why volumeId alone would be wrong. */
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

/**
 * The exact `source_language` enum from AI MANGA's OpenAPI spec (GET /api/v1/connect/
 * openapi's ConnectManifestV1.series.source_language / CreatePackageImport.source_language)
 * — NOT the same code space as ComiKumi's own LanguageDef.code (shared/src/languages.ts),
 * which allows arbitrary user-defined codes up to 10 characters and defaults Japanese to
 * "jp", not AI MANGA's "ja". See mapToAiMangaLanguage() below for the translation.
 */
export const AI_MANGA_SOURCE_LANGUAGES = ["ja", "en", "ko", "zh", "es", "fr", "id", "pt", "de", "vi", "th"] as const;
export type AiMangaSourceLanguage = (typeof AI_MANGA_SOURCE_LANGUAGES)[number];
export const AiMangaSourceLanguageSchema = z.enum(AI_MANGA_SOURCE_LANGUAGES);

/** ComiKumi language code -> AI MANGA source_language, lowercased before lookup. Only
 * needs entries where the two code spaces actually differ or where a common alternate
 * spelling might reasonably appear in a project's language list — anything not listed
 * here (a project's own custom code, e.g. "fr-ca") has no AI MANGA equivalent and
 * mapToAiMangaLanguage() correctly returns null for it. */
const COMIKUMI_TO_AI_MANGA_LANGUAGE: Record<string, AiMangaSourceLanguage> = {
  jp: "ja",
  ja: "ja",
  en: "en",
  ko: "ko",
  kr: "ko",
  zh: "zh",
  cn: "zh",
  es: "es",
  fr: "fr",
  id: "id",
  pt: "pt",
  de: "de",
  vi: "vi",
  th: "th",
};

/** Translates a ComiKumi LanguageDef.code into the AI MANGA source_language it
 * corresponds to, or null if there is none (the code should then be hidden from the
 * Publish panel's language picker — see client/src/editor/PublishPanel.tsx — and
 * rejected server-side, see connectorPublish.ts). */
export function mapToAiMangaLanguage(comikumiLanguageCode: string): AiMangaSourceLanguage | null {
  return COMIKUMI_TO_AI_MANGA_LANGUAGE[comikumiLanguageCode.trim().toLowerCase()] ?? null;
}
