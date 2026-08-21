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
  app = createApp();
});

describe("GET /api/project/current (no project opened yet)", () => {
  it("returns null rather than throwing", async () => {
    const res = await request(app).get("/api/project/current");
    expect(res.status).toBe(200);
    expect(res.body).toBeNull();
  });
});

describe("GET /api/project/recent (no project opened yet)", () => {
  it("returns an empty list", async () => {
    const res = await request(app).get("/api/project/recent");
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });
});

describe("POST /api/project/new", () => {
  it("creates a project file and makes it the active project", async () => {
    const res = await request(app).post("/api/project/new").send({ filePath: env.projectFile, name: "Neues Projekt", scanRoot: env.scanRoot });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ filePath: env.projectFile, name: "Neues Projekt" });

    const current = await request(app).get("/api/project/current");
    expect(current.body).toMatchObject({ filePath: env.projectFile, name: "Neues Projekt" });
  });

  it("rejects a missing scanRoot", async () => {
    const res = await request(app).post("/api/project/new").send({ filePath: env.projectFile, name: "X" });
    expect(res.status).toBe(400);
  });
});

describe("POST /api/project/open", () => {
  it("opens a second, previously-created project file and switches the active project to it", async () => {
    const otherFile = path.join(path.dirname(env.projectFile), "other-projekt.json");
    await request(app).post("/api/project/new").send({ filePath: otherFile, name: "Anderes Projekt", scanRoot: env.scanRoot });
    // Switch back to the first project explicitly.
    const res = await request(app).post("/api/project/open").send({ filePath: env.projectFile });
    expect(res.status).toBe(200);
    expect(res.body.name).toBe("Neues Projekt");

    const current = await request(app).get("/api/project/current");
    expect(current.body.filePath).toBe(env.projectFile);
  });

  it("returns a 400 error for a nonexistent project file", async () => {
    const res = await request(app).post("/api/project/open").send({ filePath: path.join(env.scanRoot, "no-such-file.json") });
    expect(res.status).toBe(400);
  });
});
