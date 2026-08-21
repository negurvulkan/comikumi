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

describe("languages CRUD", () => {
  it("starts with the project's default languages", async () => {
    const res = await request(app).get("/api/languages");
    expect(res.status).toBe(200);
    expect(res.body.length).toBeGreaterThan(0);
  });

  it("rejects an invalid language definition", async () => {
    const res = await request(app).post("/api/languages").send({ code: "f r", label: "X", folderSuffix: "x" });
    expect(res.status).toBe(400);
  });

  it("creates a new language, keyed by code", async () => {
    const res = await request(app).post("/api/languages").send({ code: "fr", label: "Français", folderSuffix: "french" });
    expect(res.status).toBe(201);
    expect(res.body).toContainEqual({ code: "fr", label: "Français", folderSuffix: "french" });
  });

  it("rejects a duplicate code with 409", async () => {
    const res = await request(app).post("/api/languages").send({ code: "fr", label: "Nochmal", folderSuffix: "other" });
    expect(res.status).toBe(409);
  });

  it("rejects a duplicate folderSuffix with 409", async () => {
    const res = await request(app).post("/api/languages").send({ code: "fr2", label: "X", folderSuffix: "french" });
    expect(res.status).toBe(409);
  });

  it("updates a language by code", async () => {
    const res = await request(app).put("/api/languages/fr").send({ code: "fr", label: "Français (updated)", folderSuffix: "french" });
    expect(res.status).toBe(200);
    expect(res.body).toContainEqual({ code: "fr", label: "Français (updated)", folderSuffix: "french" });
  });

  it("404s updating an unknown code", async () => {
    const res = await request(app).put("/api/languages/xx").send({ code: "xx", label: "X", folderSuffix: "x" });
    expect(res.status).toBe(404);
  });

  it("deletes a language by code", async () => {
    const res = await request(app).delete("/api/languages/fr");
    expect(res.status).toBe(200);
    expect(res.body.some((l: { code: string }) => l.code === "fr")).toBe(false);
  });
});
