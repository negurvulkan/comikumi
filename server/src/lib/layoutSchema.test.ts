import { describe, it, expect } from "vitest";
import {
  resolveEffectiveTailStyle,
  resolveBubbleStyle,
  resolveBubbleForm,
  resolveCurvedTextStyle,
  imageFileForLanguage,
  panelDisplayLabel,
  polygonBounds,
  boxCorners,
  createBubble,
  createPanel,
  createCurvedTextElement,
  createImageElement,
  createEmptyLayout,
  cutPanelReplacementFileForLanguage,
  resolvePanelForLanguage,
  pageLayerOrder,
  withLayerOrder,
} from "../../../shared/src/layoutSchema.js";
import type { LetteringPreset } from "../../../shared/src/presets.js";

function preset(partial: Partial<LetteringPreset> & Pick<LetteringPreset, "id">): LetteringPreset {
  return {
    name: "Test Preset",
    text: {},
    background: {},
    ...partial,
  };
}

describe("resolveEffectiveTailStyle", () => {
  it("defaults thought bubbles to chain and everything else to point when unset", () => {
    expect(resolveEffectiveTailStyle("thought", undefined)).toBe("chain");
    expect(resolveEffectiveTailStyle("speech", undefined)).toBe("point");
    expect(resolveEffectiveTailStyle("none", undefined)).toBe("point");
  });

  it("an explicit tailStyle always wins over the implicit default", () => {
    expect(resolveEffectiveTailStyle("thought", "point-detached")).toBe("point-detached");
    expect(resolveEffectiveTailStyle("speech", "chain")).toBe("chain");
  });
});

describe("resolveBubbleStyle", () => {
  const base = createBubble({ id: "b1", x: 0, y: 0, width: 100, height: 100, fontFamily: "Anime Ace", fontSize: 24 });

  it("falls back to the bubble's own base values with no override/preset", () => {
    const style = resolveBubbleStyle(base, "de");
    expect(style.fontFamily).toBe("Anime Ace");
    expect(style.fontSize).toBe(24);
    expect(style.color).toBe("#000000");
  });

  it("a preset-defined field overrides the base value", () => {
    const p = preset({ id: "p1", text: { fontFamily: "SFX Font" } });
    const style = resolveBubbleStyle({ ...base, presetId: "p1" }, "de", [p]);
    expect(style.fontFamily).toBe("SFX Font");
    // fontSize wasn't defined by the preset — stays on the bubble's own value
    expect(style.fontSize).toBe(24);
  });

  it("a per-language override wins over both the preset and the base value", () => {
    const p = preset({ id: "p1", text: { fontFamily: "SFX Font" } });
    const bubble = { ...base, presetId: "p1", fontFamilyOverride: { de: "Override Font" } };
    const style = resolveBubbleStyle(bubble, "de", [p]);
    expect(style.fontFamily).toBe("Override Font");
  });

  it("a stale/deleted presetId falls back to the base value as if unassigned", () => {
    const bubble = { ...base, presetId: "does-not-exist" };
    const style = resolveBubbleStyle(bubble, "de", [preset({ id: "other" })]);
    expect(style.fontFamily).toBe("Anime Ace");
  });

  it("color has no per-language override — only preset or base", () => {
    const p = preset({ id: "p1", text: { color: "#ff0000" } });
    const bubble = { ...base, presetId: "p1" };
    expect(resolveBubbleStyle(bubble, "de", [p]).color).toBe("#ff0000");
    expect(resolveBubbleStyle(base, "de").color).toBe("#000000");
  });

  it("balloonAwareWrap is undefined by default and can differ per language", () => {
    const bubble = { ...base, balloonAwareWrap: true, balloonAwareWrapOverride: { de: false } };
    expect(resolveBubbleStyle(base, "de").balloonAwareWrap).toBeUndefined();
    expect(resolveBubbleStyle(bubble, "ja").balloonAwareWrap).toBe(true); // no override for ja -> base value
    expect(resolveBubbleStyle(bubble, "de").balloonAwareWrap).toBe(false); // de override wins over the base value
  });

  it("a preset's balloonAwareWrap wins over the base value but not a per-language override", () => {
    const p = preset({ id: "p1", text: { balloonAwareWrap: true } });
    const bubble = { ...base, presetId: "p1", balloonAwareWrapOverride: { de: false } };
    expect(resolveBubbleStyle({ ...base, presetId: "p1" }, "ja", [p]).balloonAwareWrap).toBe(true);
    expect(resolveBubbleStyle(bubble, "de", [p]).balloonAwareWrap).toBe(false);
  });
});

describe("resolveBubbleForm", () => {
  const base = createBubble({ id: "b1", x: 10, y: 20, width: 100, height: 50, bubbleStyle: "speech" });

  it("returns the bubble's own geometry/background with no override/preset", () => {
    const form = resolveBubbleForm(base, "de");
    expect(form).toMatchObject({ x: 10, y: 20, width: 100, height: 50, bubbleStyle: "speech" });
  });

  it("a formOverride replaces the entire bundle and wins over any preset", () => {
    const p = preset({ id: "p1", background: { bubbleStyle: "thought" } });
    const overrideForm = resolveBubbleForm(
      { ...base, presetId: "p1", formOverride: { de: { ...base, x: 999, y: 999, bubbleStyle: "shout" } } },
      "de",
      [p]
    );
    expect(overrideForm.x).toBe(999);
    expect(overrideForm.bubbleStyle).toBe("shout");
  });

  it("without a formOverride, geometry stays the bubble's own but bubbleStyle follows the preset", () => {
    const p = preset({ id: "p1", background: { bubbleStyle: "thought" } });
    const form = resolveBubbleForm({ ...base, presetId: "p1" }, "de", [p]);
    expect(form.x).toBe(10);
    expect(form.y).toBe(20);
    expect(form.bubbleStyle).toBe("thought");
  });

  it("geometry/tail fields are never preset-driven even when a preset is linked", () => {
    const p = preset({ id: "p1", background: { bubbleStyle: "thought" } });
    const bubble = { ...base, presetId: "p1", tail: { x: 5, y: 5 }, tailWidth: 77 };
    const form = resolveBubbleForm(bubble, "de", [p]);
    expect(form.tail).toEqual({ x: 5, y: 5 });
    expect(form.tailWidth).toBe(77);
  });
});

describe("resolveCurvedTextStyle", () => {
  const el = createCurvedTextElement({ id: "c1", points: [{ x: 0, y: 0 }, { x: 1, y: 1 }, { x: 2, y: 2 }, { x: 3, y: 3 }] });

  it("falls back to the element's own base values with no override/preset", () => {
    expect(resolveCurvedTextStyle(el, "de").fontFamily).toBe("Anime Ace");
  });

  it("preset-defined field overrides base, per-language override wins over both", () => {
    const p = preset({ id: "p1", text: { fontFamily: "SFX Font" } });
    expect(resolveCurvedTextStyle({ ...el, presetId: "p1" }, "de", [p]).fontFamily).toBe("SFX Font");
    expect(
      resolveCurvedTextStyle({ ...el, presetId: "p1", fontFamilyOverride: { de: "Override" } }, "de", [p]).fontFamily
    ).toBe("Override");
  });
});

describe("imageFileForLanguage", () => {
  const element = createImageElement({
    id: "i1",
    corners: boxCorners(0, 0, 10, 10),
    files: { de: "de.png", jp: "jp.png" },
  });

  it("returns the file for the requested language when present", () => {
    expect(imageFileForLanguage(element, "de")).toBe("de.png");
  });

  it("falls back to any other assigned file so the element never goes blank", () => {
    expect(imageFileForLanguage(element, "en")).toBe("de.png");
  });

  it("returns undefined when no language has a file at all", () => {
    const empty = createImageElement({ id: "i2", corners: boxCorners(0, 0, 10, 10), files: {} });
    expect(imageFileForLanguage(empty, "de")).toBeUndefined();
  });
});

describe("panelDisplayLabel", () => {
  it("uses the custom label when set", () => {
    const panel = createPanel({ id: "p1", points: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }], label: "Splash" });
    expect(panelDisplayLabel(panel, 3)).toBe("Splash");
  });

  it("falls back to auto-numbered 'Panel N' (1-based) when the label is empty/whitespace", () => {
    const panel = createPanel({ id: "p1", points: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }], label: "   " });
    expect(panelDisplayLabel(panel, 0)).toBe("Panel 1");
    expect(panelDisplayLabel(panel, 4)).toBe("Panel 5");
  });
});

describe("polygonBounds", () => {
  it("computes the axis-aligned bounding box of a polygon", () => {
    expect(polygonBounds([{ x: -5, y: 10 }, { x: 20, y: -3 }, { x: 0, y: 0 }])).toEqual({
      minX: -5,
      minY: -3,
      maxX: 20,
      maxY: 10,
    });
  });
});

describe("boxCorners", () => {
  it("returns TL/TR/BR/BL in that order", () => {
    expect(boxCorners(10, 20, 100, 50)).toEqual([
      { x: 10, y: 20 },
      { x: 110, y: 20 },
      { x: 110, y: 70 },
      { x: 10, y: 70 },
    ]);
  });
});

describe("createBubble", () => {
  it("fills in every default field for a minimal rect bubble", () => {
    const bubble = createBubble({ id: "b1", x: 0, y: 0, width: 10, height: 10 });
    expect(bubble.shape).toBe("rect");
    expect(bubble.bubbleStyle).toBe("none");
    expect(bubble.presetId).toBeNull();
    expect(bubble.corners).toBeUndefined();
  });

  it("auto-derives corners for a quad bubble from x/y/width/height", () => {
    const bubble = createBubble({ id: "b1", x: 0, y: 0, width: 10, height: 20, shape: "quad" });
    expect(bubble.corners).toEqual(boxCorners(0, 0, 10, 20));
  });
});

describe("Panel.cut field", () => {
  it("is undefined for a plain (non-cut) panel and omitted from JSON", () => {
    const panel = createPanel({ id: "p1", points: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }] });
    expect(panel.cut).toBeUndefined();
    expect(JSON.parse(JSON.stringify(panel))).not.toHaveProperty("cut");
  });

  it("round-trips a Cut-Panel's cutOrigin/holeFill", () => {
    const panel = createPanel({
      id: "p1",
      points: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }],
      cut: { cutOrigin: { x: 0, y: 0 }, holeFill: { mode: "auto", color: "#abcdef" } },
    });
    expect(panel.cut).toEqual({ cutOrigin: { x: 0, y: 0 }, holeFill: { mode: "auto", color: "#abcdef" } });
    expect(JSON.parse(JSON.stringify(panel))).toHaveProperty("cut.holeFill.color", "#abcdef");
  });

  it("cut.removed is undefined by default and omitted from JSON, round-trips true", () => {
    const panel = createPanel({
      id: "p1",
      points: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }],
      cut: { cutOrigin: { x: 0, y: 0 }, holeFill: { mode: "auto", color: "#abcdef" } },
    });
    expect(panel.cut!.removed).toBeUndefined();
    expect(JSON.parse(JSON.stringify(panel)).cut).not.toHaveProperty("removed");

    const removedPanel = createPanel({
      id: "p2",
      points: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }],
      cut: { cutOrigin: { x: 0, y: 0 }, holeFill: { mode: "auto", color: "#abcdef" }, removed: true },
    });
    expect(removedPanel.cut!.removed).toBe(true);
    expect(JSON.parse(JSON.stringify(removedPanel))).toHaveProperty("cut.removed", true);
  });

  it("round-trips cut.replacement's files/border, omitted when absent", () => {
    const plain = createPanel({
      id: "p1",
      points: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }],
      cut: { cutOrigin: { x: 0, y: 0 }, holeFill: { mode: "auto", color: "#abcdef" } },
    });
    expect(plain.cut!.replacement).toBeUndefined();

    const replaced = createPanel({
      id: "p2",
      points: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }],
      cut: {
        cutOrigin: { x: 0, y: 0 },
        holeFill: { mode: "auto", color: "#abcdef" },
        replacement: { files: { de: "poster_de.png", ja: "poster_ja.png" }, border: { color: "#000000", widthPx: 4 }, fit: "stretch" },
      },
    });
    expect(replaced.cut!.replacement).toEqual({
      files: { de: "poster_de.png", ja: "poster_ja.png" },
      border: { color: "#000000", widthPx: 4 },
      fit: "stretch",
    });
    expect(JSON.parse(JSON.stringify(replaced))).toHaveProperty("cut.replacement.files.ja", "poster_ja.png");
  });
});

describe("cutPanelReplacementFileForLanguage", () => {
  function panelWithReplacementFiles(files: Record<string, string>) {
    return createPanel({
      id: "p1",
      points: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }],
      cut: { cutOrigin: { x: 0, y: 0 }, holeFill: { mode: "auto", color: "#fff" }, replacement: { files, fit: "stretch" } },
    });
  }

  it("returns undefined when there's no cut/replacement/files at all", () => {
    const plain = createPanel({ id: "p1", points: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }] });
    expect(cutPanelReplacementFileForLanguage(plain.cut, "de")).toBeUndefined();
    expect(cutPanelReplacementFileForLanguage(panelWithReplacementFiles({}).cut, "de")).toBeUndefined();
  });

  it("returns the file for the requested language when present", () => {
    const panel = panelWithReplacementFiles({ de: "de.png", ja: "ja.png" });
    expect(cutPanelReplacementFileForLanguage(panel.cut, "de")).toBe("de.png");
  });

  it("falls back to any other assigned language's file, same convention as imageFileForLanguage", () => {
    const panel = panelWithReplacementFiles({ ja: "ja.png" });
    expect(cutPanelReplacementFileForLanguage(panel.cut, "de")).toBe("ja.png");
  });
});

describe("resolvePanelForLanguage", () => {
  it("falls back to the base points/origin/cut when there's no override for the language", () => {
    const panel = createPanel({
      id: "p1",
      points: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }],
      cut: { cutOrigin: { x: 0, y: 0 }, holeFill: { mode: "auto", color: "#fff" } },
    });
    expect(resolvePanelForLanguage(panel, "ja")).toEqual({ points: panel.points, origin: panel.origin, cut: panel.cut });
  });

  it("returns the language override's full bundle (points/origin/cut) when one exists, ignoring the base entirely", () => {
    const panel = createPanel({
      id: "p1",
      points: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }],
      // Base: a plain marker, no cut at all — e.g. the original "ja" behavior.
      languageOverride: {
        de: {
          points: [{ x: 100, y: 100 }, { x: 110, y: 100 }, { x: 110, y: 110 }],
          origin: { x: 100, y: 100 },
          cut: { cutOrigin: { x: 100, y: 100 }, holeFill: { mode: "auto", color: "#000" }, removed: true },
        },
      },
    });
    expect(resolvePanelForLanguage(panel, "de")).toEqual({
      points: [{ x: 100, y: 100 }, { x: 110, y: 100 }, { x: 110, y: 110 }],
      origin: { x: 100, y: 100 },
      cut: { cutOrigin: { x: 100, y: 100 }, holeFill: { mode: "auto", color: "#000" }, removed: true },
    });
    // A language without an override still sees the untouched base — no cut at all.
    expect(resolvePanelForLanguage(panel, "ja").cut).toBeUndefined();
  });

  it("supports a geometry-only override (no cut) — a language can just be repositioned without becoming a Cut-Panel", () => {
    const panel = createPanel({
      id: "p1",
      points: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }],
      languageOverride: {
        fr: { points: [{ x: 5, y: 5 }, { x: 15, y: 5 }, { x: 15, y: 15 }], origin: { x: 5, y: 5 } },
      },
    });
    const resolved = resolvePanelForLanguage(panel, "fr");
    expect(resolved.origin).toEqual({ x: 5, y: 5 });
    expect(resolved.cut).toBeUndefined();
  });
});

describe("locked field", () => {
  it("is undefined (not stored) for a fresh bubble/panel", () => {
    const bubble = createBubble({ id: "b1", x: 0, y: 0, width: 10, height: 10 });
    const panel = createPanel({ id: "p1", points: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }] });
    expect(bubble.locked).toBeUndefined();
    expect(panel.locked).toBeUndefined();
    // JSON.stringify drops undefined-valued keys entirely — never written to disk unless locked.
    expect(JSON.parse(JSON.stringify(bubble))).not.toHaveProperty("locked");
    expect(JSON.parse(JSON.stringify(panel))).not.toHaveProperty("locked");
  });

  it("round-trips true when explicitly locked", () => {
    const bubble = createBubble({ id: "b1", x: 0, y: 0, width: 10, height: 10, locked: true });
    expect(bubble.locked).toBe(true);
    expect(JSON.parse(JSON.stringify(bubble))).toHaveProperty("locked", true);
  });
});

describe("pageLayerOrder / withLayerOrder", () => {
  function layoutWith(bubbles: ReturnType<typeof createBubble>[], images: ReturnType<typeof createImageElement>[], curvedTexts: ReturnType<typeof createCurvedTextElement>[]) {
    return { ...createEmptyLayout("page_01", "page.png", 200, 150), bubbles, images, curvedTexts };
  }

  it("without any layerOrderOverride, defaults to images, then bubbles, then curved texts, each in array order", () => {
    const img1 = createImageElement({ id: "i1", corners: boxCorners(0, 0, 10, 10), files: {} });
    const img2 = createImageElement({ id: "i2", corners: boxCorners(0, 0, 10, 10), files: {} });
    const b1 = createBubble({ id: "b1", x: 0, y: 0, width: 10, height: 10 });
    const b2 = createBubble({ id: "b2", x: 0, y: 0, width: 10, height: 10 });
    const c1 = createCurvedTextElement({ id: "c1", points: [{ x: 0, y: 0 }, { x: 1, y: 1 }, { x: 2, y: 2 }, { x: 3, y: 3 }] });

    const order = pageLayerOrder(layoutWith([b1, b2], [img1, img2], [c1]));

    expect(order).toEqual([
      { type: "image", id: "i1" },
      { type: "image", id: "i2" },
      { type: "bubble", id: "b1" },
      { type: "bubble", id: "b2" },
      { type: "curvedText", id: "c1" },
    ]);
  });

  it("an element with layerOrderOverride is ranked by that value among everything else", () => {
    const img1 = createImageElement({ id: "i1", corners: boxCorners(0, 0, 10, 10), files: {} });
    const b1 = createBubble({ id: "b1", x: 0, y: 0, width: 10, height: 10 });
    // Force the image (normally rank 0, default-tier-first) above the bubble (default
    // rank 1) by giving it a higher override — mirrors "bring an image in front of a
    // bubble" (the motivating use case for this whole feature).
    const layout = layoutWith([b1], [{ ...img1, layerOrderOverride: 10 }], []);

    expect(pageLayerOrder(layout)).toEqual([
      { type: "bubble", id: "b1" },
      { type: "image", id: "i1" },
    ]);
  });

  it("withLayerOrder followed by pageLayerOrder round-trips the given order exactly", () => {
    const img1 = createImageElement({ id: "i1", corners: boxCorners(0, 0, 10, 10), files: {} });
    const b1 = createBubble({ id: "b1", x: 0, y: 0, width: 10, height: 10 });
    const c1 = createCurvedTextElement({ id: "c1", points: [{ x: 0, y: 0 }, { x: 1, y: 1 }, { x: 2, y: 2 }, { x: 3, y: 3 }] });
    const layout = layoutWith([b1], [img1], [c1]);

    const desiredOrder = [
      { type: "curvedText" as const, id: "c1" },
      { type: "image" as const, id: "i1" },
      { type: "bubble" as const, id: "b1" },
    ];
    const reordered = withLayerOrder(layout, desiredOrder);

    expect(pageLayerOrder(reordered)).toEqual(desiredOrder);
    expect(reordered.curvedTexts[0].layerOrderOverride).toBe(0);
    expect(reordered.images[0].layerOrderOverride).toBe(1);
    expect(reordered.bubbles[0].layerOrderOverride).toBe(2);
  });
});

describe("createEmptyLayout", () => {
  it("produces an empty page layout with no bubbles/images/curvedTexts/panels", () => {
    const layout = createEmptyLayout("page_01", "page_01.png", 800, 1200);
    expect(layout).toEqual({
      page: "page_01",
      sourceImage: "page_01.png",
      imageWidth: 800,
      imageHeight: 1200,
      bubbles: [],
      images: [],
      curvedTexts: [],
      panels: [],
      schemaVersion: 2,
    });
  });
});
