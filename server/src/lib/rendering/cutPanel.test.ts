import { describe, it, expect } from "vitest";
import { createPanel } from "../../../../shared/src/layoutSchema.js";
import {
  cutPanelDelta,
  cutPanelSourcePolygon,
  drawCutPanelContent,
  drawCutPanelForeground,
  fillCutPanelHole,
} from "../../../../shared/src/rendering/cutPanel.js";

/** Minimal CanvasRenderingContext2D stand-in that only records which calls happened —
 * drawCutPanelContent never reads back geometry, just issues path/fill/clip/drawImage
 * calls, so a call-counting fake is enough to exercise it without jsdom/node-canvas.
 * `drawImageCalls` additionally records drawImage()'s numeric args (dx/dy/dw/dh) for
 * tests that need to verify the "contain" fit's actual scale/centering math, not just
 * that a draw happened. */
function fakeCtx() {
  const calls: string[] = [];
  const drawImageCalls: number[][] = [];
  return {
    calls,
    drawImageCalls,
    save: () => calls.push("save"),
    restore: () => calls.push("restore"),
    beginPath: () => calls.push("beginPath"),
    moveTo: () => calls.push("moveTo"),
    lineTo: () => calls.push("lineTo"),
    closePath: () => calls.push("closePath"),
    fill: () => calls.push("fill"),
    fillRect: () => calls.push("fillRect"),
    clip: () => calls.push("clip"),
    drawImage: (_image: unknown, ...args: number[]) => {
      calls.push("drawImage");
      drawImageCalls.push(args);
    },
    stroke: () => calls.push("stroke"),
    fillStyle: "",
    strokeStyle: "",
    lineWidth: 0,
  } as unknown as CanvasRenderingContext2D & { calls: string[]; drawImageCalls: number[][] };
}

function cutPanel(
  points: { x: number; y: number }[],
  cutOriginOffset = { x: 0, y: 0 },
  removed = false,
  replacement?: { files: Record<string, string>; border?: { color: string; widthPx: number }; fit?: "stretch" | "contain" }
) {
  const panel = createPanel({ id: "p1", points });
  return {
    ...panel,
    cut: {
      cutOrigin: { x: panel.origin.x + cutOriginOffset.x, y: panel.origin.y + cutOriginOffset.y },
      holeFill: { mode: "auto" as const, color: "#ffffff" },
      removed: removed || undefined,
      replacement: replacement ? { fit: "stretch" as const, ...replacement } : undefined,
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

  it("stretches the replacement image to the panel's full bounding box by default (fit: \"stretch\")", () => {
    // A 10x10-image-space panel box (see cutPanel() helper's points) with a
    // non-matching-aspect-ratio 50x200 source image — "stretch" ignores the source's
    // own aspect ratio entirely and fills the whole box.
    const panel = cutPanel([{ x: 10, y: 10 }, { x: 20, y: 10 }, { x: 20, y: 20 }], { x: 0, y: 0 }, false, { files: { de: "poster.png" } });
    const replacementImage = { width: 50, height: 200 } as unknown as CanvasImageSource;
    const ctx = fakeCtx();

    drawCutPanelForeground(ctx, panel, image, 100, 100, 1, replacementImage);

    expect(ctx.calls.filter((c) => c === "fillRect")).toHaveLength(0); // no letterboxing for "stretch"
    expect(ctx.drawImageCalls).toEqual([[10, 10, 10, 10]]); // dx,dy,dw,dh = exactly the box, aspect ratio ignored
  });

  it("preserves the replacement image's own aspect ratio and letterboxes with holeFill.color when fit is \"contain\"", () => {
    // Same 10x10 box, but a 50x200 (1:4) source image — contained inside a 10x10 box
    // that ratio scales to width 2.5, height 10, centered horizontally.
    const panel = cutPanel([{ x: 10, y: 10 }, { x: 20, y: 10 }, { x: 20, y: 20 }], { x: 0, y: 0 }, false, {
      files: { de: "poster.png" },
      fit: "contain",
    });
    const replacementImage = { width: 50, height: 200 } as unknown as CanvasImageSource;
    const ctx = fakeCtx();

    drawCutPanelForeground(ctx, panel, image, 100, 100, 1, replacementImage);

    expect(ctx.calls.filter((c) => c === "fillRect")).toHaveLength(1); // letterbox background painted first
    const [dx, dy, dw, dh] = ctx.drawImageCalls[0];
    expect(dw).toBeCloseTo(2.5);
    expect(dh).toBeCloseTo(10);
    expect(dx).toBeCloseTo(10 + (10 - 2.5) / 2); // centered within the 10..20 box
    expect(dy).toBeCloseTo(10); // fills the box's full height, no vertical offset
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

describe("multi-panel rendering order (swap regression)", () => {
  const image = {} as unknown as CanvasImageSource;

  it("never lets a later panel's hole-fill land after an earlier panel's content draw — every fill precedes every draw", () => {
    // Two Cut-Panels that have swapped positions: A's current spot is exactly B's
    // vacated (source) spot, and vice versa — the scenario where interleaving
    // fill-then-draw per panel (drawCutPanelContent's old, now-removed all-in-one
    // behavior for a multi-panel caller) would have panel B's hole-fill silently paint
    // over panel A's already-drawn content sitting in that same spot.
    const panelA = cutPanel([{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }], { x: 50, y: 0 }); // moved from (50,0) to (0,0)
    const panelB = cutPanel([{ x: 50, y: 0 }, { x: 60, y: 0 }, { x: 60, y: 10 }], { x: -50, y: 0 }); // moved from (0,0) to (50,0)
    const ctx = fakeCtx();

    // The correct multi-panel call pattern: every hole filled first, only then every
    // panel's foreground drawn (see PageCanvas.tsx / renderPageToPng.ts / pageRaster.ts).
    for (const p of [panelA, panelB]) fillCutPanelHole(ctx, p, 1);
    for (const p of [panelA, panelB]) drawCutPanelForeground(ctx, p, image, 100, 100, 1);

    const lastFillIndex = ctx.calls.lastIndexOf("fill");
    const firstDrawIndex = ctx.calls.indexOf("drawImage");
    expect(ctx.calls.filter((c) => c === "fill")).toHaveLength(2);
    expect(ctx.calls.filter((c) => c === "drawImage")).toHaveLength(2);
    expect(lastFillIndex).toBeLessThan(firstDrawIndex);
  });
});
