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

describe("POST /:id/export-vector-pdf", () => {
  it("renders and writes a vector PDF from the raw layout JSON (server-side rendering, no upload)", async () => {
    const { createEmptyLayout } = await import("../../../shared/src/layoutSchema.js");
    const layout = createEmptyLayout("page_01", "page_01.png", 4, 4);
    const res = await api.post(`/api/volumes/${VOLUME_ID}/export-vector-pdf`).send({
      folderSuffix: "german",
      page: "page_01",
      languageCode: "de",
      pdfxVersion: "x4",
      layout,
    });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.pdfxStamped).toBe(false); // no PDFX_ICC_PROFILE_PATH configured in this test env

    const writtenPath = path.join(env.scanRoot, "Volume_01", "volume_01_german", "page_01.pdf");
    const written = await fs.readFile(writtenPath);
    expect(written.subarray(0, 5).toString("latin1")).toBe("%PDF-");
  });

  it("rejects a request missing required fields", async () => {
    const res = await api.post(`/api/volumes/${VOLUME_ID}/export-vector-pdf`).send({ page: "page_01" });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("export_fields_required");
  });

  it("rejects an invalid layout body", async () => {
    const res = await api.post(`/api/volumes/${VOLUME_ID}/export-vector-pdf`).send({
      folderSuffix: "german",
      page: "page_01",
      languageCode: "de",
      pdfxVersion: "x4",
      layout: { not: "a valid layout" },
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("invalid_layout");
  });

  it("404s for an unknown volume", async () => {
    const { createEmptyLayout } = await import("../../../shared/src/layoutSchema.js");
    const layout = createEmptyLayout("page_01", "page_01.png", 4, 4);
    const res = await api.post(`/api/volumes/does-not-exist/export-vector-pdf`).send({
      folderSuffix: "german",
      page: "page_01",
      languageCode: "de",
      pdfxVersion: "x4",
      layout,
    });
    expect(res.status).toBe(404);
  });
});

describe("POST /:id/export-psd", () => {
  it("renders and writes a layered PSD from the raw layout JSON (server-side rendering, no upload)", async () => {
    const { createEmptyLayout } = await import("../../../shared/src/layoutSchema.js");
    const layout = createEmptyLayout("page_01", "page_01.png", 4, 4);
    const res = await api.post(`/api/volumes/${VOLUME_ID}/export-psd`).send({
      folderSuffix: "german",
      page: "page_01",
      languageCode: "de",
      layout,
    });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);

    const writtenPath = path.join(env.scanRoot, "Volume_01", "volume_01_german", "page_01.psd");
    const written = await fs.readFile(writtenPath);
    expect(written.length).toBeGreaterThan(0);
    expect(written.subarray(0, 4).toString("latin1")).toBe("8BPS"); // PSD magic bytes
  });

  it("rejects a request missing required fields", async () => {
    const res = await api.post(`/api/volumes/${VOLUME_ID}/export-psd`).send({ page: "page_01" });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("export_fields_required");
  });

  it("rejects an invalid layout body", async () => {
    const res = await api.post(`/api/volumes/${VOLUME_ID}/export-psd`).send({
      folderSuffix: "german",
      page: "page_01",
      languageCode: "de",
      layout: { not: "a valid layout" },
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("invalid_layout");
  });

  it("404s for an unknown volume", async () => {
    const { createEmptyLayout } = await import("../../../shared/src/layoutSchema.js");
    const layout = createEmptyLayout("page_01", "page_01.png", 4, 4);
    const res = await api.post(`/api/volumes/does-not-exist/export-psd`).send({
      folderSuffix: "german",
      page: "page_01",
      languageCode: "de",
      layout,
    });
    expect(res.status).toBe(404);
  });
});

describe("Export-Viewer Routes", () => {
  let translatorApi: ReturnType<typeof authedAgent>;

  beforeAll(async () => {
    const { createUser } = await import("../lib/authStore.js");
    try {
      await createUser("translator-user", "pw", false);
    } catch {
      // already exists
    }
    const loginRes = await api.post("/api/auth/login").send({ username: "translator-user", password: "pw" });
    const translatorToken = loginRes.body.token as string;
    await api.post("/api/project/members").send({ username: "translator-user", role: "translator" });
    translatorApi = authedAgent(app, translatorToken);

    // Create a dummy exported file so we have something to list/download/delete
    const dir = path.join(env.scanRoot, "Volume_01", "volume_01_german");
    await fs.rm(dir, { recursive: true, force: true });
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, "page_01.png"), "dummy png content");
    await fs.writeFile(path.join(dir, "page_01.pdf"), "dummy pdf content");
  });

  describe("GET /api/volumes/:id/exports", () => {
    it("returns all exported folders and files under the volume", async () => {
      const res = await api.get(`/api/volumes/${VOLUME_ID}/exports`);
      expect(res.status).toBe(200);
      expect(res.body.exports).toBeInstanceOf(Array);
      
      const germanExport = res.body.exports.find((e: any) => e.folderSuffix === "german");
      expect(germanExport).toBeDefined();
      expect(germanExport.files).toHaveLength(2);
      
      const pngFile = germanExport.files.find((f: any) => f.extension === ".png");
      expect(pngFile).toBeDefined();
      expect(pngFile.name).toBe("page_01.png");
      expect(pngFile.size).toBe("dummy png content".length);
    });

    it("allows a translator (viewer) to list exports", async () => {
      const res = await translatorApi.get(`/api/volumes/${VOLUME_ID}/exports`);
      expect(res.status).toBe(200);
      expect(res.body.exports).toBeDefined();
    });
  });

  describe("GET /api/volumes/:id/exports/:folderSuffix/:fileName", () => {
    it("serves the requested file with correct content", async () => {
      const res = await api.get(`/api/volumes/${VOLUME_ID}/exports/german/page_01.png`);
      expect(res.status).toBe(200);
      expect(res.body.toString()).toBe("dummy png content");
    });

    it("sets attachment header when download=true is passed", async () => {
      const res = await api.get(`/api/volumes/${VOLUME_ID}/exports/german/page_01.png?download=true`);
      expect(res.status).toBe(200);
      expect(res.headers["content-disposition"]).toContain('attachment; filename="page_01.png"');
    });

    it("allows a translator to download/serve the file", async () => {
      const res = await translatorApi.get(`/api/volumes/${VOLUME_ID}/exports/german/page_01.png`);
      expect(res.status).toBe(200);
    });

    it("404s for non-existing files", async () => {
      const res = await api.get(`/api/volumes/${VOLUME_ID}/exports/german/non-existent.png`);
      expect(res.status).toBe(404);
    });
  });

  describe("GET /api/volumes/:id/exports/:folderSuffix/zip", () => {
    it("packs the export folder files into a ZIP archive", async () => {
      const res = await api
        .get(`/api/volumes/${VOLUME_ID}/exports/german/zip`)
        .buffer(true)
        .parse((res, cb) => {
          const chunks: Buffer[] = [];
          res.on("data", (chunk: Buffer) => chunks.push(chunk));
          res.on("end", () => cb(null, Buffer.concat(chunks)));
        });
      expect(res.status).toBe(200);
      expect(res.headers["content-type"]).toBe("application/zip");
      expect(res.headers["content-disposition"]).toContain('attachment; filename="volume_01_german_exports.zip"');
      expect(Buffer.isBuffer(res.body)).toBe(true);
      expect((res.body as Buffer).length).toBeGreaterThan(0);
    });
  });

  describe("DELETE /api/volumes/:id/exports/:folderSuffix/:fileName", () => {
    it("blocks a translator from deleting files", async () => {
      const res = await translatorApi.delete(`/api/volumes/${VOLUME_ID}/exports/german/page_01.png`);
      expect(res.status).toBe(403);
    });

    it("allows a letterer (admin) to delete files", async () => {
      const res = await api.delete(`/api/volumes/${VOLUME_ID}/exports/german/page_01.png`);
      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);

      // Verify it's actually deleted
      const check = await api.get(`/api/volumes/${VOLUME_ID}/exports/german/page_01.png`);
      expect(check.status).toBe(404);
    });
  });

  describe("DELETE /api/volumes/:id/exports/:folderSuffix", () => {
    it("blocks a translator from deleting export folder", async () => {
      const res = await translatorApi.delete(`/api/volumes/${VOLUME_ID}/exports/german`);
      expect(res.status).toBe(403);
    });

    it("allows a letterer (admin) to delete the export folder", async () => {
      const res = await api.delete(`/api/volumes/${VOLUME_ID}/exports/german`);
      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);

      // Verify the folder does not exist anymore
      const check = await api.get(`/api/volumes/${VOLUME_ID}/exports`);
      expect(check.status).toBe(200);
      const germanExport = check.body.exports.find((e: any) => e.folderSuffix === "german");
      expect(germanExport).toBeUndefined();
    });
  });
});
