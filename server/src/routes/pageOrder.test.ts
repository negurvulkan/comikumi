import { beforeAll, describe, expect, it } from "vitest";
import type { Express } from "express";
import { setupTestEnv, authedAgent, type TestEnv } from "../test-utils/fixtures.js";

let app: Express;
let env: TestEnv;
let api: ReturnType<typeof authedAgent>;

const VOLUME_ID = "Volume_01";
// Same fixed tiny valid PNG bytes used across pages.test.ts.
const TINY_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  "base64"
);

beforeAll(async () => {
  env = await setupTestEnv();
  const { createApp } = await import("../app.js");
  const { createProject } = await import("../lib/projectStore.js");
  app = createApp();
  api = authedAgent(app, env.token);
  await createProject(env.projectFile, { name: "Test Project", scanRoot: env.scanRoot });
  // Fixture already has page_01.png; add a second page for a meaningful order.
  await api.post(`/api/volumes/${VOLUME_ID}/pages`).attach("pages", TINY_PNG, "page_02.png");
});

describe("GET /:id/pages/order", () => {
  it("404s for an unknown volume", async () => {
    const res = await api.get("/api/volumes/does-not-exist/pages/order");
    expect(res.status).toBe(404);
    expect(res.body.error).toBe("volume_not_found");
  });

  it("returns the derived natural order and a NEW_DOCUMENT_ETAG when nothing was saved yet", async () => {
    const res = await api.get(`/api/volumes/${VOLUME_ID}/pages/order`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ order: ["page_01", "page_02"] });
    expect(res.headers["etag"]).toBe('"new"');
  });
});

describe("PUT /:id/pages/order", () => {
  it("rejects a body that doesn't match PageOrderDocumentSchema", async () => {
    const res = await api.put(`/api/volumes/${VOLUME_ID}/pages/order`).send({ order: "not an array" });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("invalid_page_order");
  });

  it("404s for an unknown volume", async () => {
    const res = await api.put("/api/volumes/does-not-exist/pages/order").send({ order: [] });
    expect(res.status).toBe(404);
    expect(res.body.error).toBe("volume_not_found");
  });

  it("saves a new order and it's readable back afterward, tolerating a stale entry", async () => {
    const put = await api.put(`/api/volumes/${VOLUME_ID}/pages/order`).send({ order: ["page_02", "page_99", "page_01"] });
    expect(put.status).toBe(200);
    expect(put.body).toEqual({ ok: true });

    const get = await api.get(`/api/volumes/${VOLUME_ID}/pages/order`);
    // The raw saved document still contains the stale "page_99" entry (PUT doesn't
    // validate against disk) ...
    expect(get.body.order).toEqual(["page_02", "page_99", "page_01"]);

    // ... but listPages()-backed reads (the actual page grid) silently drop it.
    const list = await api.get(`/api/volumes/${VOLUME_ID}/pages`);
    expect(list.body.map((p: { page: string }) => p.page)).toEqual(["page_02", "page_01"]);
  });
});

describe("optimistic concurrency (ETag / If-Match)", () => {
  it("PUT with a stale If-Match 409s instead of overwriting a newer save", async () => {
    const first = await api.get(`/api/volumes/${VOLUME_ID}/pages/order`);
    const staleEtag = first.headers["etag"] as string;

    const otherSave = await api.put(`/api/volumes/${VOLUME_ID}/pages/order`).send({ order: ["page_01", "page_02"] });
    expect(otherSave.status).toBe(200);

    const conflicting = await api
      .put(`/api/volumes/${VOLUME_ID}/pages/order`)
      .set("If-Match", staleEtag)
      .send({ order: ["page_02", "page_01"] });
    expect(conflicting.status).toBe(409);
    expect(conflicting.body.error).toBe("page_order_conflict");
    expect(conflicting.body.currentOrder).toEqual(["page_01", "page_02"]);
  });

  it("PUT without If-Match still succeeds (unchanged behavior)", async () => {
    const res = await api.put(`/api/volumes/${VOLUME_ID}/pages/order`).send({ order: ["page_01", "page_02"] });
    expect(res.status).toBe(200);
  });
});
