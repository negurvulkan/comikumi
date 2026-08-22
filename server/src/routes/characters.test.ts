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

describe("characters CRUD", () => {
  it("starts empty", async () => {
    const res = await api.get("/api/characters");
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it("rejects an invalid character (empty name)", async () => {
    const res = await api.post("/api/characters").send({ name: "" });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("invalid_character");
  });

  it("creates a character with defaults filled in and an id assigned", async () => {
    const res = await api.post("/api/characters").send({ name: "Kei" });
    expect(res.status).toBe(201);
    expect(res.body).toHaveLength(1);
    expect(res.body[0]).toMatchObject({ name: "Kei", color: "#6c8cff", voiceNotes: "" });
    expect(typeof res.body[0].id).toBe("string");
  });

  it("updates an existing character by id", async () => {
    const created = (await api.post("/api/characters").send({ name: "Anna" })).body;
    const id = created[created.length - 1].id;
    const res = await api.put(`/api/characters/${id}`).send({ name: "Anna Updated", color: "#ff0000" });
    expect(res.status).toBe(200);
    const updated = res.body.find((c: { id: string }) => c.id === id);
    expect(updated).toMatchObject({ name: "Anna Updated", color: "#ff0000" });
  });

  it("404s updating an unknown id", async () => {
    const res = await api.put("/api/characters/does-not-exist").send({ name: "X" });
    expect(res.status).toBe(404);
  });

  it("deletes a character by id", async () => {
    const created = (await api.post("/api/characters").send({ name: "ToDelete" })).body;
    const id = created[created.length - 1].id;
    const res = await api.delete(`/api/characters/${id}`);
    expect(res.status).toBe(200);
    expect(res.body.some((c: { id: string }) => c.id === id)).toBe(false);
  });

  it("404s deleting an unknown id", async () => {
    const res = await api.delete("/api/characters/does-not-exist");
    expect(res.status).toBe(404);
  });
});

describe("permissions: viewer role", () => {
  it("can read but not create a character", async () => {
    const { createUser } = await import("../lib/authStore.js");
    await createUser("viewer-user", "pw", false);
    const loginRes = await api.post("/api/auth/login").send({ username: "viewer-user", password: "pw" });
    const viewerToken = loginRes.body.token as string;

    const addMember = await api.post("/api/project/members").send({ username: "viewer-user", role: "viewer" });
    expect(addMember.status).toBe(201);

    const viewerApi = authedAgent(app, viewerToken);
    const readRes = await viewerApi.get("/api/characters");
    expect(readRes.status).toBe(200);

    const writeRes = await viewerApi.post("/api/characters").send({ name: "Should Fail" });
    expect(writeRes.status).toBe(403);
    expect(writeRes.body.error).toBe("forbidden");
  });
});
