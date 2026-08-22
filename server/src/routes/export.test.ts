import { beforeAll, describe, expect, it } from "vitest";
import type { Express } from "express";
import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
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

async function tinyPngBuffer(): Promise<Buffer> {
  return sharp({ create: { width: 4, height: 4, channels: 3, background: { r: 10, g: 200, b: 30 } } })
    .png()
    .toBuffer();
}

describe("POST /:id/export", () => {
  it("writes the uploaded PNG into the expected language folder", async () => {
    const png = await tinyPngBuffer();
    const res = await api
      .post(`/api/volumes/${VOLUME_ID}/export`)
      .field("folderSuffix", "german")
      .field("page", "page_01")
      .attach("png", png, "page_01.png");
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);

    const writtenPath = path.join(env.scanRoot, "Volume_01", "volume_01_german", "page_01.png");
    const written = await fs.readFile(writtenPath);
    expect(written.equals(png)).toBe(true);
  });

  it("rejects a request missing the required fields", async () => {
    const res = await api.post(`/api/volumes/${VOLUME_ID}/export`).field("page", "page_01");
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("export_fields_required");
  });

  it("404s for an unknown volume", async () => {
    const png = await tinyPngBuffer();
    const res = await api
      .post(`/api/volumes/does-not-exist/export`)
      .field("folderSuffix", "german")
      .field("page", "page_01")
      .attach("png", png, "page_01.png");
    expect(res.status).toBe(404);
  });
});

describe("POST /:id/export-print", () => {
  it("converts the uploaded RGB PNG into a CMYK TIFF tagged at 300dpi", async () => {
    const png = await tinyPngBuffer();
    const res = await api
      .post(`/api/volumes/${VOLUME_ID}/export-print`)
      .field("folderSuffix", "french")
      .field("page", "page_02")
      .attach("png", png, "page_02.png");
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);

    const writtenPath = path.join(env.scanRoot, "Volume_01", "volume_01_french", "page_02.tiff");
    const metadata = await sharp(writtenPath).metadata();
    expect(metadata.format).toBe("tiff");
    expect(metadata.space).toBe("cmyk");
    expect(metadata.density).toBe(300);
    // No alpha channel — a printed page is opaque, and a 5-channel CMYK+A TIFF is
    // non-standard prepress input (see the flatten() call in the route).
    expect(metadata.hasAlpha).toBe(false);
    expect(metadata.channels).toBe(4);
  });

  it("rejects a request missing the required fields", async () => {
    const res = await api.post(`/api/volumes/${VOLUME_ID}/export-print`).field("page", "page_02");
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("export_fields_required");
  });

  it("reports print_export_failed for an undecodable upload", async () => {
    const res = await api
      .post(`/api/volumes/${VOLUME_ID}/export-print`)
      .field("folderSuffix", "german")
      .field("page", "page_03")
      .attach("png", Buffer.from("not a real image"), "page_03.png");
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("print_export_failed");
  });

  it("404s for an unknown volume", async () => {
    const png = await tinyPngBuffer();
    const res = await api
      .post(`/api/volumes/does-not-exist/export-print`)
      .field("folderSuffix", "german")
      .field("page", "page_02")
      .attach("png", png, "page_02.png");
    expect(res.status).toBe(404);
  });
});
