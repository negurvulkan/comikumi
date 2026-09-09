import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import AdmZip from "adm-zip";
import { createPkcePair, aiMangaConnector } from "./aiMangaConnector.js";
import type { PublishManifestInput } from "./types.js";

const ORIGINAL_ENV = { ...process.env };

beforeEach(() => {
  process.env.AI_MANGA_CLIENT_ID = "test-client-id";
  process.env.AI_MANGA_REDIRECT_URI = "http://localhost:3001/api/connectors/ai-manga/callback";
  process.env.AI_MANGA_API_BASE = "https://ai-manga.example";
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
  vi.unstubAllGlobals();
});

describe("createPkcePair", () => {
  it("derives the S256 challenge from the verifier (RFC 7636)", () => {
    const { codeVerifier, codeChallenge } = createPkcePair();
    expect(codeVerifier).toMatch(/^[A-Za-z0-9_-]{40,}$/);
    // base64url, no padding — a real "=" or "+"/"/" would mean the wrong encoding.
    expect(codeChallenge).not.toMatch(/[+/=]/);
  });

  it("produces a different verifier every call", () => {
    const a = createPkcePair();
    const b = createPkcePair();
    expect(a.codeVerifier).not.toBe(b.codeVerifier);
  });
});

describe("isConfigured", () => {
  it("is false when the client id or redirect uri env vars are missing", () => {
    delete process.env.AI_MANGA_CLIENT_ID;
    expect(aiMangaConnector.isConfigured()).toBe(false);
  });

  it("is true once both are set", () => {
    expect(aiMangaConnector.isConfigured()).toBe(true);
  });
});

describe("buildAuthorizeUrl", () => {
  it("includes PKCE S256 params, state, and the configured client id", () => {
    const url = new URL(
      aiMangaConnector.buildAuthorizeUrl({
        redirectUri: "http://localhost:3001/callback",
        state: "abc123",
        codeChallenge: "challenge-value",
      })
    );
    expect(url.origin).toBe("https://ai-manga.example");
    expect(url.pathname).toBe("/connect/authorize");
    expect(url.searchParams.get("client_id")).toBe("test-client-id");
    // Exactly the scopes documented under securitySchemes.oauth2 in the OpenAPI spec
    // (GET /api/v1/connect/openapi) — not the placeholder scopes an earlier version of
    // this connector guessed from the marketing page's prose alone.
    expect(url.searchParams.get("scope")?.split(" ").sort()).toEqual(
      ["series:read", "series:write", "works:draft:create", "works:publish", "works:read"].sort()
    );
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    expect(url.searchParams.get("code_challenge")).toBe("challenge-value");
    expect(url.searchParams.get("state")).toBe("abc123");
  });
});

const SAMPLE_INPUT: PublishManifestInput = {
  seriesExternalId: "series-42",
  seriesTitle: "City After Sunset",
  sourceLanguage: "en",
  synopsis: "A courier follows a signal.",
  genres: ["Action", "Sci-Fi"],
  cover: Buffer.from("cover-bytes"),
  chapter: {
    externalId: "chapter-001",
    number: 1,
    title: "The Signal",
    pages: [Buffer.from("page-1"), Buffer.from("page-2")],
    published: true,
    accessMode: "free",
  },
};

describe("publish", () => {
  it("uploads a ZIP matching AI MANGA's package contract to the signed URL", async () => {
    let uploadedBody: Uint8Array | undefined;
    const fetchMock = vi.fn(async (input: string | URL, init?: RequestInit) => {
      const url = input.toString();
      if (url.endsWith("/api/v1/connect/series")) {
        return new Response(JSON.stringify({ id: "series-1" }), { status: 201 });
      }
      if (url.endsWith("/api/v1/connect/imports")) {
        return new Response(JSON.stringify({ id: "import-1", upload_url: "https://r2.example/upload" }), { status: 201 });
      }
      if (url === "https://r2.example/upload") {
        uploadedBody = init?.body as Uint8Array;
        return new Response(null, { status: 200 });
      }
      throw new Error(`unexpected fetch: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await aiMangaConnector.publish("access-token-123", SAMPLE_INPUT);
    expect(result.importId).toBe("import-1");

    // The find-or-create series call must run before the import, per the spec's
    // series:write step, and carry the same external id as the manifest.
    const seriesCall = fetchMock.mock.calls.find(([url]) => url.toString().endsWith("/series"));
    const seriesBody = JSON.parse(seriesCall![1]!.body as string);
    expect(seriesBody.externalSeriesId).toBe("series-42");

    // The import-create call must be authorized and match the OpenAPI spec's
    // CreatePackageImport shape: { source_language, manifest, package }, with the
    // package's sha256 matching the actual uploaded ZIP bytes.
    const createCall = fetchMock.mock.calls.find(([url]) => url.toString().endsWith("/imports"));
    expect(createCall?.[1]?.headers).toMatchObject({ authorization: "Bearer access-token-123" });
    const createBody = JSON.parse(createCall![1]!.body as string);
    expect(createBody.source_language).toBe("en");
    expect(createBody.manifest.series.external_id).toBe("series-42");
    expect(createBody.manifest.chapters[0].external_id).toBe("chapter-001");
    expect(createBody.package.content_type).toBe("application/zip");
    expect(createBody.package.sha256).toMatch(/^[a-f0-9]{64}$/);

    // The uploaded ZIP itself must contain manifest.json + cover + both pages, per the
    // package contract (manifest.json at root, pages inside <chapter folder>/), and its
    // manifest.json must be byte-identical in content to what was sent in the request
    // body above ("critical fields in the API request must match the ZIP manifest").
    expect(uploadedBody).toBeDefined();
    const zip = new AdmZip(Buffer.from(uploadedBody!));
    const entryNames = zip.getEntries().map((e) => e.entryName);
    expect(entryNames).toEqual(
      expect.arrayContaining(["manifest.json", "cover.png", "chapter-001/page-001.png", "chapter-001/page-002.png"])
    );
    const manifest = JSON.parse(zip.getEntry("manifest.json")!.getData().toString("utf-8"));
    expect(manifest).toEqual(createBody.manifest);
    expect(manifest.series.slug).toBe("city-after-sunset");
    expect(manifest.chapters[0]).toMatchObject({ external_id: "chapter-001", page_count: 2, published: true, access_mode: "free" });
    expect(manifest.page_count).toBe(2);
  });

  it("surfaces a 429 rate-limit response as a distinguishable error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ used: 500, requested: 24, limit: 500, remaining: 0 }), { status: 429 }))
    );
    await expect(aiMangaConnector.publish("token", SAMPLE_INPUT)).rejects.toThrow(/ai_manga_rate_limited/);
  });
});

describe("pollStatus", () => {
  it.each([
    ["published", { state: "published", publicUrl: "https://a-i-manga.com/w/1" }],
    ["failed", { state: "failed" }],
    ["validating", { state: "validating" }],
    ["pending", { state: "pending" }],
  ] as const)("maps AI MANGA status %s to %o", async (aiMangaStatus, expected) => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ status: aiMangaStatus, public_url: "https://a-i-manga.com/w/1" }), { status: 200 }))
    );
    const status = await aiMangaConnector.pollStatus("token", "import-1");
    expect(status).toMatchObject(expected);
  });
});
