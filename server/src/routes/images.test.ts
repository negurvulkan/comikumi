import { beforeAll, describe, expect, it } from "vitest";
import type { Express } from "express";
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

// A tiny, valid PNG — used for every upload in this file.
const TINY_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  "base64"
);

describe("GET /api/images (root)", () => {
  it("lists an uploaded root image with empty folder/subfolders", async () => {
    await api.post("/api/images").attach("image", TINY_PNG, "root.png");
    const res = await api.get("/api/images");
    expect(res.status).toBe(200);
    expect(res.body.folder).toBe("");
    expect(res.body.files.map((f: { fileName: string }) => f.fileName)).toContain("root.png");
  });

  it("400s for an invalid folder query", async () => {
    const res = await api.get("/api/images?folder=..");
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("invalid_folder");
  });
});

describe("POST /api/images with a folder", () => {
  it("uploads into the given folder and only shows up there, not at root", async () => {
    const upload = await api.post("/api/images").field("folder", "effects").attach("image", TINY_PNG, "boom.png");
    expect(upload.status).toBe(200);
    expect(upload.body).toMatchObject({ ok: true, fileName: "boom.png", folder: "effects" });

    const nested = await api.get("/api/images?folder=effects");
    expect(nested.body.files.map((f: { fileName: string }) => f.fileName)).toContain("boom.png");

    const root = await api.get("/api/images");
    expect(root.body.files.map((f: { fileName: string }) => f.fileName)).not.toContain("boom.png");
    expect(root.body.subfolders).toContain("effects");
  });
});

describe("POST /api/images/folders", () => {
  it("creates a nested folder path, visible via subfolders", async () => {
    const res = await api.post("/api/images/folders").send({ folder: "icons/ui" });
    expect(res.status).toBe(200);

    const iconsListing = await api.get("/api/images?folder=icons");
    expect(iconsListing.body.subfolders).toContain("ui");
  });

  it("400s for an invalid folder path", async () => {
    const res = await api.post("/api/images/folders").send({ folder: "../escape" });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("invalid_folder");
  });
});

describe("DELETE /api/images/folders", () => {
  it("fails with folder_not_empty when the folder still has content", async () => {
    const res = await api.delete("/api/images/folders?folder=effects");
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("folder_not_empty");
  });

  it("deletes an empty folder", async () => {
    await api.post("/api/images/folders").send({ folder: "empty-one" });
    const res = await api.delete("/api/images/folders?folder=empty-one");
    expect(res.status).toBe(200);

    const root = await api.get("/api/images");
    expect(root.body.subfolders).not.toContain("empty-one");
  });

  it("404s for a folder that doesn't exist anywhere", async () => {
    const res = await api.delete("/api/images/folders?folder=does-not-exist");
    expect(res.status).toBe(404);
    expect(res.body.error).toBe("folder_not_found");
  });
});

describe("DELETE /api/images/file/:fileName", () => {
  it("deletes a single file without requiring the folder to be empty", async () => {
    await api.post("/api/images").field("folder", "effects").attach("image", TINY_PNG, "removable.png");
    let listing = await api.get("/api/images?folder=effects");
    expect(listing.body.files.map((f: { fileName: string }) => f.fileName)).toContain("removable.png");

    const del = await api.delete("/api/images/file/removable.png?folder=effects");
    expect(del.status).toBe(200);

    listing = await api.get("/api/images?folder=effects");
    expect(listing.body.files.map((f: { fileName: string }) => f.fileName)).not.toContain("removable.png");
  });

  it("404s deleting a file that doesn't exist", async () => {
    const res = await api.delete("/api/images/file/does-not-exist.png");
    expect(res.status).toBe(404);
    expect(res.body.error).toBe("file_not_found");
  });
});

describe("POST /api/images/move", () => {
  it("moves a file between folders", async () => {
    await api.post("/api/images").attach("image", TINY_PNG, "movable.png");

    const move = await api.post("/api/images/move").send({ fileName: "movable.png", fromFolder: "", toFolder: "effects" });
    expect(move.status).toBe(200);

    const root = await api.get("/api/images");
    expect(root.body.files.map((f: { fileName: string }) => f.fileName)).not.toContain("movable.png");

    const effects = await api.get("/api/images?folder=effects");
    expect(effects.body.files.map((f: { fileName: string }) => f.fileName)).toContain("movable.png");
  });

  it("409s when the target already has a same-named file", async () => {
    await api.post("/api/images").attach("image", TINY_PNG, "dup.png");
    await api.post("/api/images").field("folder", "effects").attach("image", TINY_PNG, "dup.png");

    const move = await api.post("/api/images/move").send({ fileName: "dup.png", fromFolder: "", toFolder: "effects" });
    expect(move.status).toBe(409);
    expect(move.body.error).toBe("asset_move_conflict");
  });

  it("404s when the source file doesn't exist", async () => {
    const move = await api.post("/api/images/move").send({ fileName: "nope.png", fromFolder: "", toFolder: "effects" });
    expect(move.status).toBe(404);
    expect(move.body.error).toBe("file_not_found");
  });
});
