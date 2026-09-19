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

describe("tags CRUD", () => {
  it("starts empty", async () => {
    const res = await api.get("/api/tags");
    expect(res.body).toEqual([]);
  });

  it("rejects an invalid tag (empty name)", async () => {
    const res = await api.post("/api/tags").send({ name: "", color: "#ff0000" });
    expect(res.status).toBe(400);
  });

  it("creates a tag and assigns a server-side id, with semantic flags defaulting to false", async () => {
    const res = await api.post("/api/tags").send({ name: "sfx", color: "#ff0000" });
    expect(res.status).toBe(201);
    expect(res.body[0]).toMatchObject({ name: "sfx", color: "#ff0000", excludeFromQa: false, requiresCharacter: false });
    expect(typeof res.body[0].id).toBe("string");
  });

  it("persists the semantic flags when provided", async () => {
    const res = await api.post("/api/tags").send({ name: "dialogue", color: "#0000ff", requiresCharacter: true, excludeFromQa: false });
    expect(res.status).toBe(201);
    expect(res.body[res.body.length - 1]).toMatchObject({ name: "dialogue", requiresCharacter: true });
  });

  it("updates and deletes a tag by id", async () => {
    const created = (await api.post("/api/tags").send({ name: "temp", color: "#00ff00" })).body;
    const id = created[created.length - 1].id;

    const updated = await api.put(`/api/tags/${id}`).send({ name: "narration", color: "#0000ff" });
    expect(updated.status).toBe(200);
    expect(updated.body.find((tag: { id: string }) => tag.id === id)).toMatchObject({ name: "narration", color: "#0000ff" });

    const deleted = await api.delete(`/api/tags/${id}`);
    expect(deleted.body.some((tag: { id: string }) => tag.id === id)).toBe(false);
  });

  it("404s on update/delete of an unknown id", async () => {
    expect((await api.put("/api/tags/nope").send({ name: "x", color: "#000000" })).status).toBe(404);
    expect((await api.delete("/api/tags/nope")).status).toBe(404);
  });
});
