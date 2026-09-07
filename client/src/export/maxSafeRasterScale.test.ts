import { describe, expect, it } from "vitest";
import { MAX_CANVAS_AREA_PX, MAX_CANVAS_DIMENSION_PX, maxSafeRasterScale } from "./renderPageToPng";

describe("maxSafeRasterScale", () => {
  it("allows full requested resolution for a normal comic page well under either limit", () => {
    expect(maxSafeRasterScale(2000, 3000)).toBeGreaterThanOrEqual(3);
  });

  it("caps a realistic webtoon strip's scale so neither dimension nor area exceeds the limits", () => {
    const width = 800;
    const height = 20_000;
    const scale = maxSafeRasterScale(width, height);
    expect(width * scale).toBeLessThanOrEqual(MAX_CANVAS_DIMENSION_PX + 1e-6);
    expect(height * scale).toBeLessThanOrEqual(MAX_CANVAS_DIMENSION_PX + 1e-6);
    expect(width * height * scale * scale).toBeLessThanOrEqual(MAX_CANVAS_AREA_PX + 1e-6);
    // The height side is the binding constraint here (20,000px tall vs 800px wide) —
    // scale should land at roughly MAX_CANVAS_DIMENSION_PX / height.
    expect(scale).toBeCloseTo(MAX_CANVAS_DIMENSION_PX / height, 5);
  });

  it("is limited by total area, not just either single side, for a page that's large on both axes", () => {
    const width = 11_000;
    const height = 11_000;
    const scale = maxSafeRasterScale(width, height);
    // Both sides individually stay well under MAX_CANVAS_DIMENSION_PX even at scale 1 —
    // the per-side limit alone would allow >1x here — so the area limit must be the one
    // actually doing the clamping.
    expect(width * scale).toBeLessThan(MAX_CANVAS_DIMENSION_PX);
    expect(scale).toBeLessThan(1);
    expect(width * height * scale * scale).toBeCloseTo(MAX_CANVAS_AREA_PX, -2);
  });

  it("returns 1 for degenerate (non-positive) dimensions instead of dividing by zero/negative", () => {
    expect(maxSafeRasterScale(0, 100)).toBe(1);
    expect(maxSafeRasterScale(100, 0)).toBe(1);
    expect(maxSafeRasterScale(-5, 100)).toBe(1);
  });
});
