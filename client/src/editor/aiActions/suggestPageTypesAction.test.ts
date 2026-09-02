import { describe, it, expect } from "vitest";
import { EMPTY_PAGE_META_DOCUMENT } from "../../../../shared/src/pageMeta";
import { buildSuggestPageTypesPrompt, findPageTypeCandidates, parseSuggestPageTypesAction } from "./suggestPageTypesAction";

const pageNames = ["cover", "page_01", "page_02"];

describe("findPageTypeCandidates", () => {
  it("treats every page as a story-type candidate when nothing is tagged yet", () => {
    expect(findPageTypeCandidates(pageNames, EMPTY_PAGE_META_DOCUMENT)).toEqual([
      { page: "cover", index: 0, currentType: "story" },
      { page: "page_01", index: 1, currentType: "story" },
      { page: "page_02", index: 2, currentType: "story" },
    ]);
  });

  it("excludes a page that's already tagged as something other than story", () => {
    const meta = { chapters: [], pages: { cover: { type: "cover" as const } } };
    expect(findPageTypeCandidates(pageNames, meta).map((c) => c.page)).toEqual(["page_01", "page_02"]);
  });
});

describe("buildSuggestPageTypesPrompt", () => {
  it("returns an empty string with no candidates", () => {
    expect(buildSuggestPageTypesPrompt([], 3)).toBe("");
  });

  it("includes page name and position", () => {
    const prompt = buildSuggestPageTypesPrompt([{ page: "cover", index: 0, currentType: "story" }], 3);
    expect(prompt).toContain("cover");
    expect(prompt).toContain("1/3");
  });
});

describe("parseSuggestPageTypesAction", () => {
  it("parses a well-formed fenced JSON action", () => {
    const raw = '```json\n{"action":"suggest_page_types","patches":[{"page":"cover","type":"cover","note":"erste Seite"}]}\n```';
    expect(parseSuggestPageTypesAction(raw, ["cover"])).toEqual({
      action: "suggest_page_types",
      patches: [{ page: "cover", type: "cover", note: "erste Seite" }],
    });
  });

  it("drops a patch for a page outside the candidate list", () => {
    const raw = '```json\n{"action":"suggest_page_types","patches":[{"page":"page_01","type":"cover","note":"x"}]}\n```';
    expect(parseSuggestPageTypesAction(raw, ["cover"])).toBeNull();
  });

  it("drops a no-op patch that proposes the default \"story\" type", () => {
    const raw = '```json\n{"action":"suggest_page_types","patches":[{"page":"cover","type":"story","note":"x"}]}\n```';
    expect(parseSuggestPageTypesAction(raw, ["cover"])).toBeNull();
  });
});
