import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type { Express } from "express";
import { setupTestEnv, authedAgent, type TestEnv } from "../test-utils/fixtures.js";

let app: Express;
let env: TestEnv;
let api: ReturnType<typeof authedAgent>;

const VOLUME_ID = "Volume_01";
const ORIGINAL_ENV = { ...process.env };

beforeAll(async () => {
  env = await setupTestEnv();
  process.env.AI_MANGA_CLIENT_ID = "test-client";
  process.env.AI_MANGA_REDIRECT_URI = "http://localhost:3001/api/connectors/ai-manga/callback";
  const { createApp } = await import("../app.js");
  const { createProject } = await import("../lib/projectStore.js");
  app = createApp();
  api = authedAgent(app, env.token);
  await createProject(env.projectFile, { name: "Test Project", scanRoot: env.scanRoot });

  // Simulate a completed OAuth connect — connectors.test.ts already covers the actual
  // authorize/callback exchange, this test is about the publish flow itself.
  const { updateUser } = await import("../lib/authStore.js");
  await updateUser(env.userId, {
    aiMangaConnection: { accessToken: "valid-token", refreshToken: "refresh-token", expiresAt: Date.now() + 60 * 60 * 1000, accountLabel: "Test Creator" },
  });
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV, LETTERING_DATA_DIR: process.env.LETTERING_DATA_DIR };
  process.env.AI_MANGA_CLIENT_ID = "test-client";
  process.env.AI_MANGA_REDIRECT_URI = "http://localhost:3001/api/connectors/ai-manga/callback";
  vi.unstubAllGlobals();
});

async function waitForJob(jobId: string, timeoutMs = 5000): Promise<{ status: string; publicUrl?: string; error?: string }> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const res = await api.get(`/api/volumes/${VOLUME_ID}/connectors/ai-manga/publish/${jobId}`);
    if (res.body.status !== "uploading" && res.body.status !== "validating") return res.body;
    if (Date.now() > deadline) throw new Error("timed out waiting for publish job");
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
}

function metadata(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    seriesTitle: "City After Sunset",
    sourceLanguage: "en",
    chapterNumber: 1,
    chapterTitle: "The Signal",
    published: true,
    accessMode: "free",
    ...overrides,
  });
}

describe("POST /api/volumes/:id/connectors/ai-manga/publish", () => {
  it("400s when no pages are attached", async () => {
    const res = await api.post(`/api/volumes/${VOLUME_ID}/connectors/ai-manga/publish`).field("metadata", metadata());
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("no_pages");
  });

  it("409s when the connector isn't configured", async () => {
    delete process.env.AI_MANGA_CLIENT_ID;
    const res = await api
      .post(`/api/volumes/${VOLUME_ID}/connectors/ai-manga/publish`)
      .field("metadata", metadata())
      .attach("pages", Buffer.from("fake-png"), "page_01.png");
    expect(res.status).toBe(409);
    expect(res.body.error).toBe("connector_not_configured");
  });

  it("starts a job, uploads a ZIP, and reflects the connector's published status", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL) => {
        const url = input.toString();
        if (url.endsWith("/api/v1/connect/imports")) {
          return new Response(JSON.stringify({ id: "import-1", upload_url: "https://r2.example/upload" }), { status: 201 });
        }
        if (url === "https://r2.example/upload") {
          return new Response(null, { status: 200 });
        }
        if (url.includes("/api/v1/connect/imports/import-1")) {
          return new Response(JSON.stringify({ status: "published", public_url: "https://a-i-manga.com/w/1" }), { status: 200 });
        }
        throw new Error(`unexpected fetch: ${url}`);
      })
    );

    const startRes = await api
      .post(`/api/volumes/${VOLUME_ID}/connectors/ai-manga/publish`)
      .field("metadata", metadata())
      .attach("pages", Buffer.from("fake-page-1"), "page_01.png")
      .attach("pages", Buffer.from("fake-page-2"), "page_02.png");
    expect(startRes.status).toBe(200);
    expect(startRes.body.jobId).toBeTruthy();

    const finished = await waitForJob(startRes.body.jobId);
    expect(finished.status).toBe("published");
    expect(finished.publicUrl).toBe("https://a-i-manga.com/w/1");
  });

  it("reuses the same external ids on a second publish of the same chapter", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL, init?: RequestInit) => {
        const url = input.toString();
        if (url.endsWith("/api/v1/connect/imports")) {
          const body = JSON.parse(init!.body as string);
          expect(body.manifest.chapters[0].external_id).toMatch(new RegExp(`^comikumi-.*-${VOLUME_ID}$`));
          return new Response(JSON.stringify({ id: "import-2", upload_url: "https://r2.example/upload" }), { status: 201 });
        }
        if (url === "https://r2.example/upload") return new Response(null, { status: 200 });
        return new Response(JSON.stringify({ status: "published", public_url: "https://a-i-manga.com/w/1" }), { status: 200 });
      })
    );
    const startRes = await api
      .post(`/api/volumes/${VOLUME_ID}/connectors/ai-manga/publish`)
      .field("metadata", metadata({ chapterTitle: "The Signal (revised)" }))
      .attach("pages", Buffer.from("fake-page-1"), "page_01.png");
    expect(startRes.status).toBe(200);
    await waitForJob(startRes.body.jobId);
  });
});

describe("GET /api/volumes/:id/connectors/ai-manga/publish/:jobId", () => {
  it("404s for an unknown job id", async () => {
    const res = await api.get(`/api/volumes/${VOLUME_ID}/connectors/ai-manga/publish/does-not-exist`);
    expect(res.status).toBe(404);
  });
});
