import { describe, it, expect } from "vitest";
import { drawWithTextBlur } from "../../../../shared/src/rendering/blurPass.js";
import type { TextBlur } from "../../../../shared/src/layoutSchema.js";

/** Minimal fake context recording the calls drawWithTextBlur makes. */
function fakeCtx() {
  const filters: string[] = [];
  let _filter = "none";
  let translates = 0;
  let saves = 0;
  let restores = 0;
  const alphas: number[] = [];
  let _alpha = 1;
  return {
    get filter() {
      return _filter;
    },
    set filter(v: string) {
      _filter = v;
      filters.push(v);
    },
    get globalAlpha() {
      return _alpha;
    },
    set globalAlpha(v: number) {
      _alpha = v;
      alphas.push(v);
    },
    save() {
      saves++;
    },
    restore() {
      restores++;
    },
    translate() {
      translates++;
    },
    _stats: () => ({ filters, translates, saves, restores, alphas, finalFilter: _filter, finalAlpha: _alpha }),
  } as unknown as CanvasRenderingContext2D & { _stats: () => { filters: string[]; translates: number; saves: number; restores: number; alphas: number[]; finalFilter: string; finalAlpha: number } };
}

describe("drawWithTextBlur", () => {
  it("draws once with no filter when blur is disabled", () => {
    const ctx = fakeCtx() as CanvasRenderingContext2D & { _stats: () => { filters: string[] } };
    let calls = 0;
    drawWithTextBlur(ctx, { enabled: false, kind: "gaussian", radiusPx: 4, angleDeg: 0 }, 1, () => calls++);
    expect(calls).toBe(1);
    expect(ctx._stats().filters).toEqual([]);
  });

  it("draws once with no filter when radius is zero", () => {
    const ctx = fakeCtx();
    let calls = 0;
    drawWithTextBlur(ctx, { enabled: true, kind: "gaussian", radiusPx: 0, angleDeg: 0 }, 1, () => calls++);
    expect(calls).toBe(1);
  });

  it("gaussian: sets a blur() filter scaled by `scale`, then resets it", () => {
    const ctx = fakeCtx() as CanvasRenderingContext2D & { _stats: () => { filters: string[]; finalFilter: string } };
    let calls = 0;
    drawWithTextBlur(ctx, { enabled: true, kind: "gaussian", radiusPx: 4, angleDeg: 0 }, 2, () => calls++);
    expect(calls).toBe(1);
    const stats = ctx._stats();
    expect(stats.filters.some((f) => f.includes("blur(8px)"))).toBe(true); // 4 * scale 2
    expect(stats.finalFilter).toBe("none");
  });

  it("motion: composites several offset copies at reduced alpha, restoring alpha after", () => {
    const ctx = fakeCtx() as CanvasRenderingContext2D & { _stats: () => { translates: number; saves: number; restores: number; finalAlpha: number } };
    let calls = 0;
    const blur: TextBlur = { enabled: true, kind: "motion", radiusPx: 10, angleDeg: 0 };
    drawWithTextBlur(ctx, blur, 1, () => calls++);
    const stats = ctx._stats();
    expect(calls).toBeGreaterThan(1);
    expect(calls).toBe(stats.translates); // one translate per copy
    expect(stats.saves).toBe(stats.restores);
    expect(stats.finalAlpha).toBe(1); // alpha restored
  });
});
