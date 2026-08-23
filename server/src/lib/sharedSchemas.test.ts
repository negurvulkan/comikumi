import { describe, it, expect } from "vitest";
import { ProjectFileSchema } from "../../../shared/src/project.js";
import { ProjectSettingsSchema } from "../../../shared/src/settings.js";
import { LanguageDefSchema, DEFAULT_LANGUAGES } from "../../../shared/src/languages.js";
import type { Bubble } from "../../../shared/src/layoutSchema.js";
import { PanelSchema, PageLayoutSchema, createPanel, offsetBubble, originFromPoints } from "../../../shared/src/layoutSchema.js";

describe("ProjectSettingsSchema", () => {
  it("requires a non-empty scanRoot", () => {
    expect(ProjectSettingsSchema.safeParse({ scanRoot: "" }).success).toBe(false);
    expect(ProjectSettingsSchema.safeParse({ scanRoot: "C:\\Projekte\\Comic" }).success).toBe(true);
  });

  it("fills in defaults for everything except scanRoot", () => {
    const parsed = ProjectSettingsSchema.parse({ scanRoot: "C:\\Projekte\\Comic" });
    expect(parsed).toEqual({
      scanRoot: "C:\\Projekte\\Comic",
      assetsDir: "",
      thumbnailsDir: "",
      emptySuffix: "_empty",
      letteringSuffix: "_lettering",
      scriptSuffix: "_script",
      exportFolderTemplate: "{book}_{folderSuffix}",
      description: "",
      coverImagePath: "",
      autosaveEnabled: false,
      autosaveIntervalSeconds: 30,
      readingDirection: "rtl",
    });
  });
});

describe("ProjectFileSchema", () => {
  it("requires name in addition to the settings fields", () => {
    expect(ProjectFileSchema.safeParse({ scanRoot: "C:\\Projekte\\Comic" }).success).toBe(false);
    expect(ProjectFileSchema.safeParse({ scanRoot: "C:\\Projekte\\Comic", name: "Mein Comic" }).success).toBe(true);
  });

  it("defaults languages to DEFAULT_LANGUAGES when omitted", () => {
    const parsed = ProjectFileSchema.parse({ scanRoot: "C:\\Projekte\\Comic", name: "Mein Comic" });
    expect(parsed.languages).toEqual(DEFAULT_LANGUAGES);
  });
});

describe("PanelSchema", () => {
  it("accepts a modern panel with a points polygon", () => {
    const parsed = PanelSchema.parse({ id: "p1", points: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }] });
    expect(parsed.points).toEqual([{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }]);
  });

  it("migrates a legacy x/y/width/height/rotation box into 4 corner points (no rotation)", () => {
    const parsed = PanelSchema.parse({ id: "p1", x: 100, y: 50, width: 200, height: 100, rotation: 0 });
    expect(parsed.points).toEqual([
      { x: 100, y: 50 },
      { x: 300, y: 50 },
      { x: 300, y: 150 },
      { x: 100, y: 150 },
    ]);
    // legacy fields don't survive parsing — the type has no width/height/rotation anymore
    expect(parsed).not.toHaveProperty("width");
    expect(parsed).not.toHaveProperty("rotation");
    // origin backfilled from the migrated polygon's bounding-box top-left
    expect(parsed.origin).toEqual({ x: 100, y: 50 });
  });

  it("migrates a legacy box with rotation by rotating the corners around its center", () => {
    const parsed = PanelSchema.parse({ id: "p1", x: -10, y: -10, width: 20, height: 20, rotation: 90 });
    // A 20x20 box centered on the origin, rotated 90°, has the same 4 corners (up to
    // floating point) as the unrotated box — assert center stays put and corners are
    // still all at distance ~14.14 (sqrt(200)) from the origin.
    for (const p of parsed.points) {
      expect(Math.hypot(p.x, p.y)).toBeCloseTo(Math.sqrt(200), 5);
    }
  });

  it("backfills origin for a points-format panel saved before origin existed", () => {
    const parsed = PanelSchema.parse({ id: "p1", points: [{ x: 5, y: 5 }, { x: 25, y: 5 }, { x: 25, y: 25 }, { x: 5, y: 25 }] });
    expect(parsed.origin).toEqual({ x: 5, y: 5 });
  });

  it("leaves an explicit origin untouched", () => {
    const parsed = PanelSchema.parse({
      id: "p1",
      points: [{ x: 5, y: 5 }, { x: 25, y: 5 }, { x: 25, y: 25 }],
      origin: { x: 1, y: 2 },
    });
    expect(parsed.origin).toEqual({ x: 1, y: 2 });
  });
});

describe("originFromPoints", () => {
  it("returns the bounding-box top-left of an irregular polygon", () => {
    expect(originFromPoints([{ x: 10, y: 40 }, { x: 30, y: 5 }, { x: 50, y: 20 }])).toEqual({ x: 10, y: 5 });
  });
});

describe("createPanel", () => {
  it("derives origin from the given points", () => {
    const panel = createPanel({ id: "p1", points: [{ x: 20, y: 30 }, { x: 60, y: 30 }, { x: 60, y: 70 }] });
    expect(panel.origin).toEqual({ x: 20, y: 30 });
  });

  it("keeps an explicitly passed origin", () => {
    const panel = createPanel({ id: "p1", points: [{ x: 20, y: 30 }, { x: 60, y: 30 }, { x: 60, y: 70 }], origin: { x: 0, y: 0 } });
    expect(panel.origin).toEqual({ x: 0, y: 0 });
  });
});

describe("offsetBubble", () => {
  // Raw fixtures, not full Bubble objects — offsetBubble only ever reads/writes
  // x/y/corners/formOverride[*].x/y, and is also called on not-yet-validated raw JSON
  // by the PageLayoutSchema migration below, so a loosely-typed fixture here matches how
  // it's actually used.
  const bubble = {
    x: 10,
    y: 20,
    corners: [{ x: 10, y: 20 }, { x: 30, y: 20 }],
    formOverride: { de: { x: 5, y: 5, width: 10, height: 10 } },
  } as unknown as Bubble;

  it("shifts x/y, corners, and per-language formOverride x/y by the same delta", () => {
    const shifted = offsetBubble(bubble, -3, -4);
    expect(shifted.x).toBe(7);
    expect(shifted.y).toBe(16);
    expect(shifted.corners).toEqual([{ x: 7, y: 16 }, { x: 27, y: 16 }]);
    expect(shifted.formOverride!.de.x).toBe(2);
    expect(shifted.formOverride!.de.y).toBe(1);
  });

  it("leaves corners/formOverride alone when absent", () => {
    const bare = { x: 0, y: 0, corners: undefined, formOverride: undefined } as unknown as Bubble;
    const shifted = offsetBubble(bare, 5, 5);
    expect(shifted).toEqual({ x: 5, y: 5, corners: undefined, formOverride: undefined });
  });
});

describe("PageLayoutSchema migration (schemaVersion 1 -> 2)", () => {
  function baseLayout(overrides: Record<string, unknown> = {}) {
    return {
      page: "page_01",
      sourceImage: "page_01.png",
      imageWidth: 100,
      imageHeight: 100,
      panels: [{ id: "panel1", points: [{ x: 20, y: 30 }, { x: 120, y: 30 }, { x: 120, y: 130 }, { x: 20, y: 130 }] }],
      bubbles: [],
      ...overrides,
    };
  }

  it("converts an absolute bubble with a valid panelId to panel-relative coordinates", () => {
    const parsed = PageLayoutSchema.parse(
      baseLayout({
        bubbles: [{ id: "b1", shape: "rect", x: 30, y: 40, width: 10, height: 10, panelId: "panel1" }],
      })
    );
    expect(parsed.schemaVersion).toBe(2);
    // panel origin is (20,30) — the absolute (30,40) becomes relative (10,10)
    expect(parsed.bubbles[0].x).toBe(10);
    expect(parsed.bubbles[0].y).toBe(10);
  });

  it("shifts quad corners and formOverride x/y together with the bubble", () => {
    const parsed = PageLayoutSchema.parse(
      baseLayout({
        bubbles: [
          {
            id: "b1",
            shape: "quad",
            x: 30,
            y: 40,
            width: 10,
            height: 10,
            panelId: "panel1",
            corners: [{ x: 30, y: 40 }, { x: 40, y: 40 }, { x: 40, y: 50 }, { x: 30, y: 50 }],
            formOverride: { de: { x: 30, y: 40, width: 10, height: 10 } },
          },
        ],
      })
    );
    const b = parsed.bubbles[0];
    expect(b.corners).toEqual([{ x: 10, y: 10 }, { x: 20, y: 10 }, { x: 20, y: 20 }, { x: 10, y: 20 }]);
    expect(b.formOverride!.de.x).toBe(10);
    expect(b.formOverride!.de.y).toBe(10);
  });

  it("leaves an unassigned or stale-panelId bubble's coordinates untouched", () => {
    const parsed = PageLayoutSchema.parse(
      baseLayout({
        bubbles: [
          { id: "b1", shape: "rect", x: 30, y: 40, width: 10, height: 10, panelId: null },
          { id: "b2", shape: "rect", x: 30, y: 40, width: 10, height: 10, panelId: "does-not-exist" },
        ],
      })
    );
    expect(parsed.bubbles[0]).toMatchObject({ x: 30, y: 40 });
    expect(parsed.bubbles[1]).toMatchObject({ x: 30, y: 40 });
    expect(parsed.schemaVersion).toBe(2);
  });

  it("is a no-op when schemaVersion is already 2", () => {
    const parsed = PageLayoutSchema.parse(
      baseLayout({
        schemaVersion: 2,
        bubbles: [{ id: "b1", shape: "rect", x: 10, y: 10, width: 10, height: 10, panelId: "panel1" }],
      })
    );
    // Already schemaVersion 2 — treated as already panel-relative, left untouched.
    expect(parsed.bubbles[0].x).toBe(10);
    expect(parsed.bubbles[0].y).toBe(10);
  });
});

describe("LanguageDefSchema", () => {
  it("accepts a well-formed language definition", () => {
    expect(LanguageDefSchema.safeParse({ code: "fr", label: "Français", folderSuffix: "french" }).success).toBe(true);
  });

  it("rejects codes/folderSuffix with characters outside [a-zA-Z0-9_-]", () => {
    expect(LanguageDefSchema.safeParse({ code: "f r", label: "X", folderSuffix: "x" }).success).toBe(false);
    expect(LanguageDefSchema.safeParse({ code: "fr", label: "X", folderSuffix: "fr/en" }).success).toBe(false);
  });
});
