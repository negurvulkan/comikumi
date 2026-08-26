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

describe("entities CRUD", () => {
  it("starts empty", async () => {
    const res = await api.get("/api/entities");
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it("rejects an invalid entity (empty name)", async () => {
    const res = await api.post("/api/entities").send({ name: "" });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("invalid_entity");
  });

  it("creates an entity with defaults filled in and an id assigned", async () => {
    const res = await api.post("/api/entities").send({ name: "Kei" });
    expect(res.status).toBe(201);
    expect(res.body).toHaveLength(1);
    expect(res.body[0]).toMatchObject({ name: "Kei", type: "character", color: "#6c8cff", summary: "", notes: "" });
    expect(typeof res.body[0].id).toBe("string");
  });

  it("creates a non-character entity with an explicit type", async () => {
    const res = await api.post("/api/entities").send({ name: "Guto Café", type: "location", summary: "Wo alle abhängen" });
    expect(res.status).toBe(201);
    const loc = res.body.find((e: { name: string }) => e.name === "Guto Café");
    expect(loc).toMatchObject({ type: "location", summary: "Wo alle abhängen" });
  });

  it("updates an existing entity by id", async () => {
    const created = (await api.post("/api/entities").send({ name: "Anna" })).body;
    const id = created[created.length - 1].id;
    const res = await api.put(`/api/entities/${id}`).send({ name: "Anna Updated", type: "character", color: "#ff0000" });
    expect(res.status).toBe(200);
    const updated = res.body.find((e: { id: string }) => e.id === id);
    expect(updated).toMatchObject({ name: "Anna Updated", color: "#ff0000" });
  });

  it("404s updating an unknown id", async () => {
    const res = await api.put("/api/entities/does-not-exist").send({ name: "X" });
    expect(res.status).toBe(404);
  });

  it("404s deleting an unknown id", async () => {
    const res = await api.delete("/api/entities/does-not-exist");
    expect(res.status).toBe(404);
  });
});

describe("entity relations", () => {
  it("creates a relation between two entities, visible via GET /relations", async () => {
    const a = (await api.post("/api/entities").send({ name: "Rin" })).body.at(-1);
    const b = (await api.post("/api/entities").send({ name: "Mika" })).body.at(-1);

    const res = await api.post("/api/entities/relations").send({ fromId: a.id, toId: b.id, label: "ist Schwester von" });
    expect(res.status).toBe(201);
    expect(res.body.at(-1)).toMatchObject({ fromId: a.id, toId: b.id, label: "ist Schwester von" });

    const list = await api.get("/api/entities/relations");
    expect(list.body.some((r: { fromId: string; toId: string }) => r.fromId === a.id && r.toId === b.id)).toBe(true);
  });

  it("rejects a relation with a missing label", async () => {
    const a = (await api.post("/api/entities").send({ name: "Solo A" })).body.at(-1);
    const b = (await api.post("/api/entities").send({ name: "Solo B" })).body.at(-1);
    const res = await api.post("/api/entities/relations").send({ fromId: a.id, toId: b.id, label: "" });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("invalid_relation");
  });

  it("deletes a relation by id", async () => {
    const a = (await api.post("/api/entities").send({ name: "DelRelA" })).body.at(-1);
    const b = (await api.post("/api/entities").send({ name: "DelRelB" })).body.at(-1);
    const created = (await api.post("/api/entities/relations").send({ fromId: a.id, toId: b.id, label: "kennt" })).body.at(-1);

    const res = await api.delete(`/api/entities/relations/${created.id}`);
    expect(res.status).toBe(200);
    expect(res.body.some((r: { id: string }) => r.id === created.id)).toBe(false);
  });

  it("404s deleting an unknown relation id", async () => {
    const res = await api.delete("/api/entities/relations/does-not-exist");
    expect(res.status).toBe(404);
  });

  it("cascades: deleting an entity removes every relation referencing it", async () => {
    const a = (await api.post("/api/entities").send({ name: "CascadeA" })).body.at(-1);
    const b = (await api.post("/api/entities").send({ name: "CascadeB" })).body.at(-1);
    await api.post("/api/entities/relations").send({ fromId: a.id, toId: b.id, label: "arbeitet mit" });

    const del = await api.delete(`/api/entities/${a.id}`);
    expect(del.status).toBe(200);

    const relations = await api.get("/api/entities/relations");
    expect(relations.body.some((r: { fromId: string; toId: string }) => r.fromId === a.id || r.toId === a.id)).toBe(false);
  });
});

describe("permissions: viewer role", () => {
  it("can read but not create an entity or relation", async () => {
    const { createUser } = await import("../lib/authStore.js");
    await createUser("entity-viewer", "pw", false);
    const loginRes = await api.post("/api/auth/login").send({ username: "entity-viewer", password: "pw" });
    const viewerToken = loginRes.body.token as string;

    const addMember = await api.post("/api/project/members").send({ username: "entity-viewer", role: "viewer" });
    expect(addMember.status).toBe(201);

    const viewerApi = authedAgent(app, viewerToken);
    const readRes = await viewerApi.get("/api/entities");
    expect(readRes.status).toBe(200);

    const writeRes = await viewerApi.post("/api/entities").send({ name: "Should Fail" });
    expect(writeRes.status).toBe(403);
    expect(writeRes.body.error).toBe("forbidden");

    const relationRes = await viewerApi.post("/api/entities/relations").send({ fromId: "x", toId: "y", label: "z" });
    expect(relationRes.status).toBe(403);
  });

  it("allows a translator to create an entity (lower bar than characters.ts's letterer)", async () => {
    const { createUser } = await import("../lib/authStore.js");
    await createUser("entity-translator", "pw", false);
    const loginRes = await api.post("/api/auth/login").send({ username: "entity-translator", password: "pw" });
    const translatorToken = loginRes.body.token as string;

    const addMember = await api.post("/api/project/members").send({ username: "entity-translator", role: "translator" });
    expect(addMember.status).toBe(201);

    const translatorApi = authedAgent(app, translatorToken);
    const res = await translatorApi.post("/api/entities").send({ name: "Translator Made This" });
    expect(res.status).toBe(201);
  });
});
