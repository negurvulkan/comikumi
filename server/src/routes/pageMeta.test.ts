import { beforeAll, describe, expect, it } from "vitest";
import type { Express } from "express";
import { setupTestEnv, authedAgent, type TestEnv } from "../test-utils/fixtures.js";

let app: Express;
let env: TestEnv;
let api: ReturnType<typeof authedAgent>;

const VOLUME_ID = "Volume_01";

beforeAll(async () => {
  env = await setupTestEnv();
  const { createApp } = await import("../app.js");
  const { createProject } = await import("../lib/projectStore.js");
  app = createApp();
  api = authedAgent(app, env.token);
  await createProject(env.projectFile, { name: "Test Project", scanRoot: env.scanRoot });
});

describe("GET /:id/pages/meta", () => {
  it("404s for an unknown volume", async () => {
    const res = await api.get("/api/volumes/does-not-exist/pages/meta");
    expect(res.status).toBe(404);
    expect(res.body.error).toBe("volume_not_found");
  });

  it("returns an empty document and a NEW_DOCUMENT_ETAG when nothing was saved yet", async () => {
    const res = await api.get(`/api/volumes/${VOLUME_ID}/pages/meta`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ chapters: [], pages: {} });
    expect(res.headers["etag"]).toBe('"new"');
  });
});

describe("PUT /:id/pages/meta", () => {
  it("rejects a body that doesn't match PageMetaDocumentSchema", async () => {
    const res = await api.put(`/api/volumes/${VOLUME_ID}/pages/meta`).send({ chapters: "not an array" });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("invalid_page_meta");
  });

  it("404s for an unknown volume", async () => {
    const res = await api.put("/api/volumes/does-not-exist/pages/meta").send({ chapters: [], pages: {} });
    expect(res.status).toBe(404);
    expect(res.body.error).toBe("volume_not_found");
  });

  it("saves chapters and per-page tagging and reads it back afterward", async () => {
    const doc = {
      chapters: [{ id: "ch1", name: "Kapitel 1" }],
      pages: { page_01: { type: "cover" as const }, page_02: { type: "chapterInterstitial" as const, chapterId: "ch1" } },
    };
    const put = await api.put(`/api/volumes/${VOLUME_ID}/pages/meta`).send(doc);
    expect(put.status).toBe(200);
    expect(put.body).toEqual({ ok: true });

    const get = await api.get(`/api/volumes/${VOLUME_ID}/pages/meta`);
    expect(get.body).toEqual(doc);
  });
});

describe("optimistic concurrency (ETag / If-Match)", () => {
  it("PUT with a stale If-Match 409s instead of overwriting a newer save", async () => {
    const first = await api.get(`/api/volumes/${VOLUME_ID}/pages/meta`);
    const staleEtag = first.headers["etag"] as string;

    const otherSave = await api.put(`/api/volumes/${VOLUME_ID}/pages/meta`).send({ chapters: [], pages: {} });
    expect(otherSave.status).toBe(200);

    const conflicting = await api
      .put(`/api/volumes/${VOLUME_ID}/pages/meta`)
      .set("If-Match", staleEtag)
      .send({ chapters: [{ id: "ch1", name: "X" }], pages: {} });
    expect(conflicting.status).toBe(409);
    expect(conflicting.body.error).toBe("page_meta_conflict");
  });

  it("PUT without If-Match still succeeds (unchanged behavior)", async () => {
    const res = await api.put(`/api/volumes/${VOLUME_ID}/pages/meta`).send({ chapters: [], pages: {} });
    expect(res.status).toBe(200);
  });
});
