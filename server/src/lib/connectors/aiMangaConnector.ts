import { createHash, randomBytes } from "node:crypto";
import { ZipArchive } from "archiver";
import type {
  OAuthTokenSet,
  PublishManifestInput,
  PublishStatus,
  PublishingConnector,
} from "./types.js";

/**
 * AI MANGA Connect (https://a-i-manga.com/en/developers/connect) — a "Partner Preview"
 * publishing API as of 2026-09: OAuth 2.0 Authorization Code, manifest+ZIP upload via a
 * short-lived signed URL, async validation/publish status. Endpoint paths, the manifest
 * schema, scopes, and the imports request/response shape below are taken from the
 * authoritative machine-readable spec at GET /api/v1/connect/openapi (fetched directly,
 * not just the marketing page's prose — that page's "paid" access-mode wording, for
 * instance, doesn't match the spec's actual "supporter_only" enum value). Still worth a
 * final re-check against a live partner sandbox once real credentials exist — the spec
 * itself is versioned "2.0.0-draft" and the response body schemas for a few endpoints
 * (imports creation, series creation) aren't fully specified there either.
 *
 * Deliberately PKCE-only (no client-secret support at all), even though the spec allows
 * confidential clients: a client secret can never live in this open-source repository.
 * A PKCE public client's id is not a secret, so ComiKumi bakes in one shared, official
 * client id (DEFAULT_AI_MANGA_CLIENT_ID below — a placeholder until AI MANGA issues a
 * real one) used by every desktop install; a self-hosted server operator can override it
 * with their own via AI_MANGA_CLIENT_ID/AI_MANGA_REDIRECT_URI if AI MANGA can't register
 * multiple redirect URIs under the shared id for arbitrary server domains. See
 * shared/src/connectors.ts and the connector-subsystem plan for the full reasoning.
 */

const DEFAULT_API_BASE = "https://a-i-manga.com";

/** AI MANGA's documented ZIP ceiling (developer guide's "Current limits" section) — the
 * per-image (1 KiB-10 MiB) and per-work (1-100 pages) limits are enforced earlier, on
 * the uploaded page bytes themselves, in server/src/routes/connectorPublish.ts. */
const MAX_ZIP_BYTES = 250 * 1024 * 1024;

/** Shared, official ComiKumi client id — public (PKCE), safe to embed in this
 * open-source repo. Empty until AI MANGA's partner review actually issues one; until
 * then every deployment must set AI_MANGA_CLIENT_ID itself (or the connector stays
 * "not configured", see isConfigured()). */
const DEFAULT_AI_MANGA_CLIENT_ID = "";

function apiBase(): string {
  return process.env.AI_MANGA_API_BASE ?? DEFAULT_API_BASE;
}

function clientId(): string | undefined {
  return process.env.AI_MANGA_CLIENT_ID || DEFAULT_AI_MANGA_CLIENT_ID || undefined;
}

/** The redirect URI AI MANGA was configured (at partner-registration time) to send the
 * user back to — must exactly match what's registered there. Not derived from the
 * incoming request's own Host header: AI MANGA fixes this per-client at review time.
 * The desktop build sets this automatically (see electron/main.ts's startEmbeddedServer,
 * which computes it from the chosen local port) — only a self-hosted server deployment
 * needs to set it by hand. */
function redirectUri(): string | undefined {
  return process.env.AI_MANGA_REDIRECT_URI;
}

/** Every scope this connector actually uses (see the OpenAPI spec's securitySchemes.oauth2
 * .flows.authorizationCode.scopes): series:read/write to find-or-create the target series,
 * works:draft:create + works:publish to create an import either as a draft or with
 * immediate publication, works:read to poll its status afterward. */
const SCOPES = ["series:read", "series:write", "works:draft:create", "works:publish", "works:read"];

/** See pollStatus()'s own doc comment on why "anything else" is treated as success
 * rather than only an explicit "published" match. */
const FAILURE_STATUSES = new Set(["failed", "rejected", "error"]);
const IN_PROGRESS_STATUSES = new Set(["pending", "queued", "processing", "validating"]);

function base64url(input: Buffer): string {
  return input.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** PKCE S256 verifier/challenge pair — see RFC 7636. A fresh verifier per authorize
 * attempt, held server-side until the callback (see oauthStateStore.ts) since it must
 * never appear in a URL or be visible to the browser. */
export function createPkcePair(): { codeVerifier: string; codeChallenge: string } {
  const codeVerifier = base64url(randomBytes(32));
  const codeChallenge = base64url(createHash("sha256").update(codeVerifier).digest());
  return { codeVerifier, codeChallenge };
}

/** ASCII slug from a series title — required by ConnectManifestV1.series.slug (the spec
 * marks it required, unlike external_id/cover/synopsis which are all optional). Not
 * meant to be unique/stable itself (AI MANGA presumably de-duplicates on its side); it
 * only needs to be a reasonable URL-safe rendering of the title. */
const COMBINING_DIACRITICS = new RegExp("[̀-ͯ]", "g");

function slugify(title: string): string {
  const slug = title
    .normalize("NFKD")
    .replace(COMBINING_DIACRITICS, "") // strip combining diacritics left behind by NFKD (e.g. "é" -> "e" + accent)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || "series";
}

interface TokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
}

async function requestToken(body: Record<string, string>): Promise<OAuthTokenSet> {
  const res = await fetch(`${apiBase()}/api/connect/oauth/token`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(body),
  });
  if (!res.ok) {
    throw new Error(`ai_manga_token_request_failed: ${res.status} ${await res.text().catch(() => "")}`);
  }
  const json = (await res.json()) as TokenResponse;
  return {
    accessToken: json.access_token,
    refreshToken: json.refresh_token,
    expiresAt: Date.now() + json.expires_in * 1000,
  };
}

async function authorizedFetch(accessToken: string, path: string, init: RequestInit = {}): Promise<Response> {
  return fetch(`${apiBase()}${path}`, {
    ...init,
    headers: { ...(init.headers ?? {}), authorization: `Bearer ${accessToken}` },
  });
}

/** The exact shape of components.schemas.ConnectManifestV1 in the OpenAPI spec — built
 * once and reused both as the ZIP's own manifest.json entry AND as the `manifest` field
 * of the POST /imports request body, since the spec requires those to match ("Critical
 * fields in the API request must match the ZIP manifest"). */
function buildManifest(input: PublishManifestInput, chapterFolder: string) {
  return {
    generator: "ComiKumi",
    manifest_version: 1 as const,
    scope: "chapter" as const,
    series: {
      external_id: input.seriesExternalId,
      title: input.seriesTitle,
      slug: slugify(input.seriesTitle),
      source_language: input.sourceLanguage,
      synopsis: input.synopsis || null,
      cover: input.cover ? "cover.png" : null,
      genres: input.genres,
    },
    chapters: [
      {
        external_id: input.chapter.externalId,
        number: input.chapter.number,
        title: input.chapter.title,
        folder: chapterFolder,
        page_count: input.chapter.pages.length,
        pages_missing: 0,
        published: input.chapter.published,
        access_mode: input.chapter.accessMode,
      },
    ],
    chapter_count: 1,
    page_count: input.chapter.pages.length,
    pages_missing: 0,
  };
}

/** ZIP contract from the manifest's own doc comment above and the developer guide's
 * "Package contract" section: manifest.json at the root, an optional cover image at the
 * root, and one folder per chapter (here always exactly one, `scope: "chapter"`) holding
 * zero-padded, lexically-ordered page files. */
function buildZip(manifest: ReturnType<typeof buildManifest>, input: PublishManifestInput, chapterFolder: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const archive = new ZipArchive({ zlib: { level: 9 } });
    const chunks: Buffer[] = [];
    archive.on("data", (chunk: Buffer) => chunks.push(chunk));
    archive.on("end", () => resolve(Buffer.concat(chunks)));
    archive.on("error", reject);
    archive.append(JSON.stringify(manifest, null, 2), { name: "manifest.json" });
    if (input.cover) archive.append(input.cover, { name: "cover.png" });
    input.chapter.pages.forEach((page, index) => {
      archive.append(page, { name: `${chapterFolder}/page-${String(index + 1).padStart(3, "0")}.png` });
    });
    void archive.finalize();
  });
}

interface CreateImportResponse {
  id: string;
  /** Field name is our best inference — the spec documents the 201 response only as
   * "Import accepted and a 15-minute signed package PUT URL returned" without a schema
   * ref. Re-verify this exact key once a real partner account can call the endpoint. */
  upload_url: string;
}

/**
 * Finds-or-creates the AI MANGA series for `seriesExternalId`, best-effort: the spec
 * documents POST .../series (series:write) but not what happens on a second call for an
 * id that already exists (no 409 in the spec, only 201/400) — could mean it upserts, or
 * could mean a second call 400s. Either way this must never block a publish attempt:
 * the import's own manifest already carries the full series payload (title/slug/
 * external_id/...), so AI MANGA can resolve the series from that even if this
 * pre-registration step is skipped or fails.
 */
async function ensureSeries(accessToken: string, manifest: ReturnType<typeof buildManifest>): Promise<void> {
  try {
    await authorizedFetch(accessToken, "/api/v1/connect/series", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        title: manifest.series.title,
        description: manifest.series.synopsis,
        externalSeriesId: manifest.series.external_id,
      }),
    });
  } catch {
    // Best-effort — see this function's own doc comment.
  }
}

export const aiMangaConnector: PublishingConnector = {
  id: "ai-manga",

  isConfigured(): boolean {
    return !!clientId() && !!redirectUri();
  },

  buildAuthorizeUrl({ redirectUri: callbackUrl, state, codeChallenge }): string {
    const id = clientId();
    if (!id) throw new Error("ai_manga_not_configured");
    const params = new URLSearchParams({
      response_type: "code",
      client_id: id,
      redirect_uri: callbackUrl,
      state,
      code_challenge: codeChallenge,
      code_challenge_method: "S256",
      scope: SCOPES.join(" "),
    });
    return `${apiBase()}/connect/authorize?${params.toString()}`;
  },

  async exchangeCodeForTokens({ code, redirectUri: callbackUrl, codeVerifier }): Promise<OAuthTokenSet> {
    const id = clientId();
    if (!id) throw new Error("ai_manga_not_configured");
    return requestToken({
      grant_type: "authorization_code",
      code,
      redirect_uri: callbackUrl,
      client_id: id,
      code_verifier: codeVerifier,
    });
  },

  async refreshTokens(refreshToken: string): Promise<OAuthTokenSet> {
    const id = clientId();
    if (!id) throw new Error("ai_manga_not_configured");
    return requestToken({ grant_type: "refresh_token", refresh_token: refreshToken, client_id: id });
  },

  async fetchAccountInfo(accessToken: string): Promise<{ id: string; label: string }> {
    const res = await authorizedFetch(accessToken, "/api/v1/connect/me");
    if (!res.ok) throw new Error(`ai_manga_me_failed: ${res.status}`);
    const me = (await res.json()) as { display_name?: string; username?: string; id: string };
    return { id: me.id, label: me.display_name ?? me.username ?? me.id };
  },

  async publish(accessToken: string, input: PublishManifestInput) {
    const chapterFolder = `chapter-${String(input.chapter.number).padStart(3, "0")}`;
    const manifest = buildManifest(input, chapterFolder);
    const zip = await buildZip(manifest, input, chapterFolder);
    if (zip.byteLength > MAX_ZIP_BYTES) {
      // Defense in depth — connectorPublish.ts already rejects an over-limit request
      // before ever getting here based on the uploaded page bytes; this only catches
      // the (unlikely) case where the assembled ZIP's own overhead pushes it over.
      throw new Error(`ai_manga_zip_too_large: ${zip.byteLength} bytes (max ${MAX_ZIP_BYTES})`);
    }
    const sha256 = createHash("sha256").update(zip).digest("hex");

    await ensureSeries(accessToken, manifest);

    // Rate-limit guard from the spec's UploadQuotaExceeded schema: a 429 here carries
    // used/requested/limit/remaining/resetAt. Surfaced to the caller as-is (route layer
    // translates it into a user-facing message) rather than retried automatically —
    // retrying a 500-page rolling window on a timer isn't something this connector
    // should decide silently.
    const createRes = await authorizedFetch(accessToken, "/api/v1/connect/imports", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        source_language: input.sourceLanguage,
        manifest,
        package: {
          name: `${chapterFolder}.zip`,
          size_bytes: zip.byteLength,
          content_type: "application/zip",
          sha256,
        },
      }),
    });
    if (createRes.status === 429) {
      const details = await createRes.json().catch(() => ({}));
      throw new Error(`ai_manga_rate_limited: ${JSON.stringify(details)}`);
    }
    if (!createRes.ok) {
      throw new Error(`ai_manga_import_create_failed: ${createRes.status} ${await createRes.text().catch(() => "")}`);
    }
    const created = (await createRes.json()) as CreateImportResponse;

    // "1 ZIP / 1 PUT" directly to the signed R2 URL — never through AI MANGA's own API
    // server (see the docs' Q2 FAQ answer), so this is a plain fetch PUT, no auth header.
    const uploadRes = await fetch(created.upload_url, {
      method: "PUT",
      headers: { "content-type": "application/zip" },
      body: new Uint8Array(zip),
    });
    if (!uploadRes.ok) {
      throw new Error(`ai_manga_zip_upload_failed: ${uploadRes.status}`);
    }

    return { importId: created.id };
  },

  async pollStatus(accessToken: string, importId: string): Promise<PublishStatus> {
    const res = await authorizedFetch(accessToken, `/api/v1/connect/imports/${encodeURIComponent(importId)}`);
    if (!res.ok) throw new Error(`ai_manga_status_failed: ${res.status}`);
    const json = (await res.json()) as { status: string; public_url?: string; error?: string };
    if (FAILURE_STATUSES.has(json.status)) return { state: "failed", error: json.error };
    if (IN_PROGRESS_STATUSES.has(json.status)) return { state: json.status === "validating" ? "validating" : "pending" };
    // Any other status is treated as a successful terminal state — deliberately lenient
    // rather than matching only the literal string "published", because the spec never
    // documents what status a successfully-validated DRAFT (published: false in the
    // manifest) comes back as; it could be "ready", "draft", "validated", or something
    // else entirely. See PublishStatusState's own doc comment. Re-check this against a
    // real partner account once one exists, and tighten back to an explicit allow-list
    // if the actual status strings turn out to need different handling per state.
    return { state: "published", publicUrl: json.public_url };
  },
};
