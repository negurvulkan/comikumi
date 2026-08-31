import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { PDFDocument } from "pdf-lib";
import { setupTestEnv, type TestEnv } from "../../test-utils/fixtures.js";

let env: TestEnv;
let createBubble: typeof import("../../../../shared/src/layoutSchema.js").createBubble;
let createEmptyLayout: typeof import("../../../../shared/src/layoutSchema.js").createEmptyLayout;
let createCurvedTextElement: typeof import("../../../../shared/src/layoutSchema.js").createCurvedTextElement;
let createPanel: typeof import("../../../../shared/src/layoutSchema.js").createPanel;
let buildVectorPdfPage: typeof import("./buildPdfPage.js").buildVectorPdfPage;
let baseImagePath: string;

/** Test convenience wrapper — defaults `pdfxVersion` (irrelevant to most cases here,
 * see pdfXMetadata.test.ts for version-specific behavior) and unwraps `.bytes`. */
function build(opts: Omit<Parameters<typeof buildVectorPdfPage>[0], "pdfxVersion">) {
  return buildVectorPdfPage({ ...opts, pdfxVersion: "x4" }).then((r) => r.bytes);
}

beforeAll(async () => {
  env = await setupTestEnv();
  const fontsDir = path.join(env.dataDir, "fonts");
  await fs.mkdir(fontsDir, { recursive: true });
  // Real TTF bytes are needed here (pdf-lib/fontkit actually parses and embeds glyph
  // outlines), so a committed fixture — not a placeholder — same DejaVu Sans font as
  // pageRaster.visual.test.ts uses, for the same reason: the previous
  // C:\Windows\Fonts\arial.ttf only existed on Windows and broke this test elsewhere.
  await fs.copyFile(
    path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "__fixtures__", "TestFont.ttf"),
    path.join(fontsDir, "TestFont.ttf")
  );

  ({ createBubble, createEmptyLayout, createCurvedTextElement, createPanel } = await import(
    "../../../../shared/src/layoutSchema.js"
  ));
  ({ buildVectorPdfPage } = await import("./buildPdfPage.js"));

  baseImagePath = path.join(env.dataDir, "page.png");
  await sharp({ create: { width: 400, height: 300, channels: 3, background: { r: 255, g: 255, b: 255 } } })
    .png()
    .toFile(baseImagePath);
});

afterEach(() => {
  delete process.env.PDFX_ICC_PROFILE_PATH;
});

describe("buildVectorPdfPage", () => {
  it("produces a valid single-page PDF sized to the layout at 300dpi", async () => {
    const layout = createEmptyLayout("page_01", "page.png", 400, 300);
    const bytes = await build({ baseImagePath, layout, languageCode: "de", resolveImagePath: async () => null });
    expect(bytes.length).toBeGreaterThan(0);
    expect(bytes.subarray(0, 5).toString("latin1")).toBe("%PDF-");

    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBe(1);
    const page = doc.getPage(0);
    // 400px/300dpi*72 = 96pt, 300px/300dpi*72 = 72pt.
    expect(page.getWidth()).toBeCloseTo(96, 5);
    expect(page.getHeight()).toBeCloseTo(72, 5);
  });

  it("reports pdfxStamped: false when no ICC profile is configured (the default in this test env)", async () => {
    const layout = createEmptyLayout("page_01", "page.png", 400, 300);
    const result = await buildVectorPdfPage({ baseImagePath, layout, languageCode: "de", resolveImagePath: async () => null, pdfxVersion: "x4" });
    expect(result.pdfxStamped).toBe(false);
  });

  it("reports pdfxStamped: true once PDFX_ICC_PROFILE_PATH points at a readable file", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "icc-test-"));
    const iccPath = path.join(dir, "fake.icc");
    await fs.writeFile(iccPath, Buffer.from("not a real ICC profile, just needs to exist"));
    process.env.PDFX_ICC_PROFILE_PATH = iccPath;

    const layout = createEmptyLayout("page_01", "page.png", 400, 300);
    const result = await buildVectorPdfPage({ baseImagePath, layout, languageCode: "de", resolveImagePath: async () => null, pdfxVersion: "x4" });
    expect(result.pdfxStamped).toBe(true);

    const doc = await PDFDocument.load(result.bytes);
    expect(doc.getPageCount()).toBe(1); // still a structurally valid PDF
  });

  it("embeds a real font subset for a rect bubble with text (larger output than a textless page)", async () => {
    const emptyLayout = createEmptyLayout("page_01", "page.png", 400, 300);
    const emptyBytes = await build({ baseImagePath, layout: emptyLayout, languageCode: "de", resolveImagePath: async () => null });

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
    const bytes = await build({ baseImagePath, layout, languageCode: "de", resolveImagePath: async () => null });
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
    const bytes = await build({ baseImagePath, layout, languageCode: "de", resolveImagePath: async () => null });
    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBe(1); // still produces a valid page (background only)
  });

  it("draws real vector text for a quad-shape bubble via the affine approximation (larger output than a textless page)", async () => {
    const emptyLayout = createEmptyLayout("page_01", "page.png", 400, 300);
    const emptyBytes = await build({ baseImagePath, layout: emptyLayout, languageCode: "de", resolveImagePath: async () => null });

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
    const bytes = await build({ baseImagePath, layout, languageCode: "de", resolveImagePath: async () => null });
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
    const bytes = await build({ baseImagePath, layout, languageCode: "de", resolveImagePath: async () => null });
    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBe(1);
  });

  it("embeds real vector text for a curved-text element (larger output than a textless page)", async () => {
    const emptyLayout = createEmptyLayout("page_01", "page.png", 400, 300);
    const emptyBytes = await build({ baseImagePath, layout: emptyLayout, languageCode: "de", resolveImagePath: async () => null });

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
    const bytes = await build({ baseImagePath, layout, languageCode: "de", resolveImagePath: async () => null });
    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBe(1);
    expect(bytes.length).toBeGreaterThan(emptyBytes.length + 500);
  });

  it("shifts a panel-child bubble's text by the panel's origin, matching its background (regression: text used to stay at the raw panel-relative coordinate while the background moved)", async () => {
    // A bubble that's a child of a panel stores x/y RELATIVE to panel.origin. Rendering
    // {panel origin (100,80), bubble x/y (20,20)} must look identical to a bubble with no
    // panel at all placed directly at the equivalent ABSOLUTE coordinate (120,100) — if the
    // text-position fix regresses, only the background shifts and these two diverge.
    const panel = createPanel({
      id: "p1",
      points: [
        { x: 100, y: 80 },
        { x: 400, y: 80 },
        { x: 400, y: 350 },
        { x: 100, y: 350 },
      ],
    });
    const childBubble = createBubble({
      id: "b1",
      panelId: "p1",
      x: 20,
      y: 20,
      width: 200,
      height: 100,
      bubbleStyle: "speech",
      fontFamily: "TestFont",
      text: { de: "Hallo" },
    });
    const layoutWithPanel = { ...createEmptyLayout("page_01", "page.png", 400, 300), panels: [panel], bubbles: [childBubble] };

    const absoluteBubble = createBubble({
      id: "b1",
      x: 120,
      y: 100,
      width: 200,
      height: 100,
      bubbleStyle: "speech",
      fontFamily: "TestFont",
      text: { de: "Hallo" },
    });
    const layoutAbsolute = { ...createEmptyLayout("page_01", "page.png", 400, 300), bubbles: [absoluteBubble] };

    // applyPdfXMetadata() stamps a wall-clock CreationDate into every PDF (see
    // pdfXMetadata.ts) — freeze time so the two builds below, which this test compares
    // byte-for-byte, don't pick up different timestamps if they straddle a clock tick.
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2024-01-01T00:00:00Z"));
    let bytesWithPanel: Buffer, bytesAbsolute: Buffer;
    try {
      bytesWithPanel = await build({ baseImagePath, layout: layoutWithPanel, languageCode: "de", resolveImagePath: async () => null });
      bytesAbsolute = await build({ baseImagePath, layout: layoutAbsolute, languageCode: "de", resolveImagePath: async () => null });
    } finally {
      vi.useRealTimers();
    }

    expect(bytesWithPanel.equals(bytesAbsolute)).toBe(true);
  });

  it("has no text at all for an empty layout (background only)", async () => {
    const layout = createEmptyLayout("page_01", "page.png", 400, 300);
    const bytes = await build({ baseImagePath, layout, languageCode: "de", resolveImagePath: async () => null });
    expect(bytes.length).toBeGreaterThan(0);
  });
});
