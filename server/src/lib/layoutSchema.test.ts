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
    });
  });
});
