import { beforeAll, describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";
import { readPsd } from "ag-psd";
import { createBubble, createCurvedTextElement, createEmptyLayout } from "../../../shared/src/layoutSchema.js";
import { buildLayeredPsd } from "./psdExport.js";

let baseImagePath: string;

beforeAll(async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "psd-export-test-"));
  baseImagePath = path.join(dir, "page.png");
  await sharp({ create: { width: 200, height: 150, channels: 3, background: { r: 255, g: 255, b: 255 } } })
    .png()
    .toFile(baseImagePath);
});

describe("buildLayeredPsd", () => {
  it("produces a valid PSD with just background+retouch layers for an empty layout", async () => {
    const layout = createEmptyLayout("page_01", "page.png", 200, 150);
    const bytes = await buildLayeredPsd({ baseImagePath, layout, languageCode: "de", resolveImagePath: async () => null });
    expect(bytes.length).toBeGreaterThan(0);

    const psd = readPsd(bytes);
    expect(psd.width).toBe(200);
    expect(psd.height).toBe(150);
    expect(psd.children?.map((l) => l.name)).toEqual(["Hintergrund", "Retuschen / Cut-Panels / Bilder"]);
  });

  it("adds one layer per bubble with visible content", async () => {
    const bubble = createBubble({ id: "b1", x: 20, y: 20, width: 60, height: 40, bubbleStyle: "speech", text: { de: "Hallo" } });
    const layout = { ...createEmptyLayout("page_01", "page.png", 200, 150), bubbles: [bubble] };
    const bytes = await buildLayeredPsd({ baseImagePath, layout, languageCode: "de", resolveImagePath: async () => null });

    const psd = readPsd(bytes);
    expect(psd.children?.map((l) => l.name)).toEqual([
      "Hintergrund",
      "Retuschen / Cut-Panels / Bilder",
      "Sprechblase 1",
    ]);
    const layer = psd.children!.find((l) => l.name === "Sprechblase 1")!;
    expect(layer.left).toBe(0);
    expect(layer.top).toBe(0);
    expect(layer.right).toBe(200);
    expect(layer.bottom).toBe(150);
  });

  it("skips a quad bubble with no text (no visible content)", async () => {
    const bubble = createBubble({ id: "b1", x: 0, y: 0, width: 1, height: 1, shape: "quad", text: {} });
    bubble.corners = [
      { x: 20, y: 20 },
      { x: 80, y: 20 },
      { x: 80, y: 80 },
      { x: 20, y: 80 },
    ];
    const layout = { ...createEmptyLayout("page_01", "page.png", 200, 150), bubbles: [bubble] };
    const bytes = await buildLayeredPsd({ baseImagePath, layout, languageCode: "de", resolveImagePath: async () => null });

    const psd = readPsd(bytes);
    expect(psd.children?.map((l) => l.name)).toEqual(["Hintergrund", "Retuschen / Cut-Panels / Bilder"]);
  });

  it("keeps a rect bubble with no text (background shape is still visible)", async () => {
    const bubble = createBubble({ id: "b1", x: 20, y: 20, width: 60, height: 40, bubbleStyle: "speech", text: {} });
    const layout = { ...createEmptyLayout("page_01", "page.png", 200, 150), bubbles: [bubble] };
    const bytes = await buildLayeredPsd({ baseImagePath, layout, languageCode: "de", resolveImagePath: async () => null });

    const psd = readPsd(bytes);
    expect(psd.children?.map((l) => l.name)).toEqual([
      "Hintergrund",
      "Retuschen / Cut-Panels / Bilder",
      "Sprechblase 1",
    ]);
  });

  it("adds one layer per curved-text element with visible content, skips empty ones", async () => {
    const withText = createCurvedTextElement({
      id: "c1",
      points: [
        { x: 20, y: 120 },
        { x: 60, y: 30 },
        { x: 140, y: 30 },
        { x: 180, y: 120 },
      ],
    });
    const withoutText = createCurvedTextElement({
      id: "c2",
      points: [
        { x: 20, y: 130 },
        { x: 60, y: 40 },
        { x: 140, y: 40 },
        { x: 180, y: 130 },
      ],
    });
    const layout = {
      ...createEmptyLayout("page_01", "page.png", 200, 150),
      curvedTexts: [
        { ...withText, text: { de: "BOOM!" } },
        withoutText,
      ],
    };
    const bytes = await buildLayeredPsd({ baseImagePath, layout, languageCode: "de", resolveImagePath: async () => null });

    const psd = readPsd(bytes);
    expect(psd.children?.map((l) => l.name)).toEqual([
      "Hintergrund",
      "Retuschen / Cut-Panels / Bilder",
      "Kurventext 1",
    ]);
  });
});
