import { describe, it, expect } from "vitest";
import { createBubble } from "../../../../shared/src/layoutSchema";
import type { LanguageDef } from "../../../../shared/src/languages";
import type { GlossaryEntry } from "../../../../shared/src/glossary";
import { buildExtractGlossaryPrompt, hasGlossaryExtractionTargets, parseExtractGlossaryAction } from "./extractGlossaryAction";

const languages: LanguageDef[] = [{ code: "de", label: "Deutsch", folderSuffix: "german" }];

function dialogueBubble(text: string) {
  const b = createBubble({ id: "a", x: 0, y: 0, width: 10, height: 10 });
  b.text = { de: text };
  return b;
}

describe("hasGlossaryExtractionTargets", () => {
  it("is true once the page has any dialogue", () => {
    expect(hasGlossaryExtractionTargets([dialogueBubble("Neko-chan!")])).toBe(true);
  });

  it("is false for an empty page", () => {
    expect(hasGlossaryExtractionTargets([])).toBe(false);
  });

  it("ignores effect (SFX) bubbles", () => {
    const b = createBubble({ id: "a", x: 0, y: 0, width: 10, height: 10, isEffect: true });
    b.text = { de: "BUMM" };
    expect(hasGlossaryExtractionTargets([b])).toBe(false);
  });
});

describe("buildExtractGlossaryPrompt", () => {
  it("returns an empty string with nothing to extract from", () => {
    expect(buildExtractGlossaryPrompt([], languages, [])).toBe("");
  });

  it("includes dialogue text and excludes already-known terms", () => {
    const prompt = buildExtractGlossaryPrompt([dialogueBubble("Neko-chan!")], languages, [{ id: "g1", term: "Onii-chan", translations: {}, readings: {}, note: "" }]);
    expect(prompt).toContain("Neko-chan");
    expect(prompt).toContain("Onii-chan");
  });
});

describe("parseExtractGlossaryAction", () => {
  it("parses a well-formed fenced JSON action", () => {
    const raw = '```json\n{"action":"extract_glossary_terms","terms":[{"term":"Neko-chan","translations":{"de":"Katzenmädchen"}}]}\n```';
    expect(parseExtractGlossaryAction(raw, [])).toEqual({
      action: "extract_glossary_terms",
      terms: [{ term: "Neko-chan", translations: { de: "Katzenmädchen" } }],
    });
  });

  it("drops a term that already exists in the glossary (case-insensitive)", () => {
    const existing: GlossaryEntry[] = [{ id: "g1", term: "Neko-chan", translations: {}, readings: {}, note: "" }];
    const raw = '```json\n{"action":"extract_glossary_terms","terms":[{"term":"neko-chan","translations":{}}]}\n```';
    expect(parseExtractGlossaryAction(raw, existing)).toBeNull();
  });
});
