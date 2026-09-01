import { describe, it, expect } from "vitest";
import { resolveChapters, EMPTY_PAGE_META_DOCUMENT, type PageMetaDocument } from "../../../shared/src/pageMeta.js";

function metaWith(chapters: PageMetaDocument["chapters"], pages: PageMetaDocument["pages"]): PageMetaDocument {
  return { chapters, pages };
}

describe("resolveChapters", () => {
  it("orders chapters by the first page (in pageOrder) that references them", () => {
    const meta = metaWith(
      [
        { id: "c1", name: "Chapter One" },
        { id: "c2", name: "Chapter Two" },
      ],
      {
        page_01: { chapterId: "c2" },
        page_02: { chapterId: "c1" },
      }
    );
    // c2's page appears BEFORE c1's page in pageOrder, so c2 should come first.
    const resolved = resolveChapters(["page_01", "page_02"], meta);
    expect(resolved.map((r) => r.chapter.id)).toEqual(["c2", "c1"]);
  });

  it("collects every page for a chapter even when they aren't contiguous in pageOrder", () => {
    const meta = metaWith(
      [{ id: "c1", name: "Chapter One" }],
      {
        page_01: { chapterId: "c1" },
        page_02: {}, // unassigned, sits between two of c1's pages
        page_03: { chapterId: "c1" },
      }
    );
    const resolved = resolveChapters(["page_01", "page_02", "page_03"], meta);
    expect(resolved).toHaveLength(1);
    expect(resolved[0].pageIds).toEqual(["page_01", "page_03"]);
  });

  it("excludes a chapter with no assigned pages", () => {
    const meta = metaWith([{ id: "c1", name: "Empty Chapter" }], {});
    expect(resolveChapters(["page_01"], meta)).toEqual([]);
  });

  it("ignores a page's chapterId if it doesn't match any known chapter (stale reference)", () => {
    const meta = metaWith([], { page_01: { chapterId: "does-not-exist" } });
    expect(resolveChapters(["page_01"], meta)).toEqual([]);
  });

  it("returns an empty array for an empty document", () => {
    expect(resolveChapters(["page_01"], EMPTY_PAGE_META_DOCUMENT)).toEqual([]);
  });
});
