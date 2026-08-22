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
        readingDirection: "ltr",
      });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      emptySuffix: "_leer",
      letteringSuffix: "_gelettert",
      scriptSuffix: "_drehbuch",
      exportFolderTemplate: "{book}-{folderSuffix}",
      languages: [{ code: "fr", label: "Français", folderSuffix: "french" }],
      readingDirection: "ltr",
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

describe("Recent-project list management (remove/archive/unarchive/delete-file)", () => {
  it("removes a project from the recent list without touching its file", async () => {
    const filePath = path.join(path.dirname(env.projectFile), "removable-projekt.json");
    await request(app).post("/api/project/new").send({ filePath, name: "Removable", scanRoot: env.scanRoot });
    // Switch back so "removable-projekt.json" isn't the active project (removal is blocked for that).
    await request(app).post("/api/project/open").send({ filePath: env.projectFile });

    const before = await request(app).get("/api/project/recent");
    expect(before.body.some((p: { filePath: string }) => p.filePath === filePath)).toBe(true);

    const res = await request(app).post("/api/project/recent/remove").send({ filePath });
    expect(res.status).toBe(200);

    const after = await request(app).get("/api/project/recent");
    expect(after.body.some((p: { filePath: string }) => p.filePath === filePath)).toBe(false);

    // The file itself is untouched — reopening it still works.
    const reopen = await request(app).post("/api/project/open").send({ filePath });
    expect(reopen.status).toBe(200);
    await request(app).post("/api/project/open").send({ filePath: env.projectFile });
  });

  it("rejects removing the currently active project", async () => {
    const res = await request(app).post("/api/project/recent/remove").send({ filePath: env.projectFile });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("cannot_modify_active_project");
  });

  it("archives a project (hidden from recent, listed as archived) and can unarchive it again", async () => {
    const filePath = path.join(path.dirname(env.projectFile), "archivable-projekt.json");
    await request(app).post("/api/project/new").send({ filePath, name: "Archivable", scanRoot: env.scanRoot });
    await request(app).post("/api/project/open").send({ filePath: env.projectFile });

    const archiveRes = await request(app).post("/api/project/archive").send({ filePath });
    expect(archiveRes.status).toBe(200);

    const recent = await request(app).get("/api/project/recent");
    expect(recent.body.some((p: { filePath: string }) => p.filePath === filePath)).toBe(false);
    const archived = await request(app).get("/api/project/archived");
    expect(archived.body.some((p: { filePath: string }) => p.filePath === filePath)).toBe(true);

    const unarchiveRes = await request(app).post("/api/project/unarchive").send({ filePath });
    expect(unarchiveRes.status).toBe(200);

    const recentAfter = await request(app).get("/api/project/recent");
    expect(recentAfter.body.some((p: { filePath: string }) => p.filePath === filePath)).toBe(true);
    const archivedAfter = await request(app).get("/api/project/archived");
    expect(archivedAfter.body.some((p: { filePath: string }) => p.filePath === filePath)).toBe(false);
  });

  it("rejects archiving the currently active project", async () => {
    const res = await request(app).post("/api/project/archive").send({ filePath: env.projectFile });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("cannot_modify_active_project");
  });

  it("deletes a project's file from disk and drops it from the recent list", async () => {
    const filePath = path.join(path.dirname(env.projectFile), "deletable-projekt.json");
    await request(app).post("/api/project/new").send({ filePath, name: "Deletable", scanRoot: env.scanRoot });
    await request(app).post("/api/project/open").send({ filePath: env.projectFile });

    const res = await request(app).post("/api/project/delete-file").send({ filePath });
    expect(res.status).toBe(200);

    const recent = await request(app).get("/api/project/recent");
    expect(recent.body.some((p: { filePath: string }) => p.filePath === filePath)).toBe(false);

    // The file is actually gone — reopening it now fails.
    const reopen = await request(app).post("/api/project/open").send({ filePath });
    expect(reopen.status).toBe(400);
  });

  it("rejects deleting the currently active project's file", async () => {
    const res = await request(app).post("/api/project/delete-file").send({ filePath: env.projectFile });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("cannot_modify_active_project");
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
