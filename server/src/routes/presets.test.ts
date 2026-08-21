import { beforeAll, describe, expect, it } from "vitest";
import type { Express } from "express";
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

describe("presets CRUD", () => {
  it("starts empty", async () => {
    const res = await request(app).get("/api/presets");
    expect(res.body).toEqual([]);
  });

  it("rejects an invalid preset (empty name)", async () => {
    const res = await request(app).post("/api/presets").send({ name: "", text: {}, background: {} });
    expect(res.status).toBe(400);
  });

  it("creates a sparse preset — only the fields provided are set", async () => {
    const res = await request(app)
      .post("/api/presets")
      .send({ name: "SFX Style", text: { fontFamily: "Bangers-Regular" }, background: {} });
    expect(res.status).toBe(201);
    expect(res.body[0]).toMatchObject({ name: "SFX Style", text: { fontFamily: "Bangers-Regular" }, background: {} });
  });

  it("updates and deletes a preset by id", async () => {
    const created = (await request(app).post("/api/presets").send({ name: "Temp", text: {}, background: {} })).body;
    const id = created[created.length - 1].id;

    const updated = await request(app)
      .put(`/api/presets/${id}`)
      .send({ name: "Temp Updated", text: { fontSize: 30 }, background: {} });
    expect(updated.status).toBe(200);
    expect(updated.body.find((p: { id: string }) => p.id === id)).toMatchObject({ name: "Temp Updated" });

    const deleted = await request(app).delete(`/api/presets/${id}`);
    expect(deleted.body.some((p: { id: string }) => p.id === id)).toBe(false);
  });

  it("404s on update/delete of an unknown id", async () => {
    expect((await request(app).put("/api/presets/nope").send({ name: "x", text: {}, background: {} })).status).toBe(404);
    expect((await request(app).delete("/api/presets/nope")).status).toBe(404);
  });
});
