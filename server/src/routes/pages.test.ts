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

describe("GET /:id/pages", () => {
  it("lists the fixture page with its real dimensions (exercises image-size)", async () => {
    const res = await api.get(`/api/volumes/${VOLUME_ID}/pages`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual([{ page: "page_01", fileName: "page_01.png", width: 4, height: 4 }]);
  });

  it("404s for an unknown volume", async () => {
    const res = await api.get(`/api/volumes/does-not-exist/pages`);
    expect(res.status).toBe(404);
  });
});

describe("GET /:id/pages/:page/image", () => {
  it("streams the raw page image bytes", async () => {
    const res = await api.get(`/api/volumes/${VOLUME_ID}/pages/page_01/image`);
    expect(res.status).toBe(200);
    expect(res.body.length).toBeGreaterThan(0);
  });

  it("404s for an unknown page", async () => {
    const res = await api.get(`/api/volumes/${VOLUME_ID}/pages/does_not_exist/image`);
    expect(res.status).toBe(404);
  });
});

describe("GET /:id/pages/:page/thumbnail", () => {
  it("generates a JPEG thumbnail on first request (exercises sharp)", async () => {
    const res = await api.get(`/api/volumes/${VOLUME_ID}/pages/page_01/thumbnail`);
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toBe("image/jpeg");
    expect(res.body.length).toBeGreaterThan(0);
  });

  it("serves the cached thumbnail identically on a second request", async () => {
    const first = await api.get(`/api/volumes/${VOLUME_ID}/pages/page_01/thumbnail`);
    const second = await api.get(`/api/volumes/${VOLUME_ID}/pages/page_01/thumbnail`);
    expect(Buffer.compare(first.body, second.body)).toBe(0);
  });
});
