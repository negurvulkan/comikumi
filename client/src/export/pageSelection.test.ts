import { describe, it, expect } from "vitest";
import { selectPages, parseCustomSelection, PageSelectionError } from "./pageSelection";
import type { PageSummary } from "../api/client";

function page(id: string): PageSummary {
  return { page: id, fileName: `${id}.png`, width: 100, height: 100 };
}

describe("selectPages — mode chapter", () => {
  const pages = [page("page_01"), page("page_02"), page("page_03")];

  it("returns exactly the pages in chapterPageIds, preserving the input's order", () => {
    const result = selectPages(pages, { mode: "chapter", chapterPageIds: new Set(["page_03", "page_01"]) }, "");
    expect(result.map((p) => p.page)).toEqual(["page_01", "page_03"]);
  });

  it("returns nothing when chapterPageIds is missing or empty", () => {
    expect(selectPages(pages, { mode: "chapter" }, "")).toEqual([]);
    expect(selectPages(pages, { mode: "chapter", chapterPageIds: new Set() }, "")).toEqual([]);
  });
});

describe("parseCustomSelection", () => {
  it("still parses plain numbers and ranges (unaffected by the new chapter mode)", () => {
    expect(parseCustomSelection("1,3,5,10-12")).toEqual(new Set([1, 3, 5, 10, 11, 12]));
  });

  it("throws PageSelectionError on invalid syntax", () => {
    expect(() => parseCustomSelection("abc")).toThrow(PageSelectionError);
  });
});
