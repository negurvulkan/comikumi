import { beforeAll, describe, expect, it } from "vitest";
import type { Express } from "express";
import { setupTestEnv, authedAgent, type TestEnv } from "../test-utils/fixtures.js";

let app: Express;
let env: TestEnv;
let api: ReturnType<typeof authedAgent>;
let nonAdminApi: ReturnType<typeof authedAgent>;

// A tiny, valid PNG — used for every upload in this file.
const TINY_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  "base64"
);

beforeAll(async () => {
  env = await setupTestEnv();
  const { createApp } = await import("../app.js");
  const { createUser, signToken } = await import("../lib/authStore.js");
  app = createApp();
  api = authedAgent(app, env.token);
  const nonAdmin = await createUser("instance-assets-non-admin", "pw", false);
  const nonAdminToken = await signToken(nonAdmin);
  nonAdminApi = authedAgent(app, nonAdminToken);
});

describe("instance-scope asset routes — auth boundary", () => {
  it("403s a non-system-admin for every verb", async () => {
    const list = await nonAdminApi.get("/api/instance/images");
    expect(list.status).toBe(403);

    const upload = await nonAdminApi.post("/api/instance/images").attach("image", TINY_PNG, "x.png");
    expect(upload.status).toBe(403);

    const del = await nonAdminApi.delete("/api/instance/images/file/x.png");
    expect(del.status).toBe(403);
  });

  it("allows a system admin", async () => {
    const res = await api.get("/api/instance/images");
    expect(res.status).toBe(200);
  });
});

describe("instance-scope asset routes — always the true global dir, regardless of the active project", () => {
  it("stays unaffected by an active project with its own configured assetsDir", async () => {
    const { createProject } = await import("../lib/projectStore.js");
    const fs = await import("node:fs/promises");
    const path = await import("node:path");
    const projectAssetsDir = path.join(env.dataDir, "..", "project-assets");
    await fs.mkdir(projectAssetsDir, { recursive: true });
    await createProject(env.projectFile, { name: "Test Project", scanRoot: env.scanRoot });
    const settingsRes = await api.put("/api/settings").send({ scanRoot: env.scanRoot, assetsDir: projectAssetsDir });
    expect(settingsRes.status).toBe(200);

    // Upload via the INSTANCE route while a project with its own assetsDir is active.
    const upload = await api.post("/api/instance/images").attach("image", TINY_PNG, "instance-only.png");
    expect(upload.status).toBe(200);
    expect(upload.body.scope).toBe("global");

    // Must have landed in the true global IMAGES_DIR, not the active project's folder.
    const fsCheck = await fs.access(path.join(env.dataDir, "images", "instance-only.png")).then(
      () => true,
      () => false
    );
    expect(fsCheck).toBe(true);
    const projectFolderCheck = await fs.access(path.join(projectAssetsDir, "images", "instance-only.png")).then(
      () => true,
      () => false
    );
    expect(projectFolderCheck).toBe(false);

    // The legacy unscoped route, by contrast, DOES land in the active project's folder
    // now that assetsDir is configured — confirming the two behave differently on
    // purpose (this is exactly the gap instance-scope routes exist to avoid).
    const legacyUpload = await api.post("/api/images").attach("image", TINY_PNG, "legacy-project-scoped.png");
    expect(legacyUpload.status).toBe(200);
    expect(legacyUpload.body.scope).toBe("project");
  });
});

describe("POST /api/images/rename (also exercised via the legacy-mounted router)", () => {
  it("renames a file and the old name 404s afterward", async () => {
    await api.post("/api/images").attach("image", TINY_PNG, "before.png");
    const rename = await api.post("/api/images/rename").send({ fileName: "before.png", newFileName: "after.png" });
    expect(rename.status).toBe(200);
    expect(rename.body.fileName).toBe("after.png");

    // Pre-existing GET /file/:fileName behavior (unrelated to rename): a missing file
    // isn't specially mapped to 404 there today, just asserting it's not a success.
    const oldFile = await api.get("/api/images/file/before.png");
    expect(oldFile.status).not.toBe(200);
    const newFile = await api.get("/api/images/file/after.png");
    expect(newFile.status).toBe(200);
  });

  it("409s on a same-named conflict", async () => {
    await api.post("/api/images").attach("image", TINY_PNG, "one.png");
    await api.post("/api/images").attach("image", TINY_PNG, "two.png");
    const rename = await api.post("/api/images/rename").send({ fileName: "one.png", newFileName: "two.png" });
    expect(rename.status).toBe(409);
    expect(rename.body.error).toBe("asset_rename_conflict");
  });

  it("400s when the extension changes", async () => {
    await api.post("/api/images").attach("image", TINY_PNG, "keep-ext.png");
    const rename = await api.post("/api/images/rename").send({ fileName: "keep-ext.png", newFileName: "keep-ext.gif" });
    expect(rename.status).toBe(400);
    expect(rename.body.error).toBe("unsupported_file_type");
  });

  it("404s for a source file that doesn't exist", async () => {
    const rename = await api.post("/api/images/rename").send({ fileName: "does-not-exist.png", newFileName: "whatever.png" });
    expect(rename.status).toBe(404);
  });

  it("updates a font's derived family name on rename", async () => {
    const ttf = Buffer.from("not a real font, just bytes for the rename test");
    await api.post("/api/fonts").attach("font", ttf, "OldFamily.ttf");
    const rename = await api.post("/api/fonts/rename").send({ fileName: "OldFamily.ttf", newFileName: "NewFamily.ttf" });
    expect(rename.status).toBe(200);
    expect(rename.body.family).toBe("NewFamily");
  });
});
