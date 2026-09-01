import { beforeAll, describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { readPsd } from "ag-psd";
import { setupTestEnv, type TestEnv } from "../test-utils/fixtures.js";

// Own file (not psdExport.test.ts) because it needs a real registered font — see
// setupTestEnv()'s doc comment: LETTERING_DATA_DIR must be set BEFORE the first
// dynamic import of anything that reads paths.ts's FONTS_DIR at module-eval time.
let env: TestEnv;
let baseImagePath: string;
let buildLayeredPsd: typeof import("./psdExport.js").buildLayeredPsd;
let createBubble: typeof import("../../../shared/src/layoutSchema.js").createBubble;
let createCurvedTextElement: typeof import("../../../shared/src/layoutSchema.js").createCurvedTextElement;
let createEmptyLayout: typeof import("../../../shared/src/layoutSchema.js").createEmptyLayout;

beforeAll(async () => {
  env = await setupTestEnv();
  const fontsDir = path.join(env.dataDir, "fonts");
  await fs.mkdir(fontsDir, { recursive: true });
  const fixturesDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "__fixtures__");
  await fs.copyFile(path.join(fixturesDir, "TestFont.ttf"), path.join(fontsDir, "TestFont.ttf"));

  const dir = await fs.mkdtemp(path.join(env.dataDir, "psd-editable-text-"));
  baseImagePath = path.join(dir, "page.png");
  await sharp({ create: { width: 200, height: 150, channels: 3, background: { r: 255, g: 255, b: 255 } } })
    .png()
    .toFile(baseImagePath);

  ({ buildLayeredPsd } = await import("./psdExport.js"));
  ({ createBubble, createCurvedTextElement, createEmptyLayout } = await import("../../../shared/src/layoutSchema.js"));
});

describe("buildLayeredPsd — editableTextLayers", () => {
  it("adds no text object to any layer when editableTextLayers is unset (default, unchanged behavior)", async () => {
    const bubble = createBubble({
      id: "b1",
      x: 20,
      y: 20,
      width: 100,
      height: 40,
      bubbleStyle: "speech",
      fontFamily: "TestFont",
      color: "#ff0000",
      text: { de: "Hallo Welt" },
    });
    const layout = { ...createEmptyLayout("page_01", "page.png", 200, 150), bubbles: [bubble] };
    const bytes = await buildLayeredPsd({ baseImagePath, layout, languageCode: "de", resolveImagePath: async () => null });

    const psd = readPsd(bytes);
    const layer = psd.children!.find((l) => l.name === "Sprechblase 1")!;
    expect(layer.text).toBeUndefined();
  });

  it("adds a real text object for a plain rect bubble with a resolvable font", async () => {
    const bubble = createBubble({
      id: "b1",
      x: 20,
      y: 20,
      width: 100,
      height: 40,
      bubbleStyle: "speech",
      fontFamily: "TestFont",
      fontSize: 18,
      color: "#ff0000",
      align: "right",
      text: { de: "Hallo Welt" },
    });
    const layout = { ...createEmptyLayout("page_01", "page.png", 200, 150), bubbles: [bubble] };
    const bytes = await buildLayeredPsd({
      baseImagePath,
      layout,
      languageCode: "de",
      resolveImagePath: async () => null,
      editableTextLayers: true,
    });

    const psd = readPsd(bytes);
    const layer = psd.children!.find((l) => l.name === "Sprechblase 1 (Text)")!;
    expect(layer.text).toBeDefined();
    expect(layer.text!.text).toBe("Hallo Welt");
    expect(layer.text!.style?.fillColor).toEqual({ r: 255, g: 0, b: 0 });
    expect(layer.text!.paragraphStyle?.justification).toBe("right");
    expect(layer.text!.style?.font?.name).toBeTruthy();
    expect(layer.text!.style?.font?.name).not.toBe("TestFont"); // real PostScript name, not the app's own alias
    expect(layer.text!.shapeType).toBe("box");
  });

  it("splits an editable bubble into a text-free background layer plus a separate text layer", async () => {
    // Photoshop can only ever show TEXT in a Type layer — background pixels baked into
    // the same layer as a `text` object get discarded once Photoshop "Updates" it, so
    // the bubble's outline/fill must live on its own, separate, text-free layer.
    // (Regression guard for exactly the bug a real-world report showed: the bubble's
    // shape visibly disappearing once its text layer was edited in Photoshop.)
    const bubble = createBubble({
      id: "b1",
      x: 20,
      y: 20,
      width: 100,
      height: 40,
      bubbleStyle: "speech",
      fillColor: "#fffbe0",
      fontFamily: "TestFont",
      text: { de: "Hallo Welt" },
    });
    const layout = { ...createEmptyLayout("page_01", "page.png", 200, 150), bubbles: [bubble] };
    const bytes = await buildLayeredPsd({
      baseImagePath,
      layout,
      languageCode: "de",
      resolveImagePath: async () => null,
      editableTextLayers: true,
    });

    const psd = readPsd(bytes);
    const names = psd.children!.map((l) => l.name);
    expect(names).toContain("Sprechblase 1 (Hintergrund)");
    expect(names).toContain("Sprechblase 1 (Text)");
    expect(names).not.toContain("Sprechblase 1");

    const background = psd.children!.find((l) => l.name === "Sprechblase 1 (Hintergrund)")!;
    const textLayer = psd.children!.find((l) => l.name === "Sprechblase 1 (Text)")!;
    expect(background.text).toBeUndefined();
    expect(textLayer.text).toBeDefined();

    // Background layer sits below the text layer in the (bottom-to-top) layer stack.
    expect(names.indexOf("Sprechblase 1 (Hintergrund)")).toBeLessThan(names.indexOf("Sprechblase 1 (Text)"));
  });

  it("positions the text object at the bubble's actual page position, not the document origin", async () => {
    // A bubble placed well away from (0,0) — textBoxFor() returns a box LOCAL to the
    // bubble (0,0-origin); the text layer's `transform` must add the bubble's own
    // form.x/form.y on top, same as every raster draw path already does, or the text
    // lands bunched up near the page's top-left instead of over its bubble.
    const bubble = createBubble({
      id: "b1",
      x: 120,
      y: 90,
      width: 60,
      height: 30,
      bubbleStyle: "speech",
      fontFamily: "TestFont",
      text: { de: "Hi" },
    });
    const layout = { ...createEmptyLayout("page_01", "page.png", 200, 150), bubbles: [bubble] };
    const bytes = await buildLayeredPsd({
      baseImagePath,
      layout,
      languageCode: "de",
      resolveImagePath: async () => null,
      editableTextLayers: true,
    });

    const psd = readPsd(bytes);
    const layer = psd.children!.find((l) => l.name === "Sprechblase 1 (Text)")!;
    const [, , , , tx, ty] = layer.text!.transform!;
    expect(tx).toBeGreaterThan(bubble.x);
    expect(ty).toBeGreaterThan(bubble.y);
  });

  it.each([
    ["a quad bubble", { shape: "quad" as const, corners: [{ x: 20, y: 20 }, { x: 80, y: 20 }, { x: 80, y: 80 }, { x: 20, y: 80 }] }],
    ["vertical-rl direction", { direction: "vertical-rl" as const }],
    ["a gradient fill", { textGradient: { enabled: true, colorStart: "#ffffff", colorEnd: "#000000", angleDeg: 0 } }],
    ["a merged bubble", { mergeGroupId: "g1", mergePrimary: true }],
  ])("stays raster-only for %s", async (_label, overrides) => {
    const bubble = createBubble({
      id: "b1",
      x: 20,
      y: 20,
      width: 100,
      height: 40,
      bubbleStyle: "speech",
      fontFamily: "TestFont",
      text: { de: "Hallo Welt" },
      ...overrides,
    });
    const layout = { ...createEmptyLayout("page_01", "page.png", 200, 150), bubbles: [bubble] };
    const bytes = await buildLayeredPsd({
      baseImagePath,
      layout,
      languageCode: "de",
      resolveImagePath: async () => null,
      editableTextLayers: true,
    });

    const psd = readPsd(bytes);
    const layer = psd.children!.find((l) => l.name === "Sprechblase 1")!;
    expect(layer.text).toBeUndefined();
  });

  it("stays raster-only for an unresolvable font family", async () => {
    const bubble = createBubble({
      id: "b1",
      x: 20,
      y: 20,
      width: 100,
      height: 40,
      bubbleStyle: "speech",
      fontFamily: "NoSuchFont",
      text: { de: "Hallo Welt" },
    });
    const layout = { ...createEmptyLayout("page_01", "page.png", 200, 150), bubbles: [bubble] };
    const bytes = await buildLayeredPsd({
      baseImagePath,
      layout,
      languageCode: "de",
      resolveImagePath: async () => null,
      editableTextLayers: true,
    });

    const psd = readPsd(bytes);
    const layer = psd.children!.find((l) => l.name === "Sprechblase 1")!;
    expect(layer.text).toBeUndefined();
  });

  it("curved-text elements always stay raster-only, even with editableTextLayers on", async () => {
    const curved = createCurvedTextElement({
      id: "c1",
      points: [
        { x: 20, y: 120 },
        { x: 60, y: 30 },
        { x: 140, y: 30 },
        { x: 180, y: 120 },
      ],
      fontFamily: "TestFont",
    });
    const layout = { ...createEmptyLayout("page_01", "page.png", 200, 150), curvedTexts: [{ ...curved, text: { de: "BOOM!" } }] };
    const bytes = await buildLayeredPsd({
      baseImagePath,
      layout,
      languageCode: "de",
      resolveImagePath: async () => null,
      editableTextLayers: true,
    });

    const psd = readPsd(bytes);
    const layer = psd.children!.find((l) => l.name === "Kurventext 1")!;
    expect(layer.text).toBeUndefined();
  });
});
