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

describe("glossary CRUD", () => {
  it("starts empty", async () => {
    const res = await api.get("/api/glossary");
    expect(res.body).toEqual([]);
  });

  it("rejects an invalid entry (empty term)", async () => {
    const res = await api.post("/api/glossary").send({ term: "" });
    expect(res.status).toBe(400);
  });

  it("creates an entry with translations and note", async () => {
    const res = await api
      .post("/api/glossary")
      .send({ term: "Klinge", translations: { en: "Blade" }, note: "immer groß" });
    expect(res.status).toBe(201);
    expect(res.body[0]).toMatchObject({ term: "Klinge", translations: { en: "Blade" }, note: "immer groß" });
  });

  it("updates and deletes an entry by id", async () => {
    const created = (await api.post("/api/glossary").send({ term: "Schwert" })).body;
    const id = created[created.length - 1].id;

    const updated = await api.put(`/api/glossary/${id}`).send({ term: "Schwert", translations: { en: "Sword" } });
    expect(updated.status).toBe(200);
    expect(updated.body.find((e: { id: string }) => e.id === id)).toMatchObject({ translations: { en: "Sword" } });

    const deleted = await api.delete(`/api/glossary/${id}`);
    expect(deleted.status).toBe(200);
    expect(deleted.body.some((e: { id: string }) => e.id === id)).toBe(false);
  });

  it("404s on update/delete of an unknown id", async () => {
    expect((await api.put("/api/glossary/nope").send({ term: "x" })).status).toBe(404);
    expect((await api.delete("/api/glossary/nope")).status).toBe(404);
  });
});
