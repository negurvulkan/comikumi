import { beforeAll, describe, expect, it } from "vitest";
import type { Express } from "express";
import { setupTestEnv, authedAgent, type TestEnv } from "../test-utils/fixtures.js";

let app: Express;
let env: TestEnv;
let api: ReturnType<typeof authedAgent>;

beforeAll(async () => {
  env = await setupTestEnv();
  const { createApp } = await import("../app.js");
  const { createProject } = await import("../lib/projectStore.js");
  app = createApp();
  api = authedAgent(app, env.token);
  await createProject(env.projectFile, { name: "Test Project", scanRoot: env.scanRoot });
});

const VOLUME_ID = "Volume_01";

describe("GET /:id/script", () => {
  it("returns an empty document when nothing was saved yet", async () => {
    const res = await api.get(`/api/volumes/${VOLUME_ID}/script`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ pages: [] });
  });

  it("404s for an unknown volume", async () => {
    const res = await api.get(`/api/volumes/does-not-exist/script`);
    expect(res.status).toBe(404);
    expect(res.body.error).toBe("volume_not_found");
  });
});

describe("PUT /:id/script", () => {
  it("rejects a body that doesn't match ScriptDocumentSchema", async () => {
    const res = await api.put(`/api/volumes/${VOLUME_ID}/script`).send({ pages: "not an array" });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("invalid_script");
  });

  it("404s for an unknown volume", async () => {
    const res = await api.put(`/api/volumes/does-not-exist/script`).send({ pages: [] });
    expect(res.status).toBe(404);
    expect(res.body.error).toBe("volume_not_found");
  });

  it("saves a valid script document and it's readable back afterward", async () => {
    const doc = {
      pages: [
        {
          id: "page-1",
          label: "",
          notes: "Kapitelauftakt",
          panels: [
            {
              id: "panel-1",
              sizeHint: "large",
              composition: "Weitwinkel auf die Schule",
              action: "Kei kommt zu spät",
              dialogue: [
                { id: "line-1", characterId: null, text: { de: "Ich bin spät dran!", en: "I'm late!" }, note: "" },
              ],
            },
          ],
        },
      ],
    };
    const put = await api.put(`/api/volumes/${VOLUME_ID}/script`).send(doc);
    expect(put.status).toBe(200);
    expect(put.body).toEqual({ ok: true });

    const get = await api.get(`/api/volumes/${VOLUME_ID}/script`);
    expect(get.body).toMatchObject({
      pages: [expect.objectContaining({ notes: "Kapitelauftakt" })],
    });
    expect(get.body.pages[0].panels[0].dialogue[0].text).toEqual({ de: "Ich bin spät dran!", en: "I'm late!" });
  });
});

describe("optimistic concurrency (ETag / If-Match)", () => {
  it("GET sets an ETag header", async () => {
    const res = await api.get(`/api/volumes/${VOLUME_ID}/script`);
    expect(res.status).toBe(200);
    expect(res.headers["etag"]).toBeTruthy();
  });

  it("PUT with a stale If-Match 409s instead of overwriting a newer save", async () => {
    const first = await api.get(`/api/volumes/${VOLUME_ID}/script`);
    const staleEtag = first.headers["etag"] as string;

    const otherSave = await api.put(`/api/volumes/${VOLUME_ID}/script`).send({ pages: [{ id: "p1", label: "", notes: "other", panels: [] }] });
    expect(otherSave.status).toBe(200);

    const conflicting = await api.put(`/api/volumes/${VOLUME_ID}/script`).set("If-Match", staleEtag).send({ pages: [] });
    expect(conflicting.status).toBe(409);
    expect(conflicting.body.error).toBe("script_conflict");
    expect(conflicting.body.currentScript.pages[0].notes).toBe("other");
  });

  it("PUT without If-Match still succeeds (unchanged behavior)", async () => {
    const res = await api.put(`/api/volumes/${VOLUME_ID}/script`).send({ pages: [] });
    expect(res.status).toBe(200);
  });
});
