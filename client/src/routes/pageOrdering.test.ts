import { describe, it, expect } from "vitest";
import type { PageSummary } from "../api/client";
import { movePage, insertPageAt, reconcileOrder } from "./pageOrdering";

function page(name: string): PageSummary {
  return { page: name, fileName: `${name}.png`, width: 100, height: 100 };
}

describe("movePage", () => {
  it("moves a page to a later index", () => {
    expect(movePage(["a", "b", "c"], "a", 2)).toEqual(["b", "c", "a"]);
  });

  it("moves a page to an earlier index", () => {
    expect(movePage(["a", "b", "c"], "c", 0)).toEqual(["c", "a", "b"]);
  });

  it("is a no-op for an unknown page id", () => {
    const order = ["a", "b", "c"];
    expect(movePage(order, "does-not-exist", 1)).toBe(order);
  });

  it("clamps an out-of-range target index", () => {
    expect(movePage(["a", "b", "c"], "a", 999)).toEqual(["b", "c", "a"]);
    expect(movePage(["a", "b", "c"], "c", -5)).toEqual(["c", "a", "b"]);
  });
});

describe("insertPageAt", () => {
  it("inserts one or more names at the given index", () => {
    expect(insertPageAt(["a", "b"], ["x", "y"], 1)).toEqual(["a", "x", "y", "b"]);
  });

  it("defaults to appending when the index is at (or past) the end", () => {
    expect(insertPageAt(["a", "b"], ["x"], 2)).toEqual(["a", "b", "x"]);
    expect(insertPageAt(["a", "b"], ["x"], 999)).toEqual(["a", "b", "x"]);
  });

  it("inserts at the start for index 0", () => {
    expect(insertPageAt(["a", "b"], ["x"], 0)).toEqual(["x", "a", "b"]);
  });
});

describe("reconcileOrder", () => {
  it("returns the order unchanged when it already matches the current pages", () => {
    const pages = [page("page_01"), page("page_02")];
    expect(reconcileOrder(["page_01", "page_02"], pages)).toEqual(["page_01", "page_02"]);
  });

  it("drops order entries for pages no longer present", () => {
    const pages = [page("page_01"), page("page_02")];
    expect(reconcileOrder(["page_02", "page_99", "page_01"], pages)).toEqual(["page_02", "page_01"]);
  });

  it("appends current pages missing from the order, naturally sorted", () => {
    const pages = [page("page_01"), page("page_02"), page("page_10")];
    expect(reconcileOrder(["page_02"], pages)).toEqual(["page_02", "page_01", "page_10"]);
  });

  it("falls back to a plain natural sort when the order is empty", () => {
    const pages = [page("page_10"), page("page_2"), page("page_1")];
    expect(reconcileOrder([], pages)).toEqual(["page_1", "page_2", "page_10"]);
  });
});
