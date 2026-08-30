import { describe, it, expect } from "vitest";
import type { IndexedBubble } from "./projectSearchIndex";
import { applyReplacementToText, buildSearchRegex, findMatches } from "./findReplace";

function bubble(over: Partial<IndexedBubble>): IndexedBubble {
  return { volumeId: "v1", volumeLabel: "Volume 1", page: "page_01", bubbleId: "b1", text: {}, ...over };
}

describe("buildSearchRegex", () => {
  it("returns null for an empty term", () => {
    expect(buildSearchRegex("", false)).toBeNull();
  });

  it("escapes regex-special characters in the term", () => {
    const re = buildSearchRegex("a.b*c", false)!;
    expect(re.test("a.b*c")).toBe(true);
    expect(re.test("aXbYc")).toBe(false); // would match if "." and "*" weren't escaped
  });
});

describe("findMatches", () => {
  it("finds a case-insensitive substring match by default and previews the replacement", () => {
    const index = [bubble({ text: { de: "Hallo Welt" } })];
    const matches = findMatches(index, "welt", "Erde", false);
    expect(matches).toHaveLength(1);
    expect(matches[0].after).toBe("Hallo Erde");
    expect(matches[0].language).toBe("de");
  });

  it("respects caseSensitive: true", () => {
    const index = [bubble({ text: { de: "Hallo Welt" } })];
    expect(findMatches(index, "welt", "Erde", true)).toHaveLength(0);
    expect(findMatches(index, "Welt", "Erde", true)).toHaveLength(1);
  });

  it("replaces every occurrence in the text, not just the first", () => {
    const index = [bubble({ text: { de: "ha ha ha" } })];
    const matches = findMatches(index, "ha", "ho", false);
    expect(matches[0].after).toBe("ho ho ho");
  });

  it("checks every language on the bubble independently", () => {
    const index = [bubble({ text: { de: "Katze", en: "no match here", ja: "Katze-ish too" } })];
    const matches = findMatches(index, "katze", "Cat", false);
    expect(matches.map((m) => m.language).sort()).toEqual(["de", "ja"]);
  });

  it("finds nothing across bubbles with no match, and nothing for an empty term", () => {
    const index = [bubble({ text: { de: "irrelevant" } })];
    expect(findMatches(index, "not-present", "x", false)).toHaveLength(0);
    expect(findMatches(index, "", "x", false)).toHaveLength(0);
  });
});

describe("applyReplacementToText", () => {
  it("re-applies the same search/replace against a fresh text value", () => {
    expect(applyReplacementToText("Hallo Welt, schöne Welt", "welt", "Erde", false)).toBe("Hallo Erde, schöne Erde");
  });

  it("is a no-op for an empty search term", () => {
    expect(applyReplacementToText("unchanged", "", "x", false)).toBe("unchanged");
  });
});
