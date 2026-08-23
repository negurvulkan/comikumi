import { describe, it, expect } from "vitest";
import { createPanel } from "../../../shared/src/layoutSchema";
import { cutPanelDelta, cutPanelSourcePolygon } from "./cutPanel";

function cutPanel(points: { x: number; y: number }[], cutOriginOffset = { x: 0, y: 0 }) {
  const panel = createPanel({ id: "p1", points });
  return {
    ...panel,
    cut: {
      cutOrigin: { x: panel.origin.x + cutOriginOffset.x, y: panel.origin.y + cutOriginOffset.y },
      holeFill: { mode: "auto" as const, color: "#ffffff" },
    },
  };
}

describe("cutPanelDelta", () => {
  it("is (0,0) for a panel that has never moved since it was cut", () => {
    const panel = cutPanel([{ x: 10, y: 10 }, { x: 20, y: 10 }, { x: 20, y: 20 }]);
    expect(cutPanelDelta(panel)).toEqual({ x: 0, y: 0 });
  });

  it("reflects the panel's current origin minus its frozen cutOrigin", () => {
    const panel = cutPanel([{ x: 10, y: 10 }, { x: 20, y: 10 }, { x: 20, y: 20 }], { x: -5, y: -8 });
    // origin is (10,10) (bounding-box top-left); cutOrigin was recorded as (5,2).
    expect(cutPanelDelta(panel)).toEqual({ x: 5, y: 8 });
  });
});

describe("cutPanelSourcePolygon", () => {
  it("stays the same when the whole panel is translated rigidly", () => {
    const panel = cutPanel([{ x: 10, y: 10 }, { x: 20, y: 10 }, { x: 20, y: 20 }]);
    const before = cutPanelSourcePolygon(panel);
    // Whole-panel translate: points and origin shift together by the same delta.
    const moved = { ...panel, points: panel.points.map((p) => ({ x: p.x + 50, y: p.y + 30 })), origin: { x: panel.origin.x + 50, y: panel.origin.y + 30 } };
    expect(cutPanelSourcePolygon(moved)).toEqual(before);
  });

  it("changes to match a vertex-only reshape (origin untouched)", () => {
    const panel = cutPanel([{ x: 10, y: 10 }, { x: 20, y: 10 }, { x: 20, y: 20 }]);
    const reshaped = { ...panel, points: [{ x: 10, y: 10 }, { x: 25, y: 10 }, { x: 20, y: 20 }] }; // origin unchanged
    expect(cutPanelSourcePolygon(reshaped)).toEqual(reshaped.points);
  });

  it("maps back to original-image space correctly after a move", () => {
    const panel = cutPanel([{ x: 10, y: 10 }, { x: 20, y: 10 }, { x: 20, y: 20 }], { x: -100, y: -200 });
    // cutOrigin recorded at (10-100, 10-200) = (-90,-190); current origin is (10,10);
    // delta = (100,200), so the source polygon = points - delta.
    expect(cutPanelSourcePolygon(panel)).toEqual([{ x: -90, y: -190 }, { x: -80, y: -190 }, { x: -80, y: -180 }]);
  });
});
