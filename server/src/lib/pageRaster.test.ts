import { beforeAll, describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";
import { createBubble, createEmptyLayout } from "../../../shared/src/layoutSchema.js";
import { renderPageBackground } from "./pageRaster.js";

let baseImagePath: string;

beforeAll(async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "page-raster-test-"));
  baseImagePath = path.join(dir, "page.png");
  await sharp({ create: { width: 200, height: 150, channels: 3, background: { r: 255, g: 255, b: 255 } } })
    .png()
    .toFile(baseImagePath);
});

describe("renderPageBackground", () => {
  it("returns a canvas matching the layout's declared dimensions", async () => {
    const layout = createEmptyLayout("page_01", "page.png", 200, 150);
    const canvas = await renderPageBackground({ baseImagePath, layout, languageCode: "de", resolveImagePath: async () => null });
    expect(canvas.width).toBe(200);
    expect(canvas.height).toBe(150);
  });

  it("draws a rect bubble's background fill onto the page", async () => {
    const bubble = createBubble({ id: "b1", x: 20, y: 20, width: 60, height: 40, bubbleStyle: "speech", fillColor: "#ff0000" });
    const layout = { ...createEmptyLayout("page_01", "page.png", 200, 150), bubbles: [bubble] };
    const canvas = await renderPageBackground({ baseImagePath, layout, languageCode: "de", resolveImagePath: async () => null });
    const ctx = canvas.getContext("2d");
    const pixel = ctx.getImageData(50, 40, 1, 1).data; // center of the bubble box
    expect(pixel[0]).toBeGreaterThan(200); // red channel: strong
    expect(pixel[1]).toBeLessThan(50); // green channel: weak
  });

  it("skips a 'none'-style bubble (no fill drawn, matches renderPageToPng.ts)", async () => {
    const bubble = createBubble({ id: "b1", x: 20, y: 20, width: 60, height: 40, bubbleStyle: "none", fillColor: "#ff0000" });
    const layout = { ...createEmptyLayout("page_01", "page.png", 200, 150), bubbles: [bubble] };
    const canvas = await renderPageBackground({ baseImagePath, layout, languageCode: "de", resolveImagePath: async () => null });
    const ctx = canvas.getContext("2d");
    const pixel = ctx.getImageData(50, 40, 1, 1).data;
    expect(pixel[0]).toBe(255); // untouched white background
  });

  it("skips quad bubbles' background entirely (matches renderPageToPng.ts's own behavior)", async () => {
    const bubble = createBubble({ id: "b1", x: 20, y: 20, width: 60, height: 40, shape: "quad", bubbleStyle: "speech", fillColor: "#ff0000" });
    const layout = { ...createEmptyLayout("page_01", "page.png", 200, 150), bubbles: [bubble] };
    const canvas = await renderPageBackground({ baseImagePath, layout, languageCode: "de", resolveImagePath: async () => null });
    const ctx = canvas.getContext("2d");
    const pixel = ctx.getImageData(50, 40, 1, 1).data;
    expect(pixel[0]).toBe(255);
  });
});
