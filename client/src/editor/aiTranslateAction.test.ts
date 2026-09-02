import { describe, it, expect } from "vitest";
import { createBubble } from "../../../shared/src/layoutSchema";
import type { LanguageDef } from "../../../shared/src/languages";
import {
  ACTION_FENCE_PREFIX,
  buildTranslateActionPrompt,
  findMissingTranslationTargets,
  parseTranslateAction,
} from "./aiTranslateAction";

const languages: LanguageDef[] = [
  { code: "en", label: "English", folderSuffix: "english" },
  { code: "de", label: "Deutsch", folderSuffix: "german" },
];

describe("findMissingTranslationTargets", () => {
  it("finds a bubble with text in one language but not another", () => {
    const bubble = createBubble({ id: "a", x: 0, y: 0, width: 10, height: 10 });
    bubble.text = { en: "Hello" };

    const targets = findMissingTranslationTargets([bubble], languages);

    expect(targets).toEqual([{ bubbleId: "a", language: "de", sourceLanguage: "en", sourceText: "Hello" }]);
  });

  it("ignores a bubble with no text in any language", () => {
    const bubble = createBubble({ id: "a", x: 0, y: 0, width: 10, height: 10 });
    expect(findMissingTranslationTargets([bubble], languages)).toEqual([]);
  });

  it("ignores a bubble that already has text in every language", () => {
    const bubble = createBubble({ id: "a", x: 0, y: 0, width: 10, height: 10 });
    bubble.text = { en: "Hello", de: "Hallo" };
    expect(findMissingTranslationTargets([bubble], languages)).toEqual([]);
  });

  it("ignores effect (SFX) bubbles", () => {
    const bubble = createBubble({ id: "a", x: 0, y: 0, width: 10, height: 10, isEffect: true });
    bubble.text = { en: "BOOM" };
    expect(findMissingTranslationTargets([bubble], languages)).toEqual([]);
  });
});

describe("buildTranslateActionPrompt", () => {
  it("returns an empty string when there is nothing missing", () => {
    expect(buildTranslateActionPrompt([], languages, [])).toBe("");
  });

  it("includes the fence-prefix instruction, the bubbleId, and the source text", () => {
    const prompt = buildTranslateActionPrompt([{ bubbleId: "a", language: "de", sourceLanguage: "en", sourceText: "Hello" }], languages, []);
    expect(prompt).toContain(ACTION_FENCE_PREFIX);
    expect(prompt).toContain("bubbleId=a");
    expect(prompt).toContain("Hello");
  });
});

describe("parseTranslateAction", () => {
  const targets = [{ bubbleId: "a", language: "de", sourceLanguage: "en", sourceText: "Hello" }];

  it("parses a well-formed fenced JSON action", () => {
    const raw = '```json\n{"action":"translate_missing_bubbles","language":"de","translations":[{"bubbleId":"a","text":"Hallo"}]}\n```';
    expect(parseTranslateAction(raw, targets)).toEqual({
      action: "translate_missing_bubbles",
      language: "de",
      translations: [{ bubbleId: "a", text: "Hallo" }],
    });
  });

  it("returns null for plain chat text with no fenced block", () => {
    expect(parseTranslateAction("Sure, here's an idea for that scene…", targets)).toBeNull();
  });

  it("returns null for malformed JSON inside the fence", () => {
    expect(parseTranslateAction("```json\nnot valid json\n```", targets)).toBeNull();
  });

  it("returns null when the JSON doesn't match the schema", () => {
    const raw = '```json\n{"action":"translate_missing_bubbles","language":"de"}\n```';
    expect(parseTranslateAction(raw, targets)).toBeNull();
  });

  it("drops a hallucinated bubbleId not in the valid target list", () => {
    const raw =
      '```json\n{"action":"translate_missing_bubbles","language":"de","translations":[' +
      '{"bubbleId":"a","text":"Hallo"},{"bubbleId":"does-not-exist","text":"???"}]}\n```';
    expect(parseTranslateAction(raw, targets)?.translations).toEqual([{ bubbleId: "a", text: "Hallo" }]);
  });

  it("returns null when every translation is dropped (all bubbleIds invalid)", () => {
    const raw = '```json\n{"action":"translate_missing_bubbles","language":"de","translations":[{"bubbleId":"nope","text":"x"}]}\n```';
    expect(parseTranslateAction(raw, targets)).toBeNull();
  });

  it("drops a translation whose language doesn't match any known target", () => {
    const raw = '```json\n{"action":"translate_missing_bubbles","language":"fr","translations":[{"bubbleId":"a","text":"Bonjour"}]}\n```';
    expect(parseTranslateAction(raw, targets)).toBeNull();
  });
});
