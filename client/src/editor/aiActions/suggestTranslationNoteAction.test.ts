import { describe, it, expect } from "vitest";
import { createBubble } from "../../../../shared/src/layoutSchema";
import { buildSuggestTranslationNotePrompt, hasTranslationNoteTargets, parseSuggestTranslationNoteAction } from "./suggestTranslationNoteAction";

function dialogueBubble(id: string, text: string) {
  const b = createBubble({ id, x: 0, y: 0, width: 10, height: 10 });
  b.text = { de: text };
  return b;
}

describe("hasTranslationNoteTargets", () => {
  it("is true once the page has any dialogue", () => {
    expect(hasTranslationNoteTargets([dialogueBubble("a", "Ein Wortspiel")])).toBe(true);
  });

  it("is false for an empty page", () => {
    expect(hasTranslationNoteTargets([])).toBe(false);
  });
});

describe("buildSuggestTranslationNotePrompt", () => {
  it("returns an empty string with nothing to comment on", () => {
    expect(buildSuggestTranslationNotePrompt([])).toBe("");
  });

  it("includes bubbleId and text", () => {
    const prompt = buildSuggestTranslationNotePrompt([dialogueBubble("a", "Ein Wortspiel")]);
    expect(prompt).toContain("bubbleId=a");
    expect(prompt).toContain("Ein Wortspiel");
  });
});

describe("parseSuggestTranslationNoteAction", () => {
  it("parses a page-level note (no bubbleId)", () => {
    const raw = '```json\n{"action":"suggest_translation_note","note":"Schwer zu übersetzendes Wortspiel."}\n```';
    expect(parseSuggestTranslationNoteAction(raw, ["a"])).toEqual({ action: "suggest_translation_note", note: "Schwer zu übersetzendes Wortspiel." });
  });

  it("parses a bubble-scoped note", () => {
    const raw = '```json\n{"action":"suggest_translation_note","bubbleId":"a","note":"Ehrentitel schwer übertragbar."}\n```';
    expect(parseSuggestTranslationNoteAction(raw, ["a"])).toEqual({ action: "suggest_translation_note", bubbleId: "a", note: "Ehrentitel schwer übertragbar." });
  });

  it("drops a hallucinated bubbleId but keeps the note as page-level", () => {
    const raw = '```json\n{"action":"suggest_translation_note","bubbleId":"does-not-exist","note":"x"}\n```';
    expect(parseSuggestTranslationNoteAction(raw, ["a"])).toEqual({ action: "suggest_translation_note", bubbleId: undefined, note: "x" });
  });

  it("returns null for an empty note", () => {
    const raw = '```json\n{"action":"suggest_translation_note","note":""}\n```';
    expect(parseSuggestTranslationNoteAction(raw, ["a"])).toBeNull();
  });
});
