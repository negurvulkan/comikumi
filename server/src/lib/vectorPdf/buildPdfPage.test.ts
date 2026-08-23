import { beforeAll, describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { PDFDocument } from "pdf-lib";
import { setupTestEnv, type TestEnv } from "../../test-utils/fixtures.js";

let env: TestEnv;
let createBubble: typeof import("../../../../shared/src/layoutSchema.js").createBubble;
let createEmptyLayout: typeof import("../../../../shared/src/layoutSchema.js").createEmptyLayout;
let createCurvedTextElement: typeof import("../../../../shared/src/layoutSchema.js").createCurvedTextElement;
let buildVectorPdfPage: typeof import("./buildPdfPage.js").buildVectorPdfPage;
let baseImagePath: string;

beforeAll(async () => {
  env = await setupTestEnv();
  const fontsDir = path.join(env.dataDir, "fonts");
  await fs.mkdir(fontsDir, { recursive: true });
  await fs.copyFile("C:\\Windows\\Fonts\\arial.ttf", path.join(fontsDir, "TestFont.ttf"));

  ({ createBubble, createEmptyLayout, createCurvedTextElement } = await import("../../../../shared/src/layoutSchema.js"));
  ({ buildVectorPdfPage } = await import("./buildPdfPage.js"));

  baseImagePath = path.join(env.dataDir, "page.png");
  await sharp({ create: { width: 400, height: 300, channels: 3, background: { r: 255, g: 255, b: 255 } } })
    .png()
    .toFile(baseImagePath);
});

describe("buildVectorPdfPage", () => {
  it("produces a valid single-page PDF sized to the layout at 300dpi", async () => {
    const layout = createEmptyLayout("page_01", "page.png", 400, 300);
    const bytes = await buildVectorPdfPage({ baseImagePath, layout, languageCode: "de", resolveImagePath: async () => null });
    expect(bytes.length).toBeGreaterThan(0);
    expect(bytes.subarray(0, 5).toString("latin1")).toBe("%PDF-");

    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBe(1);
    const page = doc.getPage(0);
    // 400px/300dpi*72 = 96pt, 300px/300dpi*72 = 72pt.
    expect(page.getWidth()).toBeCloseTo(96, 5);
    expect(page.getHeight()).toBeCloseTo(72, 5);
  });

  it("embeds a real font subset for a rect bubble with text (larger output than a textless page)", async () => {
    const emptyLayout = createEmptyLayout("page_01", "page.png", 400, 300);
    const emptyBytes = await buildVectorPdfPage({ baseImagePath, layout: emptyLayout, languageCode: "de", resolveImagePath: async () => null });

    const bubble = createBubble({
      id: "b1",
      x: 20,
      y: 20,
      width: 200,
      height: 100,
      bubbleStyle: "speech",
      fontFamily: "TestFont",
      text: { de: "Hallo" },
    });
    const layout = { ...createEmptyLayout("page_01", "page.png", 400, 300), bubbles: [bubble] };
    const bytes = await buildVectorPdfPage({ baseImagePath, layout, languageCode: "de", resolveImagePath: async () => null });
    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBe(1);
    // A genuinely embedded font subset adds real glyph-outline data — a page with text
    // must be meaningfully larger than the same page with no bubbles at all.
    expect(bytes.length).toBeGreaterThan(emptyBytes.length + 500);
  });

  it("skips a bubble whose font family has no embeddable .ttf/.otf on disk, without throwing", async () => {
    const bubble = createBubble({
      id: "b1",
      x: 20,
      y: 20,
      width: 200,
      height: 100,
      bubbleStyle: "speech",
      fontFamily: "DoesNotExistFont",
      text: { de: "Hallo" },
    });
    const layout = { ...createEmptyLayout("page_01", "page.png", 400, 300), bubbles: [bubble] };
    const bytes = await buildVectorPdfPage({ baseImagePath, layout, languageCode: "de", resolveImagePath: async () => null });
    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBe(1); // still produces a valid page (background only)
  });

  it("draws real vector text for a quad-shape bubble via the affine approximation (larger output than a textless page)", async () => {
    const emptyLayout = createEmptyLayout("page_01", "page.png", 400, 300);
    const emptyBytes = await buildVectorPdfPage({ baseImagePath, layout: emptyLayout, languageCode: "de", resolveImagePath: async () => null });

    const quadBubble = createBubble({
      id: "b1",
      x: 0,
      y: 0,
      width: 1,
      height: 1,
      shape: "quad",
      fontFamily: "TestFont",
      text: { de: "SIGN TEXT" },
    });
    // A genuine (non-parallelogram, tilted) perspective quad — same shape family as
    // perspective.test.ts's "perspectiveQuad" — so the affine approximation actually
    // has a non-zero rotation/shear to approximate, not a degenerate axis-aligned case.
    quadBubble.corners = [
      { x: 100, y: 60 },
      { x: 260, y: 20 },
      { x: 300, y: 160 },
      { x: 60, y: 220 },
    ];
    const layout = { ...createEmptyLayout("page_01", "page.png", 400, 300), bubbles: [quadBubble] };
    const bytes = await buildVectorPdfPage({ baseImagePath, layout, languageCode: "de", resolveImagePath: async () => null });
    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBe(1);
    expect(bytes.length).toBeGreaterThan(emptyBytes.length + 500);
  });

  it("skips vertical-direction bubbles (rect/oval and quad alike) for now, without throwing", async () => {
    const verticalRect = createBubble({
      id: "b1",
      x: 20,
      y: 20,
      width: 100,
      height: 100,
      bubbleStyle: "speech",
      fontFamily: "TestFont",
      direction: "vertical-rl",
      text: { de: "縦書き" },
    });
    const verticalQuad = createBubble({
      id: "b2",
      x: 0,
      y: 0,
      width: 1,
      height: 1,
      shape: "quad",
      fontFamily: "TestFont",
      direction: "vertical-rl",
      text: { de: "縦書き" },
    });
    verticalQuad.corners = [
      { x: 150, y: 150 },
      { x: 250, y: 150 },
      { x: 250, y: 250 },
      { x: 150, y: 250 },
    ];
    const layout = { ...createEmptyLayout("page_01", "page.png", 400, 300), bubbles: [verticalRect, verticalQuad] };
    const bytes = await buildVectorPdfPage({ baseImagePath, layout, languageCode: "de", resolveImagePath: async () => null });
    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBe(1);
  });

  it("embeds real vector text for a curved-text element (larger output than a textless page)", async () => {
    const emptyLayout = createEmptyLayout("page_01", "page.png", 400, 300);
    const emptyBytes = await buildVectorPdfPage({ baseImagePath, layout: emptyLayout, languageCode: "de", resolveImagePath: async () => null });

    const curved = createCurvedTextElement({
      id: "c1",
      points: [
        { x: 40, y: 250 },
        { x: 150, y: 50 },
        { x: 250, y: 50 },
        { x: 360, y: 250 },
      ],
      fontFamily: "TestFont",
      fontSize: 26,
    });
    const layout = { ...createEmptyLayout("page_01", "page.png", 400, 300), curvedTexts: [{ ...curved, text: { de: "BOOM!" } }] };
    const bytes = await buildVectorPdfPage({ baseImagePath, layout, languageCode: "de", resolveImagePath: async () => null });
    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBe(1);
    expect(bytes.length).toBeGreaterThan(emptyBytes.length + 500);
  });

  it("has no text at all for an empty layout (background only)", async () => {
    const layout = createEmptyLayout("page_01", "page.png", 400, 300);
    const bytes = await buildVectorPdfPage({ baseImagePath, layout, languageCode: "de", resolveImagePath: async () => null });
    expect(bytes.length).toBeGreaterThan(0);
  });
});
