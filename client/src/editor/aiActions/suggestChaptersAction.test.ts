import { describe, it, expect } from "vitest";
import { EMPTY_PAGE_META_DOCUMENT } from "../../../../shared/src/pageMeta";
import { buildSuggestChaptersPrompt, parseSuggestChaptersAction } from "./suggestChaptersAction";

const pageNames = ["page_01", "page_02", "page_03"];

describe("buildSuggestChaptersPrompt", () => {
  it("returns an empty string with no pages", () => {
    expect(buildSuggestChaptersPrompt([], EMPTY_PAGE_META_DOCUMENT)).toBe("");
  });

  it("lists every page name in order", () => {
    const prompt = buildSuggestChaptersPrompt(pageNames, EMPTY_PAGE_META_DOCUMENT);
    expect(prompt).toContain("page_01");
    expect(prompt).toContain("page_02");
    expect(prompt).toContain("page_03");
  });

  it("lists already-existing chapters so the model doesn't re-propose them", () => {
    const prompt = buildSuggestChaptersPrompt(pageNames, { chapters: [{ id: "c1", name: "Kapitel 1" }], pages: {} });
    expect(prompt).toContain("Kapitel 1");
  });
});

describe("parseSuggestChaptersAction", () => {
  it("parses a well-formed fenced JSON action with a valid page range", () => {
    const raw = '```json\n{"action":"suggest_chapters","chapters":[{"name":"Kapitel 1","fromPage":"page_01","toPage":"page_02","note":"neuer Abschnitt"}]}\n```';
    expect(parseSuggestChaptersAction(raw, pageNames)).toEqual({
      action: "suggest_chapters",
      chapters: [{ name: "Kapitel 1", fromPage: "page_01", toPage: "page_02", note: "neuer Abschnitt" }],
    });
  });

  it("drops a chapter referencing an unknown page name", () => {
    const raw = '```json\n{"action":"suggest_chapters","chapters":[{"name":"Kapitel 1","fromPage":"page_99","toPage":"page_02","note":"x"}]}\n```';
    expect(parseSuggestChaptersAction(raw, pageNames)).toBeNull();
  });

  it("drops a chapter whose fromPage comes after toPage in volume order", () => {
    const raw = '```json\n{"action":"suggest_chapters","chapters":[{"name":"Kapitel 1","fromPage":"page_03","toPage":"page_01","note":"x"}]}\n```';
    expect(parseSuggestChaptersAction(raw, pageNames)).toBeNull();
  });
});
