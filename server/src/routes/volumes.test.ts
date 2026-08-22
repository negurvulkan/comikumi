import { beforeAll, describe, expect, it } from "vitest";
import type { Express } from "express";
import path from "node:path";
import fs from "node:fs/promises";
import request from "supertest";
import { setupTestEnv, type TestEnv } from "../test-utils/fixtures.js";

let app: Express;
let env: TestEnv;

const VOLUME_ID = "Volume_01";

beforeAll(async () => {
  env = await setupTestEnv();
  const { createApp } = await import("../app.js");
  const { createProject } = await import("../lib/projectStore.js");
  app = createApp();
  await createProject(env.projectFile, {
    name: "Test Project",
    scanRoot: env.scanRoot,
    languages: [
      { code: "en", label: "English", folderSuffix: "english" },
      { code: "de", label: "Deutsch", folderSuffix: "german" },
    ],
  });
});

describe("GET /api/volumes", () => {
  it("reports pageCount/firstPage for a volume with no saved lettering yet", async () => {
    const res = await request(app).get("/api/volumes");
    expect(res.status).toBe(200);
    const volume = res.body.find((v: { id: string }) => v.id === VOLUME_ID);
    expect(volume).toMatchObject({
      pageCount: 1,
      firstPage: "page_01",
      panelCount: 0,
      bubbleCount: 0,
      bubbleCountByLanguage: { en: 0, de: 0 },
    });
  });

  it("tallies panels and per-language non-empty bubble text across saved lettering JSON", async () => {
    const dir = path.join(env.scanRoot, "Volume_01", "volume_01_lettering");
    await fs.mkdir(dir, { recursive: true });
    const layout = {
      page: "page_01",
      sourceImage: "page_01.png",
      imageWidth: 4,
      imageHeight: 4,
      panels: [
        { id: "p1", points: [{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 4 }, { x: 0, y: 4 }] },
      ],
      bubbles: [
        { id: "b1", shape: "rect", x: 0, y: 0, width: 1, height: 1, text: { en: "Hello", de: "" } },
        { id: "b2", shape: "rect", x: 0, y: 0, width: 1, height: 1, text: { en: "World", de: "Welt" } },
      ],
    };
    await fs.writeFile(path.join(dir, "page_01.json"), JSON.stringify(layout), "utf-8");

    const res = await request(app).get("/api/volumes");
    expect(res.status).toBe(200);
    const volume = res.body.find((v: { id: string }) => v.id === VOLUME_ID);
    expect(volume).toMatchObject({
      pageCount: 1,
      panelCount: 1,
      bubbleCount: 2,
      bubbleCountByLanguage: { en: 2, de: 1 },
    });
  });
});
