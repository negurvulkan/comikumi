import { beforeAll, describe, expect, it } from "vitest";
import type { Express } from "express";
import path from "node:path";
import request from "supertest";
import { setupTestEnv, type TestEnv } from "../test-utils/fixtures.js";

let app: Express;
let env: TestEnv;

beforeAll(async () => {
  env = await setupTestEnv();
  const { createApp } = await import("../app.js");
  const { createProject } = await import("../lib/projectStore.js");
  app = createApp();
  await createProject(env.projectFile, { name: "Test Project", scanRoot: env.scanRoot });
});

describe("GET /api/settings", () => {
  it("returns the project's settings plus existence flags for the configured folders", async () => {
    const res = await request(app).get("/api/settings");
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ scanRoot: env.scanRoot, scanRootExists: true, assetsDirExists: true, thumbnailsDirExists: true });
  });
});

describe("PUT /api/settings", () => {
  it("rejects an empty scanRoot", async () => {
    const res = await request(app).put("/api/settings").send({ scanRoot: "" });
    expect(res.status).toBe(400);
  });

  it("reports assetsDirExists=false for a configured-but-nonexistent folder", async () => {
    const missingDir = path.join(env.dataDir, "..", "does-not-exist-yet");
    const res = await request(app).put("/api/settings").send({ scanRoot: env.scanRoot, assetsDir: missingDir });
    expect(res.status).toBe(200);
    expect(res.body.assetsDirExists).toBe(false);
  });

  it("persists the update — a subsequent GET reflects it", async () => {
    await request(app).put("/api/settings").send({ scanRoot: env.scanRoot, description: "Ein Testprojekt" });
    const res = await request(app).get("/api/settings");
    expect(res.body.description).toBe("Ein Testprojekt");
  });
});
