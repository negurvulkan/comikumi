import { describe, it, expect } from "vitest";
import { ProjectFileSchema } from "../../../shared/src/project.js";
import { ProjectSettingsSchema } from "../../../shared/src/settings.js";
import { LanguageDefSchema, DEFAULT_LANGUAGES } from "../../../shared/src/languages.js";
import { PanelSchema } from "../../../shared/src/layoutSchema.js";

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
      exportFolderTemplate: "{book}_{folderSuffix}",
      description: "",
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
