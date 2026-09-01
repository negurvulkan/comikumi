import { describe, it, expect } from "vitest";
import { createBubble, createPanel } from "../../../shared/src/layoutSchema";
import { boundsOf } from "./CanvasMinimap";

describe("boundsOf", () => {
  it("uses the bubble's own x/y directly when it has no parent panel", () => {
    const bubble = createBubble({ id: "b1", x: 50, y: 60, width: 20, height: 10 });
    expect(boundsOf(bubble, [])).toEqual({ minX: 50, minY: 60, maxX: 70, maxY: 70 });
  });

  it("shifts by the parent panel's origin for a panel-child bubble (regression: minimap previously ignored this, unlike the main canvas)", () => {
    const panel = createPanel({
      id: "p1",
      points: [
        { x: 200, y: 300 },
        { x: 400, y: 300 },
        { x: 400, y: 500 },
        { x: 200, y: 500 },
      ],
      origin: { x: 200, y: 300 },
    });
    // Panel-relative coordinates — same convention server/client renderers already use.
    const bubble = createBubble({ id: "b1", x: 10, y: 20, width: 30, height: 15, panelId: "p1" });
    expect(boundsOf(bubble, [panel])).toEqual({ minX: 210, minY: 320, maxX: 240, maxY: 335 });
  });

  it("ignores a stale/unassigned panelId (treats it as an origin-less, already-absolute bubble)", () => {
    const bubble = createBubble({ id: "b1", x: 10, y: 20, width: 30, height: 15, panelId: "does-not-exist" });
    expect(boundsOf(bubble, [])).toEqual({ minX: 10, minY: 20, maxX: 40, maxY: 35 });
  });

  it("shifts a quad bubble's corners by the parent panel's origin too", () => {
    const panel = createPanel({
      id: "p1",
      points: [
        { x: 100, y: 100 },
        { x: 300, y: 100 },
        { x: 300, y: 300 },
        { x: 100, y: 300 },
      ],
      origin: { x: 100, y: 100 },
    });
    const bubble = createBubble({
      id: "b1",
      x: 0,
      y: 0,
      width: 1,
      height: 1,
      shape: "quad",
      panelId: "p1",
      corners: [
        { x: 5, y: 5 },
        { x: 25, y: 5 },
        { x: 25, y: 25 },
        { x: 5, y: 25 },
      ],
    });
    expect(boundsOf(bubble, [panel])).toEqual({ minX: 105, minY: 105, maxX: 125, maxY: 125 });
  });
});
