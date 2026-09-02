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

describe("GET /:id/workflow", () => {
  it("404s for an unknown volume", async () => {
    const res = await api.get("/api/volumes/does-not-exist/workflow");
    expect(res.status).toBe(404);
    expect(res.body.error).toBe("volume_not_found");
  });

  it("returns an empty document and a NEW_DOCUMENT_ETAG when nothing was saved yet", async () => {
    const res = await api.get(`/api/volumes/${VOLUME_ID}/workflow`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ pages: {} });
    expect(res.headers["etag"]).toBe('"new"');
  });
});

describe("PUT /:id/workflow", () => {
  it("rejects a body that doesn't match WorkflowDocumentSchema", async () => {
    const res = await api.put(`/api/volumes/${VOLUME_ID}/workflow`).send({ pages: "not an object" });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("invalid_workflow");
  });

  it("404s for an unknown volume", async () => {
    const res = await api.put("/api/volumes/does-not-exist/workflow").send({ pages: {} });
    expect(res.status).toBe(404);
    expect(res.body.error).toBe("volume_not_found");
  });

  it("saves per-page/per-language status and assignee, and reads it back afterward, applying schema defaults", async () => {
    const doc = {
      pages: {
        page_01: {
          cleaning: { status: "approved" as const },
          languages: { de: { translation: { status: "in_progress" as const, assigneeUserId: "u1" } } },
        },
      },
    };
    const put = await api.put(`/api/volumes/${VOLUME_ID}/workflow`).send(doc);
    expect(put.status).toBe(200);
    expect(put.body).toEqual({ ok: true });

    const get = await api.get(`/api/volumes/${VOLUME_ID}/workflow`);
    expect(get.body).toEqual(doc);
  });
});

describe("optimistic concurrency (ETag / If-Match)", () => {
  it("PUT with a stale If-Match 409s instead of overwriting a newer save", async () => {
    const first = await api.get(`/api/volumes/${VOLUME_ID}/workflow`);
    const staleEtag = first.headers["etag"] as string;

    const otherSave = await api.put(`/api/volumes/${VOLUME_ID}/workflow`).send({ pages: {} });
    expect(otherSave.status).toBe(200);

    const conflicting = await api
      .put(`/api/volumes/${VOLUME_ID}/workflow`)
      .set("If-Match", staleEtag)
      .send({ pages: { page_01: { languages: {} } } });
    expect(conflicting.status).toBe(409);
    expect(conflicting.body.error).toBe("workflow_conflict");
  });
});

describe("GET /:id/workflow/assignable-members", () => {
  it("404s for an unknown volume", async () => {
    const res = await api.get("/api/volumes/does-not-exist/workflow/assignable-members");
    expect(res.status).toBe(404);
    expect(res.body.error).toBe("volume_not_found");
  });

  it("returns a {userId, username}[] list", async () => {
    const res = await api.get(`/api/volumes/${VOLUME_ID}/workflow/assignable-members`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    for (const m of res.body) {
      expect(typeof m.userId).toBe("string");
      expect(typeof m.username).toBe("string");
    }
  });
});
