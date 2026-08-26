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
  // Unlike fonts/images (global-library assets), entities live in the project file
  // itself, so /api/entities 409s with no_active_project until one is open.
  await createProject(env.projectFile, { name: "Test Project", scanRoot: env.scanRoot });
});

// A tiny, valid PNG — same fixture used across images.test.ts/bubbleSvgs.test.ts.
const TINY_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  "base64"
);

describe("entity image galleries (folder-per-entity)", () => {
  it("uploads into the entity's own folder, visible there and nowhere else", async () => {
    const entity = (await api.post("/api/entities").send({ name: "Rin" })).body.at(-1);

    const upload = await api.post("/api/entity-images").field("folder", entity.id).attach("image", TINY_PNG, "sketch.png");
    expect(upload.status).toBe(200);
    expect(upload.body).toMatchObject({ ok: true, fileName: "sketch.png", folder: entity.id });

    const gallery = await api.get(`/api/entity-images?folder=${entity.id}`);
    expect(gallery.body.files.map((f: { fileName: string }) => f.fileName)).toContain("sketch.png");

    const root = await api.get("/api/entity-images");
    expect(root.body.files).toEqual([]);
    expect(root.body.subfolders).toContain(entity.id);
  });

  it("deletes a single image from an entity's gallery", async () => {
    const entity = (await api.post("/api/entities").send({ name: "Mika" })).body.at(-1);
    await api.post("/api/entity-images").field("folder", entity.id).attach("image", TINY_PNG, "portrait.png");

    const del = await api.delete(`/api/entity-images/file/portrait.png?folder=${entity.id}`);
    expect(del.status).toBe(200);

    const gallery = await api.get(`/api/entity-images?folder=${entity.id}`);
    expect(gallery.body.files).toEqual([]);
  });
});
