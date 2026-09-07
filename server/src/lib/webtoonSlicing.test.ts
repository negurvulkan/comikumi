import { describe, expect, it } from "vitest";
import { createBubble, createEmptyLayout, createPanel } from "../../../shared/src/layoutSchema.js";
import {
  collectPreferredCuts,
  collectSliceObstacles,
  computeSliceCuts,
  parseSliceFileName,
  sliceFileName,
  type Interval,
} from "../../../shared/src/webtoonSlicing.js";

describe("computeSliceCuts", () => {
  it("cuts evenly with no obstacles, none exceeding maxHeight", () => {
    const plan = computeSliceCuts({ imageHeight: 10000, maxHeight: 1000, minHeight: 200, obstacles: [], preferredCuts: [] });
    for (const s of plan.slices) expect(s.height).toBeLessThanOrEqual(1000 + 1e-6);
    expect(plan.warnings).toEqual([]);
    // Segment heights sum to exactly imageHeight, no gap/overlap.
    const total = plan.slices.reduce((sum, s) => sum + s.height, 0);
    expect(total).toBeCloseTo(10000, 5);
  });

  it("shifts a cut away from a bubble that would otherwise sit right on the ideal cut point", () => {
    const obstacle: Interval = { minY: 980, maxY: 1050 };
    const plan = computeSliceCuts({ imageHeight: 10000, maxHeight: 1000, minHeight: 200, obstacles: [obstacle], preferredCuts: [] });
    const firstCutY = plan.slices[0].height;
    expect(firstCutY).toBeLessThan(obstacle.minY);
    expect(plan.warnings).toEqual([]);
  });

  it("snaps to a panel-gap preferred cut inside the search window", () => {
    const plan = computeSliceCuts({ imageHeight: 10000, maxHeight: 1000, minHeight: 200, obstacles: [], preferredCuts: [900] });
    expect(plan.slices[0].height).toBe(900);
  });

  it("cuts through an unavoidable obstacle anyway and records a warning rather than failing", () => {
    // An obstacle spanning the entire search window around the first ideal cut point.
    const obstacle: Interval = { minY: 0, maxY: 10000 };
    const plan = computeSliceCuts({ imageHeight: 10000, maxHeight: 1000, minHeight: 200, obstacles: [obstacle], preferredCuts: [] });
    expect(plan.warnings.length).toBeGreaterThan(0);
    expect(plan.warnings[0].reason).toBe("crosses_obstacle");
    // Still produced a full, non-empty plan covering the whole page.
    const total = plan.slices.reduce((sum, s) => sum + s.height, 0);
    expect(total).toBeCloseTo(10000, 5);
  });

  it("merges a too-short trailing remainder into the previous segment instead of leaving a sliver", () => {
    const plan = computeSliceCuts({ imageHeight: 2050, maxHeight: 1000, minHeight: 200, obstacles: [], preferredCuts: [] });
    // Without merging this would be [1000, 1000, 50] — the trailing 50 < minHeight(200).
    expect(plan.slices.length).toBe(2);
    expect(plan.slices[plan.slices.length - 1].height).toBeGreaterThanOrEqual(200);
    const total = plan.slices.reduce((sum, s) => sum + s.height, 0);
    expect(total).toBeCloseTo(2050, 5);
  });

  it("never overlaps or gaps regardless of obstacles/preferred cuts", () => {
    const plan = computeSliceCuts({
      imageHeight: 5000,
      maxHeight: 800,
      minHeight: 150,
      obstacles: [
        { minY: 750, maxY: 820 },
        { minY: 1550, maxY: 1600 },
      ],
      preferredCuts: [2400],
    });
    let y = 0;
    for (const s of plan.slices) {
      expect(s.y).toBeCloseTo(y, 5);
      y += s.height;
    }
    expect(y).toBeCloseTo(5000, 5);
  });
});

describe("collectSliceObstacles", () => {
  it("includes a bubble with text as an obstacle, panel-origin applied", () => {
    const layout = createEmptyLayout("page_01", "page_01.png", 800, 4000);
    const panel = createPanel({
      id: "p1",
      points: [
        { x: 0, y: 1000 },
        { x: 800, y: 1000 },
        { x: 800, y: 2000 },
        { x: 0, y: 2000 },
      ],
    });
    const bubble = createBubble({ id: "b1", x: 10, y: 10, width: 100, height: 50, panelId: "p1" });
    bubble.text = { de: "Hallo" };
    layout.panels = [panel];
    layout.bubbles = [bubble];
    const obstacles = collectSliceObstacles(layout, "de");
    expect(obstacles).toHaveLength(1);
    // Panel origin is its bounding-box top-left (1000 in y) + bubble's own relative y (10).
    expect(obstacles[0].minY).toBeCloseTo(1010, 5);
    expect(obstacles[0].maxY).toBeCloseTo(1060, 5);
  });

  it("excludes a bubble with no visible background and no text for the requested language", () => {
    const layout = createEmptyLayout("page_01", "page_01.png", 800, 4000);
    const bubble = createBubble({ id: "b1", x: 10, y: 10, width: 100, height: 50 });
    layout.bubbles = [bubble];
    expect(collectSliceObstacles(layout, "de")).toEqual([]);
  });
});

describe("collectPreferredCuts", () => {
  it("returns the midpoint of the gap between two vertically stacked panels", () => {
    const layout = createEmptyLayout("page_01", "page_01.png", 800, 4000);
    const panelA = createPanel({
      id: "a",
      points: [
        { x: 0, y: 0 },
        { x: 800, y: 0 },
        { x: 800, y: 1000 },
        { x: 0, y: 1000 },
      ],
    });
    const panelB = createPanel({
      id: "b",
      points: [
        { x: 0, y: 1100 },
        { x: 800, y: 1100 },
        { x: 800, y: 2000 },
        { x: 0, y: 2000 },
      ],
    });
    layout.panels = [panelA, panelB];
    expect(collectPreferredCuts(layout, "de")).toEqual([1050]);
  });

  it("ignores overlapping/touching panels (no real gap)", () => {
    const layout = createEmptyLayout("page_01", "page_01.png", 800, 4000);
    const panelA = createPanel({
      id: "a",
      points: [
        { x: 0, y: 0 },
        { x: 800, y: 0 },
        { x: 800, y: 1000 },
        { x: 0, y: 1000 },
      ],
    });
    const panelB = createPanel({
      id: "b",
      points: [
        { x: 0, y: 900 },
        { x: 800, y: 900 },
        { x: 800, y: 2000 },
        { x: 0, y: 2000 },
      ],
    });
    layout.panels = [panelA, panelB];
    expect(collectPreferredCuts(layout, "de")).toEqual([]);
  });
});

describe("sliceFileName / parseSliceFileName", () => {
  it("round-trips a page id and index through the naming convention", () => {
    expect(sliceFileName("page_01", 0)).toBe("page_01_s01");
    expect(sliceFileName("page_01", 11)).toBe("page_01_s12");
    expect(parseSliceFileName("page_01_s01")).toEqual({ pageId: "page_01", index: 0 });
    expect(parseSliceFileName("page_01_s12")).toEqual({ pageId: "page_01", index: 11 });
  });

  it("returns null for a plain, unsliced page name", () => {
    expect(parseSliceFileName("page_01")).toBeNull();
  });
});
