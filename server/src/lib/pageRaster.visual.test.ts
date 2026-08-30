import { beforeAll, describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import pixelmatch from "pixelmatch";
import { createCanvas, loadImage } from "@napi-rs/canvas";
import { createBubble, createCurvedTextElement, createEmptyLayout, createPanel, type PageLayout } from "../../../shared/src/layoutSchema.js";
import { drawBaseImage, drawBubbleElement, drawCurvedTextElementRaster, ensurePageRasterReady, loadBaseImage, registerFont } from "./pageRaster.js";

/**
 * Cheap visual-regression guard for the shared rendering pipeline
 * (shared/src/rendering/*.ts, drawn here via pageRaster.ts's server-side
 * @napi-rs/canvas path) — pixel-diffs a rendered page against a checked-in baseline
 * PNG instead of asserting individual pixel values one at a time the way
 * pageRaster.test.ts does. Deliberately NOT a browser/Playwright screenshot test:
 * @napi-rs/canvas bundles its own Skia rasterizer, so glyph/shape rendering is
 * identical across OS/CI runners (unlike a real browser, whose font rendering
 * varies by platform) — the same property that already makes buildPdfPage.test.ts's
 * byte-equality assertions reliable.
 *
 * Deliberately renders EVERY element type in one page (rect/oval bubble, tail,
 * custom padding, vertical Japanese text with furigana, a quad bubble, and a curved
 * text) so a single test run exercises most of the rendering surface at once — the
 * goal is "did this refactor visibly change anything", not per-feature coverage
 * (that's what the many feature-specific unit tests elsewhere are for).
 *
 * If a change is a DELIBERATE visual update, delete
 * `__fixtures__/pageRaster.visual.baseline.png` and re-run this test once — it
 * regenerates the baseline from the current render and passes trivially, exactly
 * like jest-image-snapshot's `--ci=false` first-run behavior.
 */

const fixturesDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "__fixtures__");
const baselinePath = path.join(fixturesDir, "pageRaster.visual.baseline.png");

let baseImagePath: string;

beforeAll(async () => {
  ensurePageRasterReady();
  await fs.mkdir(fixturesDir, { recursive: true });

  const dir = path.join(fixturesDir, ".tmp");
  await fs.mkdir(dir, { recursive: true });
  baseImagePath = path.join(dir, "page.png");
  await sharp({ create: { width: 400, height: 300, channels: 3, background: { r: 245, g: 245, b: 245 } } })
    .png()
    .toFile(baseImagePath);

  registerFont("C:\\Windows\\Fonts\\arial.ttf", "TestFont");
});

function buildLayout(): PageLayout {
  const panel = createPanel({
    id: "p1",
    points: [
      { x: 10, y: 10 },
      { x: 390, y: 10 },
      { x: 390, y: 290 },
      { x: 10, y: 290 },
    ],
  });

  const speech = createBubble({
    id: "b1",
    x: 10,
    y: 20,
    width: 140,
    height: 70,
    bubbleStyle: "speech",
    fillColor: "#ffffff",
    strokeColor: "#000000",
    fontFamily: "TestFont",
    fontSize: 18,
    text: { de: "Hallo Welt" },
    tail: { x: 20, y: 90 },
  });

  const thought = createBubble({
    id: "b2",
    x: 200,
    y: 20,
    width: 150,
    height: 80,
    shape: "oval",
    bubbleStyle: "thought",
    fillColor: "#eef2ff",
    strokeColor: "#333366",
    fontFamily: "TestFont",
    fontSize: 16,
    paddingRatio: 0.35,
    text: { de: "Ein Gedanke..." },
  });

  // "TestFont" (arial.ttf, see beforeAll) has no CJK glyphs, so these characters
  // render invisibly/as tofu — this bubble still exercises the tategaki/furigana
  // LAYOUT math (column geometry, row spacing, forced breaks) via drawVerticalText,
  // it just can't visually catch a glyph-level regression. Real vertical-typesetting
  // correctness (token positions, ruby placement, kinsoku) is covered by
  // shared/src/rendering/verticalTypesetting.test.ts's targeted assertions instead —
  // this file's job is the surrounding shapes/colors/geometry, not glyph pixels.
  const vertical = createBubble({
    id: "b3",
    x: 10,
    y: 140,
    width: 100,
    height: 140,
    bubbleStyle: "shout",
    fillColor: "#fff3cd",
    strokeColor: "#664d03",
    fontFamily: "TestFont",
    fontSize: 20,
    direction: "vertical-rl",
    text: { ja: "{漢字|かんじ}のテスト" },
  });

  const quad = createBubble({
    id: "b4",
    x: 220,
    y: 150,
    width: 140,
    height: 90,
    shape: "quad",
    fontFamily: "TestFont",
    fontSize: 18,
    color: "#cc0000",
    text: { de: "SIGN" },
    corners: [
      { x: 220, y: 160 },
      { x: 360, y: 150 },
      { x: 355, y: 235 },
      { x: 230, y: 240 },
    ],
  });

  const curved = createCurvedTextElement({
    id: "c1",
    points: [
      { x: 40, y: 280 },
      { x: 150, y: 260 },
      { x: 250, y: 260 },
      { x: 360, y: 280 },
    ],
    fontFamily: "TestFont",
    fontSize: 22,
  });

  return {
    ...createEmptyLayout("page_01", "page.png", 400, 300),
    panels: [panel],
    bubbles: [speech, thought, vertical, quad],
    curvedTexts: [{ ...curved, text: { de: "BOOM!" } }],
  };
}

async function renderFlattenedPage(layout: PageLayout): Promise<Buffer> {
  const baseImage = await loadBaseImage(baseImagePath);
  const canvas = createCanvas(layout.imageWidth, layout.imageHeight);
  const ctx = canvas.getContext("2d") as unknown as CanvasRenderingContext2D;
  drawBaseImage(ctx, baseImage, layout);
  for (const bubble of layout.bubbles) {
    drawBubbleElement(ctx, bubble, layout, "de", []);
  }
  for (const el of layout.curvedTexts) {
    drawCurvedTextElementRaster(ctx, el, "de", []);
  }
  return canvas.toBuffer("image/png");
}

/** Decodes a PNG buffer to raw RGBA via a throwaway canvas — avoids adding a
 * dedicated PNG-decoding dependency (pngjs) just for this one test file, since
 * @napi-rs/canvas (already a dependency) can do it in two lines. */
async function decodeToRgba(png: Buffer): Promise<{ data: Buffer; width: number; height: number }> {
  const img = await loadImage(png);
  const canvas = createCanvas(img.width, img.height);
  const ctx = canvas.getContext("2d") as unknown as CanvasRenderingContext2D;
  ctx.drawImage(img as unknown as CanvasImageSource, 0, 0);
  const { data } = ctx.getImageData(0, 0, img.width, img.height);
  return { data: Buffer.from(data.buffer, data.byteOffset, data.byteLength), width: img.width, height: img.height };
}

describe("visual regression: full page render", () => {
  it("matches the checked-in baseline pixel-for-pixel (within a tiny antialiasing tolerance)", async () => {
    const layout = buildLayout();
    const rendered = await renderFlattenedPage(layout);

    const baselineExists = await fs.access(baselinePath).then(
      () => true,
      () => false
    );
    if (!baselineExists) {
      await fs.writeFile(baselinePath, rendered);
      console.warn(`[visual regression] No baseline found — wrote a new one at ${baselinePath}. Re-run to verify.`);
      return;
    }

    const [current, baseline] = await Promise.all([decodeToRgba(rendered), decodeToRgba(await fs.readFile(baselinePath))]);
    expect(current.width).toBe(baseline.width);
    expect(current.height).toBe(baseline.height);

    const diff = Buffer.alloc(current.data.length);
    const mismatchedPixels = pixelmatch(current.data, baseline.data, diff, current.width, current.height, { threshold: 0.1 });

    if (mismatchedPixels > 0) {
      const diffPath = path.join(fixturesDir, ".tmp", "pageRaster.visual.diff.png");
      const diffCanvas = createCanvas(current.width, current.height);
      const diffCtx = diffCanvas.getContext("2d") as unknown as CanvasRenderingContext2D;
      const imageData = diffCtx.createImageData(current.width, current.height);
      imageData.data.set(diff);
      diffCtx.putImageData(imageData, 0, 0);
      await fs.writeFile(diffPath, diffCanvas.toBuffer("image/png"));
      console.warn(`[visual regression] ${mismatchedPixels} mismatched pixels — diff written to ${diffPath}`);
    }

    // A handful of stray antialiased-edge pixels is expected noise, not a regression —
    // only fail once the mismatch is large enough to represent an actual visible change.
    expect(mismatchedPixels).toBeLessThan(50);
  });
});
