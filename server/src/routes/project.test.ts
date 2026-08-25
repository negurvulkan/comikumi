import { beforeAll, describe, expect, it } from "vitest";
import type { Express } from "express";
import path from "node:path";
import request from "supertest";
import { setupTestEnv, authedAgent, type TestEnv } from "../test-utils/fixtures.js";

let app: Express;
let env: TestEnv;
let api: ReturnType<typeof authedAgent>;

beforeAll(async () => {
  env = await setupTestEnv();
  const { createApp } = await import("../app.js");
  app = createApp();
  api = authedAgent(app, env.token);
});

describe("GET /api/project/current (no project opened yet)", () => {
  it("returns null rather than throwing", async () => {
    const res = await api.get("/api/project/current");
    expect(res.status).toBe(200);
    expect(res.body).toBeNull();
  });
});

describe("GET /api/project/recent (no project opened yet)", () => {
  it("returns an empty list", async () => {
    const res = await api.get("/api/project/recent");
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });
});

describe("POST /api/project/new", () => {
  it("creates a project file and makes it the active project", async () => {
    const res = await api.post("/api/project/new").send({ filePath: env.projectFile, name: "Neues Projekt", scanRoot: env.scanRoot });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ filePath: env.projectFile, name: "Neues Projekt" });

    const current = await api.get("/api/project/current");
    expect(current.body).toMatchObject({ filePath: env.projectFile, name: "Neues Projekt" });
  });

  it("rejects a missing scanRoot", async () => {
    const res = await api.post("/api/project/new").send({ filePath: env.projectFile, name: "X" });
    expect(res.status).toBe(400);
  });
});

describe("POST /api/project/new (full field set)", () => {
  it("stores custom suffixes and languages instead of the schema defaults", async () => {
    const filePath = path.join(path.dirname(env.projectFile), "full-projekt.json");
    const res = await api
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
    const res = await api
      .get("/api/project/scan-root-status")
      .query({ scanRoot: path.join(env.scanRoot, "does-not-exist"), emptySuffix: "_empty" });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ exists: false, volumeCount: 0 });
  });

  it("reports the existing fixture volume for the real scan root", async () => {
    const res = await api.get("/api/project/scan-root-status").query({ scanRoot: env.scanRoot, emptySuffix: "_empty" });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ exists: true, volumeCount: 1 });
  });
});

describe("POST /api/project/scan-root", () => {
  it("creates a not-yet-existing folder", async () => {
    const target = path.join(env.scanRoot, "brand-new-scan-root");
    const res = await api.post("/api/project/scan-root").send({ scanRoot: target });
    expect(res.status).toBe(201);

    const status = await api.get("/api/project/scan-root-status").query({ scanRoot: target, emptySuffix: "_empty" });
    expect(status.body).toEqual({ exists: true, volumeCount: 0 });
  });
});

describe("POST /api/project/volume-folders", () => {
  it("creates the volume folder plus one folder per requested language", async () => {
    const res = await api
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

    const status = await api.get("/api/project/scan-root-status").query({ scanRoot: env.scanRoot, emptySuffix: "_empty" });
    // The pre-existing Volume_01 fixture plus the freshly created Volume_99 folder.
    expect(status.body.volumeCount).toBe(2);
  });
});

describe("Recent-project list management (remove/archive/unarchive/delete-file)", () => {
  it("removes a project from the recent list without touching its file", async () => {
    const filePath = path.join(path.dirname(env.projectFile), "removable-projekt.json");
    await api.post("/api/project/new").send({ filePath, name: "Removable", scanRoot: env.scanRoot });
    // Switch back so "removable-projekt.json" isn't the active project (removal is blocked for that).
    await api.post("/api/project/open").send({ filePath: env.projectFile });

    const before = await api.get("/api/project/recent");
    expect(before.body.some((p: { filePath: string }) => p.filePath === filePath)).toBe(true);

    const res = await api.post("/api/project/recent/remove").send({ filePath });
    expect(res.status).toBe(200);

    const after = await api.get("/api/project/recent");
    expect(after.body.some((p: { filePath: string }) => p.filePath === filePath)).toBe(false);

    // The file itself is untouched — reopening it still works.
    const reopen = await api.post("/api/project/open").send({ filePath });
    expect(reopen.status).toBe(200);
    await api.post("/api/project/open").send({ filePath: env.projectFile });
  });

  it("rejects removing the currently active project", async () => {
    const res = await api.post("/api/project/recent/remove").send({ filePath: env.projectFile });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("cannot_modify_active_project");
  });

  it("archives a project (hidden from recent, listed as archived) and can unarchive it again", async () => {
    const filePath = path.join(path.dirname(env.projectFile), "archivable-projekt.json");
    await api.post("/api/project/new").send({ filePath, name: "Archivable", scanRoot: env.scanRoot });
    await api.post("/api/project/open").send({ filePath: env.projectFile });

    const archiveRes = await api.post("/api/project/archive").send({ filePath });
    expect(archiveRes.status).toBe(200);

    const recent = await api.get("/api/project/recent");
    expect(recent.body.some((p: { filePath: string }) => p.filePath === filePath)).toBe(false);
    const archived = await api.get("/api/project/archived");
    expect(archived.body.some((p: { filePath: string }) => p.filePath === filePath)).toBe(true);

    const unarchiveRes = await api.post("/api/project/unarchive").send({ filePath });
    expect(unarchiveRes.status).toBe(200);

    const recentAfter = await api.get("/api/project/recent");
    expect(recentAfter.body.some((p: { filePath: string }) => p.filePath === filePath)).toBe(true);
    const archivedAfter = await api.get("/api/project/archived");
    expect(archivedAfter.body.some((p: { filePath: string }) => p.filePath === filePath)).toBe(false);
  });

  it("rejects archiving the currently active project", async () => {
    const res = await api.post("/api/project/archive").send({ filePath: env.projectFile });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("cannot_modify_active_project");
  });

  it("deletes a project's file from disk and drops it from the recent list", async () => {
    const filePath = path.join(path.dirname(env.projectFile), "deletable-projekt.json");
    await api.post("/api/project/new").send({ filePath, name: "Deletable", scanRoot: env.scanRoot });
    await api.post("/api/project/open").send({ filePath: env.projectFile });

    const res = await api.post("/api/project/delete-file").send({ filePath });
    expect(res.status).toBe(200);

    const recent = await api.get("/api/project/recent");
    expect(recent.body.some((p: { filePath: string }) => p.filePath === filePath)).toBe(false);

    // The file is actually gone — reopening it now fails.
    const reopen = await api.post("/api/project/open").send({ filePath });
    expect(reopen.status).toBe(400);
  });

  it("rejects deleting the currently active project's file", async () => {
    const res = await api.post("/api/project/delete-file").send({ filePath: env.projectFile });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("cannot_modify_active_project");
  });
});

describe("GET /api/project/cover", () => {
  it("serves an existing image file by absolute path", async () => {
    const imagePath = path.join(env.scanRoot, "Volume_01", "volume_01_empty", "page_01.png");
    const res = await api.get("/api/project/cover").query({ path: imagePath });
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toBe("image/png");
  });

  it("404s for a path that doesn't exist", async () => {
    const res = await api.get("/api/project/cover").query({ path: path.join(env.scanRoot, "no-such-cover.png") });
    expect(res.status).toBe(404);
  });

  it("rejects a non-image extension", async () => {
    const res = await api.get("/api/project/cover").query({ path: env.projectFile });
    expect(res.status).toBe(400);
  });
});

describe("POST /api/project/open", () => {
  it("opens a second, previously-created project file and switches the active project to it", async () => {
    const otherFile = path.join(path.dirname(env.projectFile), "other-projekt.json");
    await api.post("/api/project/new").send({ filePath: otherFile, name: "Anderes Projekt", scanRoot: env.scanRoot });
    // Switch back to the first project explicitly.
    const res = await api.post("/api/project/open").send({ filePath: env.projectFile });
    expect(res.status).toBe(200);
    expect(res.body.name).toBe("Neues Projekt");

    const current = await api.get("/api/project/current");
    expect(current.body.filePath).toBe(env.projectFile);
  });

  it("returns a 400 error for a nonexistent project file", async () => {
    const res = await api.post("/api/project/open").send({ filePath: path.join(env.scanRoot, "no-such-file.json") });
    expect(res.status).toBe(400);
  });
});

describe("project-switch activity guard", () => {
  it("blocks switching when another user made a request in the last few minutes, unless force is set", async () => {
    const otherFile = path.join(path.dirname(env.projectFile), "guard-test-projekt.json");
    await api.post("/api/project/new").send({ filePath: otherFile, name: "Guard Test Projekt", scanRoot: env.scanRoot });

    // Establish a second, genuinely authenticated user (only requireAuth records
    // activity — creating the account alone doesn't count, they must make a request).
    const { createUser } = await import("../lib/authStore.js");
    await createUser("guard-test-user", "pw", false).catch(() => {});
    const loginRes = await api.post("/api/auth/login").send({ username: "guard-test-user", password: "pw" });
    const otherToken = loginRes.body.token as string;
    const otherApi = authedAgent(app, otherToken);
    await otherApi.get("/api/project/current");

    // The first user's switch back to the original project is now blocked.
    const blocked = await api.post("/api/project/open").send({ filePath: env.projectFile });
    expect(blocked.status).toBe(409);
    expect(blocked.body.error).toBe("project_switch_blocked");
    expect(blocked.body.activeUsers.some((u: { username: string }) => u.username === "guard-test-user")).toBe(true);

    // force:true proceeds anyway.
    const forced = await api.post("/api/project/open").send({ filePath: env.projectFile, force: true });
    expect(forced.status).toBe(200);
  });

  it("does not block re-opening the already-active project", async () => {
    const current = await api.get("/api/project/current");
    const res = await api.post("/api/project/open").send({ filePath: current.body.filePath });
    expect(res.status).toBe(200);
  });
});

describe("Project list and member management by path", () => {
  it("allows system admin to list all projects with isAdmin: true", async () => {
    const res = await api.get("/api/project/list");
    expect(res.status).toBe(200);
    expect(res.body.length).toBeGreaterThan(0);
    expect(res.body.every((p: { isAdmin: boolean }) => p.isAdmin === true)).toBe(true);
  });

  it("allows managing project members via filePath param", async () => {
    // 1. Create a user
    const createUsr = await request(app)
      .post("/api/auth/users")
      .set("Authorization", `Bearer ${env.token}`)
      .send({ username: "member-test-user", password: "pw" });
    expect(createUsr.status).toBe(201);

    // 2. Add member to other project (by path) without activating it
    const otherFile = path.join(path.dirname(env.projectFile), "other-projekt.json");
    const addMem = await api
      .post("/api/project/members")
      .send({ username: "member-test-user", role: "translator", filePath: otherFile });
    expect(addMem.status).toBe(201);

    // 3. List members of the other project by path
    const listMem = await api.get("/api/project/members").query({ filePath: otherFile });
    expect(listMem.status).toBe(200);
    const addedMember = listMem.body.find((m: { username: string }) => m.username === "member-test-user");
    expect(addedMember).toBeDefined();
    expect(addedMember.role).toBe("translator");

    // 4. Update member role by path (POST /members upserts)
    const updateMem = await api
      .post("/api/project/members")
      .send({ username: "member-test-user", role: "admin", filePath: otherFile });
    expect(updateMem.status).toBe(201);

    const listMem2 = await api.get("/api/project/members").query({ filePath: otherFile });
    const updatedMember = listMem2.body.find((m: { username: string }) => m.username === "member-test-user");
    expect(updatedMember.role).toBe("admin");

    // 5. Test access control: non-system-admin who is not an admin of other-projekt.json cannot list members
    const loginRes = await request(app).post("/api/auth/login").send({ username: "member-test-user", password: "pw" });
    const plainToken = loginRes.body.token as string;
    const userApi = authedAgent(app, plainToken);

    // Since they are now "admin" of other-projekt.json (upserted in step 4), they CAN list members of other-projekt
    const userListMem = await userApi.get("/api/project/members").query({ filePath: otherFile });
    expect(userListMem.status).toBe(200);

    // But they are not an admin of env.projectFile ("Neues Projekt"), so listing its members should be forbidden (403)
    const forbiddenList = await userApi.get("/api/project/members").query({ filePath: env.projectFile });
    expect(forbiddenList.status).toBe(403);

    // 6. Delete member by path
    const delMem = await api
      .delete(`/api/project/members/${createUsr.body.id}`)
      .query({ filePath: otherFile });
    expect(delMem.status).toBe(200);

    const listMem3 = await api.get("/api/project/members").query({ filePath: otherFile });
    expect(listMem3.body.some((m: { username: string }) => m.username === "member-test-user")).toBe(false);

    // Clean up user
    await request(app).delete(`/api/auth/users/${createUsr.body.id}`).set("Authorization", `Bearer ${env.token}`);
  });
});

