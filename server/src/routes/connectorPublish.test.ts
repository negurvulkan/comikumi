import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type { Express } from "express";
import { setupTestEnv, authedAgent, type TestEnv } from "../test-utils/fixtures.js";

let app: Express;
let env: TestEnv;
let api: ReturnType<typeof authedAgent>;

const VOLUME_ID = "Volume_01";
const ORIGINAL_ENV = { ...process.env };
// Must clear AI MANGA's 1 KiB minimum page size (MIN_PAGE_BYTES in connectorPublish.ts)
// — anything shorter 400s as "page_too_small" before ever reaching the check a given
// test actually means to exercise.
const VALID_PAGE = Buffer.alloc(2048, 0xaa);

/** Every fetch mock below needs to answer /series (ensureSeries, best-effort — see
 * aiMangaConnector.ts) even though most tests don't care about its outcome. */
function stubHappyPathFetch(overrides: {
  onImportCreate?: (body: Record<string, unknown>) => void;
  importStatus?: { status: string; public_url?: string };
} = {}) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string | URL, init?: RequestInit) => {
      const url = input.toString();
      if (url.endsWith("/api/v1/connect/series")) {
        return new Response(JSON.stringify({ id: "series-1" }), { status: 201 });
      }
      if (url.endsWith("/api/v1/connect/imports")) {
        overrides.onImportCreate?.(JSON.parse(init!.body as string));
        return new Response(JSON.stringify({ id: "import-1", upload_url: "https://r2.example/upload" }), { status: 201 });
      }
      if (url === "https://r2.example/upload") {
        return new Response(null, { status: 200 });
      }
      if (url.includes("/api/v1/connect/imports/")) {
        return new Response(JSON.stringify(overrides.importStatus ?? { status: "published", public_url: "https://a-i-manga.com/w/1" }), {
          status: 200,
        });
      }
      throw new Error(`unexpected fetch: ${url}`);
    })
  );
}

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
    aiMangaConnection: {
      accessToken: "valid-token",
      refreshToken: "refresh-token",
      expiresAt: Date.now() + 60 * 60 * 1000,
      accountLabel: "Test Creator",
      accountId: "creator-1",
    },
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
    languageCode: "en",
    chapterId: "chapter-1",
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
      .attach("pages", VALID_PAGE, "page_01.png");
    expect(res.status).toBe(409);
    expect(res.body.error).toBe("connector_not_configured");
  });

  it("400s for a ComiKumi language code with no AI MANGA equivalent", async () => {
    const res = await api
      .post(`/api/volumes/${VOLUME_ID}/connectors/ai-manga/publish`)
      .field("metadata", metadata({ languageCode: "fr-ca" }))
      .attach("pages", VALID_PAGE, "page_01.png");
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("unsupported_source_language");
  });

  it("maps ComiKumi's 'jp' code to AI MANGA's 'ja' source_language", async () => {
    let capturedLanguage: string | undefined;
    stubHappyPathFetch({ onImportCreate: (body) => (capturedLanguage = body.source_language as string) });
    const startRes = await api
      .post(`/api/volumes/${VOLUME_ID}/connectors/ai-manga/publish`)
      .field("metadata", metadata({ languageCode: "jp", chapterId: "chapter-jp" }))
      .attach("pages", VALID_PAGE, "page_01.png");
    expect(startRes.status).toBe(200);
    await waitForJob(startRes.body.jobId);
    expect(capturedLanguage).toBe("ja");
  });

  it("400s for 'published: true' combined with 'supporter_only' (AI MANGA only allows immediate publish for free)", async () => {
    const res = await api
      .post(`/api/volumes/${VOLUME_ID}/connectors/ai-manga/publish`)
      .field("metadata", metadata({ published: true, accessMode: "supporter_only" }))
      .attach("pages", VALID_PAGE, "page_01.png");
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("publish_fields_required");
  });

  it("400s when more than 100 pages are attached", async () => {
    const req = api.post(`/api/volumes/${VOLUME_ID}/connectors/ai-manga/publish`).field("metadata", metadata({ chapterId: "chapter-toobig" }));
    for (let i = 0; i < 101; i++) req.attach("pages", Buffer.from("fake-page-bytes"), `page_${i}.png`);
    const res = await req;
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("too_many_pages");
  });

  it("400s for a page smaller than AI MANGA's 1 KiB minimum", async () => {
    const res = await api
      .post(`/api/volumes/${VOLUME_ID}/connectors/ai-manga/publish`)
      .field("metadata", metadata({ chapterId: "chapter-tiny" }))
      .attach("pages", Buffer.from("x"), "page_01.png");
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("page_too_small");
  });

  it("starts a job, uploads a ZIP, and reflects the connector's published status", async () => {
    stubHappyPathFetch();

    const startRes = await api
      .post(`/api/volumes/${VOLUME_ID}/connectors/ai-manga/publish`)
      .field("metadata", metadata({ chapterId: "chapter-happy" }))
      .attach("pages", VALID_PAGE, "page_01.png")
      .attach("pages", VALID_PAGE, "page_02.png");
    expect(startRes.status).toBe(200);
    expect(startRes.body.jobId).toBeTruthy();

    const finished = await waitForJob(startRes.body.jobId);
    expect(finished.status).toBe("published");
    expect(finished.publicUrl).toBe("https://a-i-manga.com/w/1");
  });

  it("terminates successfully on an unrecognized non-failure status (draft workflow leniency)", async () => {
    stubHappyPathFetch({ importStatus: { status: "ready_for_review" } });
    const startRes = await api
      .post(`/api/volumes/${VOLUME_ID}/connectors/ai-manga/publish`)
      .field("metadata", metadata({ published: false, chapterId: "chapter-draft" }))
      .attach("pages", VALID_PAGE, "page_01.png");
    expect(startRes.status).toBe(200);
    const finished = await waitForJob(startRes.body.jobId);
    expect(finished.status).toBe("published");
  });

  it("gives two chapters of the same volume distinct external ids", async () => {
    const seenIds: string[] = [];
    stubHappyPathFetch({ onImportCreate: (body) => seenIds.push((body.manifest as { chapters: { external_id: string }[] }).chapters[0].external_id) });

    const first = await api
      .post(`/api/volumes/${VOLUME_ID}/connectors/ai-manga/publish`)
      .field("metadata", metadata({ chapterId: "chapter-a" }))
      .attach("pages", VALID_PAGE, "page_01.png");
    await waitForJob(first.body.jobId);

    const second = await api
      .post(`/api/volumes/${VOLUME_ID}/connectors/ai-manga/publish`)
      .field("metadata", metadata({ chapterId: "chapter-b", chapterNumber: 2 }))
      .attach("pages", VALID_PAGE, "page_01.png");
    await waitForJob(second.body.jobId);

    expect(seenIds).toHaveLength(2);
    expect(seenIds[0]).not.toBe(seenIds[1]);
  });

  it("reuses the same external id on a second publish of the same chapter", async () => {
    const seenIds: string[] = [];
    stubHappyPathFetch({ onImportCreate: (body) => seenIds.push((body.manifest as { chapters: { external_id: string }[] }).chapters[0].external_id) });

    const first = await api
      .post(`/api/volumes/${VOLUME_ID}/connectors/ai-manga/publish`)
      .field("metadata", metadata({ chapterId: "chapter-repeat" }))
      .attach("pages", VALID_PAGE, "page_01.png");
    await waitForJob(first.body.jobId);

    const second = await api
      .post(`/api/volumes/${VOLUME_ID}/connectors/ai-manga/publish`)
      .field("metadata", metadata({ chapterId: "chapter-repeat", chapterTitle: "The Signal (revised)" }))
      .attach("pages", VALID_PAGE, "page_01.png");
    await waitForJob(second.body.jobId);

    expect(seenIds[0]).toBe(seenIds[1]);
  });

  it("409s once the project's stored AI MANGA creator id no longer matches the connected account", async () => {
    stubHappyPathFetch();
    // First publish binds the project to "creator-1" (the connected account, per
    // beforeAll's fixture setup).
    const first = await api
      .post(`/api/volumes/${VOLUME_ID}/connectors/ai-manga/publish`)
      .field("metadata", metadata({ chapterId: "chapter-lock" }))
      .attach("pages", VALID_PAGE, "page_01.png");
    await waitForJob(first.body.jobId);

    // A different ComiKumi user connects a DIFFERENT AI MANGA account and tries to
    // publish the same project.
    const { createUser, updateUser, signToken } = await import("../lib/authStore.js");
    const otherUser = await createUser("other-letterer", "pw", false);
    await updateUser(otherUser.id, {
      aiMangaConnection: {
        accessToken: "other-token",
        refreshToken: "other-refresh",
        expiresAt: Date.now() + 60 * 60 * 1000,
        accountLabel: "Other Creator",
        accountId: "creator-2",
      },
    });
    const addMember = await api.post("/api/project/members").send({ username: "other-letterer", role: "letterer" });
    expect(addMember.status).toBe(201);
    const otherToken = await signToken(otherUser);

    const otherApi = authedAgent(app, otherToken);
    const res = await otherApi
      .post(`/api/volumes/${VOLUME_ID}/connectors/ai-manga/publish`)
      .field("metadata", metadata({ chapterId: "chapter-lock" }))
      .attach("pages", VALID_PAGE, "page_01.png");
    expect(res.status).toBe(409);
    expect(res.body.error).toBe("connector_account_mismatch");
  });
});

describe("GET /api/volumes/:id/connectors/ai-manga/publish/:jobId", () => {
  it("404s for an unknown job id", async () => {
    const res = await api.get(`/api/volumes/${VOLUME_ID}/connectors/ai-manga/publish/does-not-exist`);
    expect(res.status).toBe(404);
  });
});
