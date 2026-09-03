import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
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

describe("GET /:id/pages/:page/thumbnail", () => {
  it("reflects saved layout content, not just the (possibly blank) source scan — regression for a 'New blank page' filled in via bubbles/Cut-Panels/placed images never showing up in the page grid", async () => {
    // A larger, plain white source — same idea as NewBlankPageDialog.tsx's blank
    // canvas: all real visual content ends up in the layout, not this file.
    await sharp({ create: { width: 200, height: 150, channels: 3, background: { r: 255, g: 255, b: 255 } } })
      .png()
      .toFile(path.join(EMPTY_DIR(), "page_blank.png"));

    const layout = {
      page: "page_blank",
      sourceImage: "page_blank.png",
      imageWidth: 200,
      imageHeight: 150,
      bubbles: [
        {
          id: "b1",
          shape: "rect",
          x: 20,
          y: 20,
          width: 60,
          height: 40,
          rotation: 0,
          bubbleStyle: "speech",
          fillColor: "#ff0000",
          strokeColor: "#000000",
          strokeWidthPx: 6,
          tail: null,
          tailAnchor: null,
          tailWidth: 40,
          svgFileName: null,
          fontFamily: "Anime Ace",
          fontSize: 24,
          lineHeight: 1.2,
          align: "center",
          direction: "ltr",
          color: "#000000",
          textOutline: { enabled: false, color: "#000000", widthPx: 4 },
          textGradient: { enabled: false, colorStart: "#ffffff", colorEnd: "#6c8cff", angleDeg: 0 },
          text: {},
          panelId: null,
          characterId: null,
        },
      ],
      images: [],
      curvedTexts: [],
      panels: [],
    };
    const put = await api.put(`/api/volumes/${VOLUME_ID}/pages/page_blank/layout`).send(layout);
    expect(put.status).toBe(200);

    const res = await api
      .get(`/api/volumes/${VOLUME_ID}/pages/page_blank/thumbnail`)
      .buffer(true)
      .parse((res, cb) => {
        const chunks: Buffer[] = [];
        res.on("data", (chunk: Buffer) => chunks.push(chunk));
        res.on("end", () => cb(null, Buffer.concat(chunks)));
      });
    expect(res.status).toBe(200);

    // Sample the bubble's center — should be strongly red (its fillColor), not the
    // source scan's plain white, if the thumbnail actually composited the layout.
    const { data } = await sharp(res.body as Buffer).raw().toBuffer({ resolveWithObject: true });
    const idx = (50 * 200 + 50) * 3; // (x=50,y=50) into a 200-wide, 3-channel RGB buffer
    expect(data[idx]).toBeGreaterThan(200); // red channel: strong
    expect(data[idx + 1]).toBeLessThan(50); // green channel: weak
  });
});

describe("POST /:id/pages/:page/clean", () => {
  /** A fully transparent (alpha=0 everywhere) PNG at the given size, as a data: URL —
   * an "empty mask" (see CleanPageMaskEditor.tsx's alpha-channel-is-the-mask doc
   * comment), which lets cleanPage() take its copy-through fast path without ever
   * needing the real (multi-hundred-MB, network-fetched) LaMa ONNX model — exactly
   * what these route tests should exercise; actual model inference is smoke-tested
   * separately, not part of this suite (see docs/inpainting-model-provenance.md). */
  async function emptyMaskDataUrl(width: number, height: number): Promise<string> {
    const png = await sharp({ create: { width, height, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
      .png()
      .toBuffer();
    return `data:image/png;base64,${png.toString("base64")}`;
  }

  it("404s for an unknown volume", async () => {
    const mask = await emptyMaskDataUrl(4, 4);
    const res = await api.post(`/api/volumes/does-not-exist/pages/page_01/clean`).send({ mask });
    expect(res.status).toBe(404);
    expect(res.body.error).toBe("volume_not_found");
  });

  it("404s for an unknown page", async () => {
    const mask = await emptyMaskDataUrl(4, 4);
    const res = await api.post(`/api/volumes/${VOLUME_ID}/pages/does-not-exist/clean`).send({ mask });
    expect(res.status).toBe(404);
    expect(res.body.error).toBe("page_not_found");
  });

  it("400s when the mask field is missing", async () => {
    const res = await api.post(`/api/volumes/${VOLUME_ID}/pages/page_01/clean`).send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("invalid_mask");
  });

  it("400s when the mask isn't a decodable image", async () => {
    const res = await api.post(`/api/volumes/${VOLUME_ID}/pages/page_01/clean`).send({ mask: "data:image/png;base64,not-a-real-png" });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("invalid_mask");
  });

  it("an entirely empty mask copies the source through unchanged (no model inference needed)", async () => {
    const mask = await emptyMaskDataUrl(4, 4);
    const res = await api.post(`/api/volumes/${VOLUME_ID}/pages/page_01/clean`).send({ mask });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });

    const cleaned = await api
      .get(`/api/volumes/${VOLUME_ID}/pages/page_01/cleaned-image`)
      .buffer(true)
      .parse((res, cb) => {
        const chunks: Buffer[] = [];
        res.on("data", (chunk: Buffer) => chunks.push(chunk));
        res.on("end", () => cb(null, Buffer.concat(chunks)));
      });
    expect(cleaned.status).toBe(200);
    const original = await fs.readFile(path.join(EMPTY_DIR(), "page_01.png"));
    expect((cleaned.body as Buffer).equals(original)).toBe(true);
  });
});
