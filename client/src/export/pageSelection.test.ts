import { describe, it, expect } from "vitest";
import type { PageSummary } from "../api/client";
import { parseCustomSelection, selectPages } from "./pageSelection";

function page(page: string): PageSummary {
  return { page, fileName: `${page}.png`, width: 100, height: 100 };
}

describe("parseCustomSelection", () => {
  it("parses a mix of single numbers and ranges", () => {
    expect(parseCustomSelection("1,3,5,10-14")).toEqual(new Set([1, 3, 5, 10, 11, 12, 13, 14]));
  });

  it("dedupes overlapping numbers/ranges", () => {
    expect(parseCustomSelection("5,3-5")).toEqual(new Set([5, 3, 4]));
  });

  it("tolerates whitespace around commas/dashes", () => {
    expect(parseCustomSelection(" 1 ,  3 - 5 ")).toEqual(new Set([1, 3, 4, 5]));
  });

  it("throws on empty input", () => {
    expect(() => parseCustomSelection("")).toThrow();
    expect(() => parseCustomSelection("   ")).toThrow();
  });

  it("throws on a range with 'from' greater than 'to'", () => {
    expect(() => parseCustomSelection("10-5")).toThrow(/Ungültiger Bereich/);
  });

  it("throws on a non-numeric expression", () => {
    expect(() => parseCustomSelection("abc")).toThrow(/Ungültiger Ausdruck/);
  });
});

describe("selectPages", () => {
  const pages = [page("page_01"), page("page_02"), page("page_03"), page("page_04"), page("page_10")];

  it("mode 'current' keeps only the matching page", () => {
    expect(selectPages(pages, { mode: "current" }, "page_03").map((p) => p.page)).toEqual(["page_03"]);
  });

  it("mode 'all' returns every page unchanged", () => {
    expect(selectPages(pages, { mode: "all" }, "page_01")).toEqual(pages);
  });

  it("mode 'even'/'odd' filter by the trailing page number", () => {
    expect(selectPages(pages, { mode: "even" }, "page_01").map((p) => p.page)).toEqual(["page_02", "page_04", "page_10"]);
    expect(selectPages(pages, { mode: "odd" }, "page_01").map((p) => p.page)).toEqual(["page_01", "page_03"]);
  });

  it("mode 'range' filters inclusively between rangeFrom/rangeTo", () => {
    expect(selectPages(pages, { mode: "range", rangeFrom: 2, rangeTo: 4 }, "page_01").map((p) => p.page)).toEqual([
      "page_02",
      "page_03",
      "page_04",
    ]);
  });

  it("mode 'range' defaults to 1..Infinity when bounds are omitted", () => {
    expect(selectPages(pages, { mode: "range" }, "page_01")).toEqual(pages);
  });

  it("mode 'custom' filters by the parsed number set, preserving original order", () => {
    expect(selectPages(pages, { mode: "custom", custom: "1,10" }, "page_01").map((p) => p.page)).toEqual([
      "page_01",
      "page_10",
    ]);
  });
});
