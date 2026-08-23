import { describe, it, expect } from "vitest";
import { createPanel } from "../../../shared/src/layoutSchema";
import { cutPanelDelta, cutPanelSourcePolygon, drawCutPanelContent } from "./cutPanel";

/** Minimal CanvasRenderingContext2D stand-in that only records which calls happened —
 * drawCutPanelContent never reads back geometry, just issues path/fill/clip/drawImage
 * calls, so a call-counting fake is enough to exercise it without jsdom/node-canvas. */
function fakeCtx() {
  const calls: string[] = [];
  return {
    calls,
    save: () => calls.push("save"),
    restore: () => calls.push("restore"),
    beginPath: () => calls.push("beginPath"),
    moveTo: () => calls.push("moveTo"),
    lineTo: () => calls.push("lineTo"),
    closePath: () => calls.push("closePath"),
    fill: () => calls.push("fill"),
    clip: () => calls.push("clip"),
    drawImage: () => calls.push("drawImage"),
    stroke: () => calls.push("stroke"),
    fillStyle: "",
    strokeStyle: "",
    lineWidth: 0,
  } as unknown as CanvasRenderingContext2D & { calls: string[] };
}

function cutPanel(
  points: { x: number; y: number }[],
  cutOriginOffset = { x: 0, y: 0 },
  removed = false,
  replacement?: { files: Record<string, string>; border?: { color: string; widthPx: number } }
) {
  const panel = createPanel({ id: "p1", points });
  return {
    ...panel,
    cut: {
      cutOrigin: { x: panel.origin.x + cutOriginOffset.x, y: panel.origin.y + cutOriginOffset.y },
      holeFill: { mode: "auto" as const, color: "#ffffff" },
      removed: removed || undefined,
      replacement,
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

describe("drawCutPanelContent", () => {
  const image = {} as unknown as CanvasImageSource;

  it("fills the hole AND redraws the content for a normal (non-removed) Cut-Panel", () => {
    const panel = cutPanel([{ x: 10, y: 10 }, { x: 20, y: 10 }, { x: 20, y: 20 }]);
    const ctx = fakeCtx();

    drawCutPanelContent(ctx, panel, image, 100, 100, 1);

    expect(ctx.calls.filter((c) => c === "fill")).toHaveLength(1);
    expect(ctx.calls.filter((c) => c === "drawImage")).toHaveLength(1);
  });

  it("only fills the hole and never redraws when removed", () => {
    const panel = cutPanel([{ x: 10, y: 10 }, { x: 20, y: 10 }, { x: 20, y: 20 }], { x: 0, y: 0 }, true);
    const ctx = fakeCtx();

    drawCutPanelContent(ctx, panel, image, 100, 100, 1);

    expect(ctx.calls.filter((c) => c === "fill")).toHaveLength(1);
    expect(ctx.calls.filter((c) => c === "drawImage")).toHaveLength(0);
  });

  it("is a no-op for a plain (non-cut) panel", () => {
    const panel = createPanel({ id: "p1", points: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }] });
    const ctx = fakeCtx();

    drawCutPanelContent(ctx, panel, image, 100, 100, 1);

    expect(ctx.calls).toHaveLength(0);
  });

  it("draws the replacement image instead of the original when replacement + a loaded image are given", () => {
    const panel = cutPanel([{ x: 10, y: 10 }, { x: 20, y: 10 }, { x: 20, y: 20 }], { x: 0, y: 0 }, false, { files: { de: "poster.png" } });
    const replacementImage = {} as unknown as CanvasImageSource;
    const ctx = fakeCtx();

    drawCutPanelContent(ctx, panel, image, 100, 100, 1, replacementImage);

    expect(ctx.calls.filter((c) => c === "fill")).toHaveLength(1); // hole-fill still happens
    expect(ctx.calls.filter((c) => c === "drawImage")).toHaveLength(1); // exactly one draw — the replacement, not the original
    expect(ctx.calls.filter((c) => c === "stroke")).toHaveLength(0); // no border configured
  });

  it("also strokes the border when replacement.border is set", () => {
    const panel = cutPanel([{ x: 10, y: 10 }, { x: 20, y: 10 }, { x: 20, y: 20 }], { x: 0, y: 0 }, false, {
      files: { de: "poster.png" },
      border: { color: "#000000", widthPx: 4 },
    });
    const replacementImage = {} as unknown as CanvasImageSource;
    const ctx = fakeCtx();

    drawCutPanelContent(ctx, panel, image, 100, 100, 1, replacementImage);

    expect(ctx.calls.filter((c) => c === "stroke")).toHaveLength(1);
  });

  it("falls back to redrawing the original when replacement is configured but no image was loaded yet", () => {
    const panel = cutPanel([{ x: 10, y: 10 }, { x: 20, y: 10 }, { x: 20, y: 20 }], { x: 0, y: 0 }, false, { files: { de: "poster.png" } });
    const ctx = fakeCtx();

    drawCutPanelContent(ctx, panel, image, 100, 100, 1 /* no replacementImage passed */);

    expect(ctx.calls.filter((c) => c === "drawImage")).toHaveLength(1);
  });

  it("removed always wins even if a replacement is also configured", () => {
    const panel = cutPanel([{ x: 10, y: 10 }, { x: 20, y: 10 }, { x: 20, y: 20 }], { x: 0, y: 0 }, true, { files: { de: "poster.png" } });
    const replacementImage = {} as unknown as CanvasImageSource;
    const ctx = fakeCtx();

    drawCutPanelContent(ctx, panel, image, 100, 100, 1, replacementImage);

    expect(ctx.calls.filter((c) => c === "fill")).toHaveLength(1);
    expect(ctx.calls.filter((c) => c === "drawImage")).toHaveLength(0);
  });
});
