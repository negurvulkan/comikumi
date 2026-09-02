import { describe, it, expect } from "vitest";
import { createBubble } from "../../../../shared/src/layoutSchema";
import type { LanguageDef } from "../../../../shared/src/languages";
import type { GlossaryEntry } from "../../../../shared/src/glossary";
import { buildFixGlossaryUsagePrompt, findGlossaryUsageTargets, parseFixGlossaryUsageAction } from "./fixGlossaryUsageAction";

const languages: LanguageDef[] = [{ code: "de", label: "Deutsch", folderSuffix: "german" }];
const glossary: GlossaryEntry[] = [{ id: "g1", term: "Neko", translations: { de: "Katze" }, readings: {}, note: "" }];

describe("findGlossaryUsageTargets", () => {
  it("finds a bubble that left the source term untranslated", () => {
    const bubble = createBubble({ id: "a", x: 0, y: 0, width: 10, height: 10 });
    bubble.text = { de: "Ich mag Neko." };
    expect(findGlossaryUsageTargets([bubble], languages, glossary)).toEqual([
      { bubbleId: "a", language: "de", currentText: "Ich mag Neko.", term: "Neko", approvedTranslation: "Katze" },
    ]);
  });

  it("ignores a bubble that already uses the approved translation", () => {
    const bubble = createBubble({ id: "a", x: 0, y: 0, width: 10, height: 10 });
    bubble.text = { de: "Ich mag Katze." };
    expect(findGlossaryUsageTargets([bubble], languages, glossary)).toEqual([]);
  });
});

describe("buildFixGlossaryUsagePrompt", () => {
  it("returns an empty string with no targets", () => {
    expect(buildFixGlossaryUsagePrompt([], languages)).toBe("");
  });

  it("includes the term and its approved translation", () => {
    const prompt = buildFixGlossaryUsagePrompt(
      [{ bubbleId: "a", language: "de", currentText: "Ich mag Neko.", term: "Neko", approvedTranslation: "Katze" }],
      languages
    );
    expect(prompt).toContain("Neko");
    expect(prompt).toContain("Katze");
    expect(prompt).toContain("bubbleId=a");
  });
});

describe("parseFixGlossaryUsageAction", () => {
  const targets = [{ bubbleId: "a", language: "de", currentText: "Ich mag Neko.", term: "Neko", approvedTranslation: "Katze" }];

  it("parses a well-formed fenced JSON action", () => {
    const raw = '```json\n{"action":"fix_glossary_usage","language":"de","translations":[{"bubbleId":"a","text":"Ich mag Katze."}]}\n```';
    expect(parseFixGlossaryUsageAction(raw, targets)).toEqual({
      action: "fix_glossary_usage",
      language: "de",
      translations: [{ bubbleId: "a", text: "Ich mag Katze." }],
    });
  });

  it("returns null for a language with no matching target", () => {
    const raw = '```json\n{"action":"fix_glossary_usage","language":"en","translations":[{"bubbleId":"a","text":"x"}]}\n```';
    expect(parseFixGlossaryUsageAction(raw, targets)).toBeNull();
  });
});
