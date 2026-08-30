import { describe, it, expect } from "vitest";
import { createBubble } from "../../../shared/src/layoutSchema";
import type { LanguageDef } from "../../../shared/src/languages";
import type { GlossaryEntry } from "../../../shared/src/glossary";
import type { LetteringPreset } from "../../../shared/src/presets";
import { runQaChecks } from "./qaChecks";

const languages: LanguageDef[] = [
  { code: "ja", label: "日本語", folderSuffix: "japanese" },
  { code: "de", label: "Deutsch", folderSuffix: "german" },
];

function bubble(id: string, text: Record<string, string>) {
  return createBubble({ id, x: 0, y: 0, width: 100, height: 50, text });
}

describe("runQaChecks — missingTranslation", () => {
  it("flags a configured language that's empty while another has text", () => {
    const pages = [{ page: "page_01", bubbles: [bubble("b1", { ja: "こんにちは", de: "" })] }];
    const issues = runQaChecks(pages, languages, [], []);
    expect(issues).toHaveLength(1);
    expect(issues[0].category).toBe("missingTranslation");
    expect(issues[0].params.language).toBe("Deutsch");
  });

  it("does not flag a bubble that has no text in any language (unused, not incomplete)", () => {
    const pages = [{ page: "page_01", bubbles: [bubble("b1", {})] }];
    expect(runQaChecks(pages, languages, [], [])).toHaveLength(0);
  });

  it("does not flag a bubble with text in every configured language", () => {
    const pages = [{ page: "page_01", bubbles: [bubble("b1", { ja: "こんにちは", de: "Hallo" })] }];
    expect(runQaChecks(pages, languages, [], [])).toHaveLength(0);
  });
});

describe("runQaChecks — untranslatedGlossaryTerm", () => {
  const glossary: GlossaryEntry[] = [
    { id: "g1", term: "Kaijuu", translations: { de: "Kaiju-Monster" }, readings: {}, note: "" },
  ];

  it("flags when the source term appears whole-word in a language with a different approved translation", () => {
    const pages = [{ page: "page_01", bubbles: [bubble("b1", { ja: "Kaijuu desu", de: "Ein Kaijuu greift an" })] }];
    const issues = runQaChecks(pages, languages, glossary, []);
    expect(issues.some((i) => i.category === "untranslatedGlossaryTerm" && i.params.language === "Deutsch")).toBe(true);
  });

  function glossaryIssues(pages: { page: string; bubbles: ReturnType<typeof bubble>[] }[], glossaryEntries: GlossaryEntry[]) {
    return runQaChecks(pages, languages, glossaryEntries, []).filter((i) => i.category === "untranslatedGlossaryTerm");
  }

  it("does not flag a substring match inside a longer unrelated word", () => {
    const glossaryDistinct: GlossaryEntry[] = [{ id: "g1", term: "Kai", translations: { de: "Karl" }, readings: {}, note: "" }];
    const pages = [{ page: "page_01", bubbles: [bubble("b1", { de: "Kaiju-Monster" })] }];
    expect(glossaryIssues(pages, glossaryDistinct)).toHaveLength(0);
  });

  it("does not flag when the approved translation IS the term itself", () => {
    const sameGlossary: GlossaryEntry[] = [{ id: "g1", term: "Sensei", translations: { de: "Sensei" }, readings: {}, note: "" }];
    const pages = [{ page: "page_01", bubbles: [bubble("b1", { de: "Danke, Sensei" })] }];
    expect(glossaryIssues(pages, sameGlossary)).toHaveLength(0);
  });
});

describe("runQaChecks — duplicatePreset", () => {
  function preset(id: string, name: string): LetteringPreset {
    return { id, name, text: {}, background: {} };
  }

  it("flags two presets sharing the same name (trimmed, case-insensitive)", () => {
    const presets = [preset("p1", "Shout"), preset("p2", "  shout ")];
    const issues = runQaChecks([], languages, [], presets);
    expect(issues).toHaveLength(1);
    expect(issues[0].category).toBe("duplicatePreset");
    expect(issues[0].params.count).toBe("2");
  });

  it("does not flag distinct preset names", () => {
    const presets = [preset("p1", "Shout"), preset("p2", "Whisper")];
    expect(runQaChecks([], languages, [], presets)).toHaveLength(0);
  });
});
