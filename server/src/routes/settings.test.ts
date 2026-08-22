import { beforeAll, describe, expect, it } from "vitest";
import type { Express } from "express";
import path from "node:path";
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

describe("GET /api/settings", () => {
  it("returns the project's settings plus existence flags for the configured folders", async () => {
    const res = await api.get("/api/settings");
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ scanRoot: env.scanRoot, scanRootExists: true, assetsDirExists: true, thumbnailsDirExists: true });
  });
});

describe("PUT /api/settings", () => {
  it("rejects an empty scanRoot", async () => {
    const res = await api.put("/api/settings").send({ scanRoot: "" });
    expect(res.status).toBe(400);
  });

  it("reports assetsDirExists=false for a configured-but-nonexistent folder", async () => {
    const missingDir = path.join(env.dataDir, "..", "does-not-exist-yet");
    const res = await api.put("/api/settings").send({ scanRoot: env.scanRoot, assetsDir: missingDir });
    expect(res.status).toBe(200);
    expect(res.body.assetsDirExists).toBe(false);
  });

  it("persists the update — a subsequent GET reflects it", async () => {
    await api.put("/api/settings").send({ scanRoot: env.scanRoot, description: "Ein Testprojekt" });
    const res = await api.get("/api/settings");
    expect(res.body.description).toBe("Ein Testprojekt");
  });

  it("persists coverImagePath", async () => {
    const coverPath = path.join(env.scanRoot, "Volume_01", "volume_01_empty", "page_01.png");
    await api.put("/api/settings").send({ scanRoot: env.scanRoot, coverImagePath: coverPath });
    const res = await api.get("/api/settings");
    expect(res.body.coverImagePath).toBe(coverPath);
  });
});

describe("permissions: letterer role", () => {
  it("can read settings but not change them (admin-only)", async () => {
    const { createUser } = await import("../lib/authStore.js");
    await createUser("letterer-user", "pw", false);
    const loginRes = await api.post("/api/auth/login").send({ username: "letterer-user", password: "pw" });
    const lettererToken = loginRes.body.token as string;

    const addMember = await api.post("/api/project/members").send({ username: "letterer-user", role: "letterer" });
    expect(addMember.status).toBe(201);

    const lettererApi = authedAgent(app, lettererToken);
    const readRes = await lettererApi.get("/api/settings");
    expect(readRes.status).toBe(200);

    const writeRes = await lettererApi.put("/api/settings").send({ scanRoot: env.scanRoot, description: "Should fail" });
    expect(writeRes.status).toBe(403);
    expect(writeRes.body.error).toBe("forbidden");
  });
});
