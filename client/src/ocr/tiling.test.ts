import { describe, expect, it } from "vitest";
import { computeDetectionBands, mergeBandBoxes } from "./tiling";
import type { Box } from "./detection";

function box(x: number, y: number, width: number, height: number, confidence = 1): Box {
  return { x, y, width, height, confidence };
}

describe("computeDetectionBands", () => {
  it("returns a single band covering the whole page when it already fits one band's height", () => {
    const bands = computeDetectionBands(800, 900, 1024);
    expect(bands).toEqual([{ x: 0, y: 0, width: 800, height: 900 }]);
  });

  it("splits a tall webtoon strip into multiple overlapping, full-width bands", () => {
    const bands = computeDetectionBands(800, 20000, 1024, 0.15);
    expect(bands.length).toBeGreaterThan(1);
    for (const b of bands) {
      expect(b.x).toBe(0);
      expect(b.width).toBe(800);
      expect(b.height).toBeGreaterThan(0);
      expect(b.y + b.height).toBeLessThanOrEqual(20000);
    }
    // The very last band's bottom edge reaches exactly the page bottom — nothing left uncovered.
    const last = bands[bands.length - 1];
    expect(last.y + last.height).toBe(20000);
    // Consecutive bands actually overlap (next band starts before the previous one ends).
    for (let i = 1; i < bands.length; i++) {
      expect(bands[i].y).toBeLessThan(bands[i - 1].y + bands[i - 1].height);
    }
  });

  it("uses at least targetSize as the band height for a narrow page, not just imageWidth", () => {
    const bands = computeDetectionBands(200, 20000, 1024);
    // bandHeight = max(imageWidth, targetSize) = max(200, 1024) = 1024, not 200 — a
    // narrow page shouldn't produce absurdly many tiny bands.
    expect(bands[0].height).toBe(1024);
  });

  it("returns an empty array for degenerate (non-positive) dimensions", () => {
    expect(computeDetectionBands(0, 1000)).toEqual([]);
    expect(computeDetectionBands(800, 0)).toEqual([]);
  });
});

describe("mergeBandBoxes", () => {
  it("shifts each band's boxes into full-page coordinates by that band's own y offset", () => {
    const bands = [
      { x: 0, y: 0, width: 800, height: 1000 },
      { x: 0, y: 900, width: 800, height: 1000 },
    ];
    const boxesPerBand = [[box(10, 10, 100, 40)], [box(10, 10, 100, 40)]];
    const merged = mergeBandBoxes(boxesPerBand, bands);
    expect(merged).toContainEqual(box(10, 10, 100, 40));
    expect(merged).toContainEqual(box(10, 910, 100, 40));
  });

  it("deduplicates the same text detected in both bands' overlap region", () => {
    const bands = [
      { x: 0, y: 0, width: 800, height: 1000 },
      { x: 0, y: 900, width: 800, height: 1000 },
    ];
    // Same real-page location (y=950..990), detected by both bands at their own
    // band-local y (950 in band 0, 50 in band 1) — after shifting these land on top of
    // each other and must collapse to one box.
    const boxesPerBand = [[box(10, 950, 100, 40, 0.9)], [box(10, 50, 100, 40, 0.6)]];
    const merged = mergeBandBoxes(boxesPerBand, bands);
    expect(merged).toHaveLength(1);
    // The higher-confidence copy wins.
    expect(merged[0].confidence).toBe(0.9);
  });

  it("keeps genuinely distinct boxes from different bands", () => {
    const bands = [
      { x: 0, y: 0, width: 800, height: 1000 },
      { x: 0, y: 900, width: 800, height: 1000 },
    ];
    const boxesPerBand = [[box(10, 10, 100, 40)], [box(500, 500, 100, 40)]];
    const merged = mergeBandBoxes(boxesPerBand, bands);
    expect(merged).toHaveLength(2);
  });

  it("tolerates a shorter boxesPerBand array (e.g. a band that produced no detections)", () => {
    const bands = [
      { x: 0, y: 0, width: 800, height: 1000 },
      { x: 0, y: 900, width: 800, height: 1000 },
    ];
    const merged = mergeBandBoxes([[box(10, 10, 100, 40)]], bands);
    expect(merged).toHaveLength(1);
  });
});
