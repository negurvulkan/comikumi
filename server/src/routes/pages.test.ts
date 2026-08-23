import fs from "node:fs/promises";
import path from "node:path";
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

const VOLUME_ID = "Volume_01";
const EMPTY_DIR = () => path.join(env.scanRoot, "Volume_01", "volume_01_empty");

// A tiny, valid, decodable PNG — same fixed byte content used across the test file so
// tests can distinguish "still the original bytes" from "got overwritten".
const TINY_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  "base64"
);

describe("POST /:id/pages", () => {
  it("404s for an unknown volume", async () => {
    const res = await api.post("/api/volumes/does-not-exist/pages").attach("pages", TINY_PNG, "page_99.png");
    expect(res.status).toBe(404);
    expect(res.body.error).toBe("volume_not_found");
  });

  it("uploads a new page and it appears in the page list", async () => {
    const res = await api.post(`/api/volumes/${VOLUME_ID}/pages`).attach("pages", TINY_PNG, "page_02.png");
    expect(res.status).toBe(200);
    expect(res.body.written).toEqual(["page_02.png"]);
    expect(res.body.conflicts).toEqual([]);

    const list = await api.get(`/api/volumes/${VOLUME_ID}/pages`);
    expect(list.body.map((p: { page: string }) => p.page)).toEqual(expect.arrayContaining(["page_01", "page_02"]));
  });

  it("rejects an unsupported file extension", async () => {
    const res = await api.post(`/api/volumes/${VOLUME_ID}/pages`).attach("pages", Buffer.from("not an image"), "page_03.txt");
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("unsupported_page_file_type");
  });

  it("reports a name collision as a conflict instead of overwriting", async () => {
    const before = await fs.readFile(path.join(EMPTY_DIR(), "page_01.png"));

    const res = await api.post(`/api/volumes/${VOLUME_ID}/pages`).attach("pages", TINY_PNG, "page_01.png");
    expect(res.status).toBe(200);
    expect(res.body.written).toEqual([]);
    expect(res.body.conflicts).toEqual(["page_01.png"]);

    const after = await fs.readFile(path.join(EMPTY_DIR(), "page_01.png"));
    expect(after.equals(before)).toBe(true);
  });

  it("overwrites the file when the name is explicitly allowed via `overwrite`", async () => {
    const res = await api
      .post(`/api/volumes/${VOLUME_ID}/pages`)
      .field("overwrite", JSON.stringify(["page_01.png"]))
      .attach("pages", TINY_PNG, "page_01.png");
    expect(res.status).toBe(200);
    expect(res.body.written).toEqual(["page_01.png"]);
    expect(res.body.conflicts).toEqual([]);

    const after = await fs.readFile(path.join(EMPTY_DIR(), "page_01.png"));
    expect(after.equals(TINY_PNG)).toBe(true);
  });
});

describe("DELETE /:id/pages/:page", () => {
  it("moves the page's source file to the scanRoot trash instead of deleting it", async () => {
    await api.post(`/api/volumes/${VOLUME_ID}/pages`).attach("pages", TINY_PNG, "page_05.png");

    const del = await api.delete(`/api/volumes/${VOLUME_ID}/pages/page_05`);
    expect(del.status).toBe(200);
    expect(del.body).toEqual({ ok: true });

    const list = await api.get(`/api/volumes/${VOLUME_ID}/pages`);
    expect(list.body.map((p: { page: string }) => p.page)).not.toContain("page_05");

    const trashSubdir = path.join(env.scanRoot, "_trash", "Volume_01", "volume_01_empty");
    const trashed = await fs.readdir(trashSubdir);
    expect(trashed.some((name) => name.endsWith("__page_05.png"))).toBe(true);
  });

  it("404s for an unknown page", async () => {
    const res = await api.delete(`/api/volumes/${VOLUME_ID}/pages/does-not-exist`);
    expect(res.status).toBe(404);
    expect(res.body.error).toBe("page_not_found");
  });
});
