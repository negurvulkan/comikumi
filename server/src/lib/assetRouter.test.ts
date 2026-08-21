import { beforeAll, describe, expect, it } from "vitest";
import type { Express } from "express";
import path from "node:path";
import request from "supertest";
import { setupTestEnv, type TestEnv } from "../test-utils/fixtures.js";

// Exercises the generic createAssetRouter factory (shared by fonts/images/bubble-svgs)
// via the fonts.ts router — merge/collision/upload-target logic is identical for all
// three, so one thorough pass here covers multer 1->2 + the merge algorithm itself.
let app: Express;
let env: TestEnv;

beforeAll(async () => {
  env = await setupTestEnv();
  const { createApp } = await import("../app.js");
  const { createProject } = await import("./projectStore.js");
  app = createApp();
  await createProject(env.projectFile, { name: "Test Project", scanRoot: env.scanRoot });
});

describe("GET /api/fonts (no project assetsDir configured)", () => {
  it("starts with an empty list and creates the global dir on demand", async () => {
    const res = await request(app).get("/api/fonts");
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });
});

describe("POST /api/fonts (upload)", () => {
  it("rejects a file with a disallowed extension", async () => {
    const res = await request(app).post("/api/fonts").attach("font", Buffer.from("not a font"), "evil.exe");
    expect(res.status).toBe(400);
  });

  it("uploads to the global dir when no project assetsDir is configured, and lists it back with family derived from the filename", async () => {
    const res = await request(app).post("/api/fonts").attach("font", Buffer.from([0, 1, 2, 3]), "MyFont.ttf");
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ ok: true, fileName: "MyFont.ttf", scope: "global" });

    const list = await request(app).get("/api/fonts");
    expect(list.body).toContainEqual(expect.objectContaining({ fileName: "MyFont.ttf", family: "MyFont", scope: "global" }));
  });

  it("serves the uploaded file's exact bytes back via GET /file/:fileName", async () => {
    const bytes = Buffer.from([9, 8, 7, 6, 5]);
    await request(app).post("/api/fonts").attach("font", bytes, "Roundtrip.ttf");
    const res = await request(app).get("/api/fonts/file/Roundtrip.ttf");
    expect(res.status).toBe(200);
    expect(Buffer.compare(res.body, bytes)).toBe(0);
  });

  it("rejects an unsafe file name in the serve route", async () => {
    const res = await request(app).get("/api/fonts/file/..%2F..%2Fetc%2Fpasswd.ttf");
    expect(res.status).toBe(400);
  });
});

describe("project-specific assetsDir: merge + collision", () => {
  const projectAssetsDir = () => path.join(env.dataDir, "..", "project-assets");

  it("uploads go to the project dir once assetsDir is configured, scoped 'project'", async () => {
    const settingsRes = await request(app)
      .put("/api/settings")
      .send({ scanRoot: env.scanRoot, assetsDir: projectAssetsDir() });
    expect(settingsRes.status).toBe(200);

    const upload = await request(app).post("/api/fonts").attach("font", Buffer.from([1]), "ProjectOnly.ttf");
    expect(upload.body).toMatchObject({ scope: "project" });

    const list = await request(app).get("/api/fonts");
    expect(list.body).toContainEqual(expect.objectContaining({ fileName: "ProjectOnly.ttf", scope: "project" }));
    // The earlier global upload is still visible alongside it (additive, not replacing).
    expect(list.body).toContainEqual(expect.objectContaining({ fileName: "MyFont.ttf", scope: "global" }));
  });

  it("a project-scoped file with the same name as a global one wins, in both listing and serving", async () => {
    const globalBytes = Buffer.from("global-version");
    const projectBytes = Buffer.from("project-version");

    // Force the collision: upload the same filename to the global dir directly via
    // the fixture-independent low-level route isn't available, so instead clear
    // assetsDir, upload globally, then restore assetsDir and upload the same name.
    await request(app).put("/api/settings").send({ scanRoot: env.scanRoot, assetsDir: "" });
    await request(app).post("/api/fonts").attach("font", globalBytes, "Collide.ttf");
    await request(app).put("/api/settings").send({ scanRoot: env.scanRoot, assetsDir: projectAssetsDir() });
    await request(app).post("/api/fonts").attach("font", projectBytes, "Collide.ttf");

    const list = await request(app).get("/api/fonts");
    const collideEntries = list.body.filter((f: { fileName: string }) => f.fileName === "Collide.ttf");
    expect(collideEntries).toHaveLength(1);
    expect(collideEntries[0].scope).toBe("project");

    const served = await request(app).get("/api/fonts/file/Collide.ttf");
    expect(Buffer.compare(served.body, projectBytes)).toBe(0);
  });
});
