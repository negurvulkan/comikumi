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

describe("POST /api/project/new (full field set)", () => {
  it("stores custom suffixes and languages instead of the schema defaults", async () => {
    const filePath = path.join(path.dirname(env.projectFile), "full-projekt.json");
    const res = await request(app)
      .post("/api/project/new")
      .send({
        filePath,
        name: "Voll konfiguriert",
        scanRoot: env.scanRoot,
        emptySuffix: "_leer",
        letteringSuffix: "_gelettert",
        scriptSuffix: "_drehbuch",
        exportFolderTemplate: "{book}-{folderSuffix}",
        languages: [{ code: "fr", label: "Français", folderSuffix: "french" }],
      });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      emptySuffix: "_leer",
      letteringSuffix: "_gelettert",
      scriptSuffix: "_drehbuch",
      exportFolderTemplate: "{book}-{folderSuffix}",
      languages: [{ code: "fr", label: "Français", folderSuffix: "french" }],
    });
  });
});

describe("GET /api/project/scan-root-status", () => {
  it("reports a nonexistent scan root as not existing, with 0 volumes", async () => {
    const res = await request(app)
      .get("/api/project/scan-root-status")
      .query({ scanRoot: path.join(env.scanRoot, "does-not-exist"), emptySuffix: "_empty" });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ exists: false, volumeCount: 0 });
  });

  it("reports the existing fixture volume for the real scan root", async () => {
    const res = await request(app).get("/api/project/scan-root-status").query({ scanRoot: env.scanRoot, emptySuffix: "_empty" });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ exists: true, volumeCount: 1 });
  });
});

describe("POST /api/project/scan-root", () => {
  it("creates a not-yet-existing folder", async () => {
    const target = path.join(env.scanRoot, "brand-new-scan-root");
    const res = await request(app).post("/api/project/scan-root").send({ scanRoot: target });
    expect(res.status).toBe(201);

    const status = await request(app).get("/api/project/scan-root-status").query({ scanRoot: target, emptySuffix: "_empty" });
    expect(status.body).toEqual({ exists: true, volumeCount: 0 });
  });
});

describe("POST /api/project/volume-folders", () => {
  it("creates the volume folder plus one folder per requested language", async () => {
    const res = await request(app)
      .post("/api/project/volume-folders")
      .send({
        scanRoot: env.scanRoot,
        emptySuffix: "_empty",
        bookName: "Volume_99",
        languageFolderSuffixes: ["german", "french"],
      });
    expect(res.status).toBe(201);
    expect(res.body.createdPaths).toHaveLength(3);
    // Regression check: the empty-page folder must NOT sit directly in scanRoot — its
    // parent folder's path-relative-to-scanRoot becomes the volume's id
    // (projectScanner.ts's scanVolumes()), and an id of "" 404s the moment the volume
    // is opened. Nesting one level under a "<bookName>" folder (matching real projects'
    // existing "Volume_01/volume_01_empty" convention) keeps that id non-empty.
    const emptyDirPath = res.body.createdPaths.find((p: string) => p.endsWith("_empty"));
    expect(path.dirname(emptyDirPath)).not.toBe(env.scanRoot);
    expect(path.dirname(emptyDirPath)).toBe(path.join(env.scanRoot, "Volume_99"));

    const status = await request(app).get("/api/project/scan-root-status").query({ scanRoot: env.scanRoot, emptySuffix: "_empty" });
    // The pre-existing Volume_01 fixture plus the freshly created Volume_99 folder.
    expect(status.body.volumeCount).toBe(2);
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
