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
 * short-lived signed URL, async validation/publish status. Verified directly against
 * the live developer page (endpoints/manifest shape/limits below); the authoritative
 * source for exact field types is the linked OpenAPI spec — re-check against it once a
 * real partner client id is issued, before going live (see the connector-subsystem
 * plan's own note on this).
 *
 * Deliberately PKCE-only (no client-secret support at all), even though AI MANGA's own
 * docs allow confidential clients: a client secret can never live in this open-source
 * repository, so every ComiKumi deployment — desktop or self-hosted server — registers
 * its own PUBLIC client id with AI MANGA and authenticates via PKCE S256. See
 * shared/src/connectors.ts and the connector-subsystem plan for the full reasoning.
 */

const DEFAULT_API_BASE = "https://a-i-manga.com";

function apiBase(): string {
  return process.env.AI_MANGA_API_BASE ?? DEFAULT_API_BASE;
}

function clientId(): string | undefined {
  return process.env.AI_MANGA_CLIENT_ID;
}

/** The redirect URI AI MANGA was configured (at partner-registration time) to send the
 * user back to — must exactly match what's registered there. Not derived from the
 * incoming request's own Host header: AI MANGA fixes this per-client at review time,
 * so it has to be an explicit, stable value the operator sets once. */
function redirectUri(): string | undefined {
  return process.env.AI_MANGA_REDIRECT_URI;
}

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

/** ZIP contract from AI MANGA's "Package contract" section: manifest.json at the root,
 * an optional cover image at the root, and one folder per chapter (here always exactly
 * one, `scope: "chapter"`) holding zero-padded, lexically-ordered page files. */
function buildZip(input: PublishManifestInput): Promise<Buffer> {
  const chapterFolder = `chapter-${String(input.chapter.number).padStart(3, "0")}`;
  const manifest = {
    generator: "ComiKumi",
    manifest_version: 1,
    scope: "chapter" as const,
    series: {
      external_id: input.seriesExternalId,
      title: input.seriesTitle,
      source_language: input.sourceLanguage,
      synopsis: input.synopsis,
      cover: input.cover ? "cover.png" : undefined,
      genres: input.genres,
    },
    chapters: [
      {
        external_id: input.chapter.externalId,
        number: input.chapter.number,
        title: input.chapter.title,
        folder: chapterFolder,
        page_count: input.chapter.pages.length,
        published: input.chapter.published,
        access_mode: input.chapter.accessMode,
      },
    ],
    chapter_count: 1,
    page_count: input.chapter.pages.length,
    pages_missing: 0,
  };

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
  upload_url: string;
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
      // Minimal scope for the publish flow this connector implements today — extend
      // once ComiKumi supports more than "create a series, deliver a chapter, read own
      // imports". Immediate publish additionally needs an approved works:publish scope
      // on the AI MANGA side (see the connector-subsystem plan's manifest doc comment).
      scope: "connect:read series:write imports:write",
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

  async fetchAccountLabel(accessToken: string): Promise<string> {
    const res = await authorizedFetch(accessToken, "/api/v1/connect/me");
    if (!res.ok) throw new Error(`ai_manga_me_failed: ${res.status}`);
    const me = (await res.json()) as { display_name?: string; username?: string; id: string };
    return me.display_name ?? me.username ?? me.id;
  },

  async publish(accessToken: string, input: PublishManifestInput) {
    const zip = await buildZip(input);

    // Rate-limit guard from the docs: a 429 here carries used/requested/limit/remaining
    // and a reset time. Surfaced to the caller as-is (route layer translates it into a
    // user-facing message) rather than retried automatically — retrying a 500-page
    // rolling window on a timer isn't something this connector should decide silently.
    const createRes = await authorizedFetch(accessToken, "/api/v1/connect/imports", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        series_external_id: input.seriesExternalId,
        chapter_external_id: input.chapter.externalId,
        source_language: input.sourceLanguage,
        zip_size: zip.byteLength,
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
    if (json.status === "published") return { state: "published", publicUrl: json.public_url };
    if (json.status === "failed" || json.status === "rejected") return { state: "failed", error: json.error };
    if (json.status === "validating") return { state: "validating" };
    return { state: "pending" };
  },
};
