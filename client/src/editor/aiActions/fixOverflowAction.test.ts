import { describe, it, expect } from "vitest";
import type { LanguageDef } from "../../../../shared/src/languages";
import { buildFixOverflowPrompt, parseFixOverflowAction, type OverflowTarget } from "./fixOverflowAction";

// findOverflowTargets() itself needs a real canvas 2D measurement context (see
// shared/src/rendering/textLayout.ts's fitHorizontalText) — unavailable in this
// suite's "node" test environment (see vitest.config.ts), same pre-existing gap as
// BubbleShape.tsx (which has no test file either, for the same reason). Only the
// DOM-independent prompt/parse logic is covered here.

const languages: LanguageDef[] = [{ code: "de", label: "Deutsch", folderSuffix: "german" }];
const targets: OverflowTarget[] = [
  { bubbleId: "a", language: "de", text: "Ein sehr langer Text", width: 100, height: 60, fontSize: 6, imageWidth: 2000, imageHeight: 3000 },
];

describe("buildFixOverflowPrompt", () => {
  it("returns an empty string when nothing overflows", () => {
    expect(buildFixOverflowPrompt([], languages)).toBe("");
  });

  it("includes the bubbleId, current size, and page bounds", () => {
    const prompt = buildFixOverflowPrompt(targets, languages);
    expect(prompt).toContain("bubbleId=a");
    expect(prompt).toContain("100x60px");
    expect(prompt).toContain("2000x3000px");
  });
});

describe("parseFixOverflowAction", () => {
  it("parses a well-formed fenced JSON action", () => {
    const raw = '```json\n{"action":"fix_bubble_overflow","patches":[{"bubbleId":"a","language":"de","width":140,"height":80,"fontSize":18,"note":"vergrößert"}]}\n```';
    expect(parseFixOverflowAction(raw, targets)).toEqual({
      action: "fix_bubble_overflow",
      patches: [{ bubbleId: "a", language: "de", width: 140, height: 80, fontSize: 18, note: "vergrößert" }],
    });
  });

  it("returns null for plain chat text", () => {
    expect(parseFixOverflowAction("Sicher, hier ist eine Idee…", targets)).toBeNull();
  });

  it("drops a patch for a bubbleId/language combination not in the valid target list", () => {
    const raw =
      '```json\n{"action":"fix_bubble_overflow","patches":[' +
      '{"bubbleId":"a","language":"de","width":140,"height":80,"fontSize":18,"note":"ok"},' +
      '{"bubbleId":"a","language":"en","width":140,"height":80,"fontSize":18,"note":"invalid language"}]}\n```';
    expect(parseFixOverflowAction(raw, targets)?.patches).toEqual([{ bubbleId: "a", language: "de", width: 140, height: 80, fontSize: 18, note: "ok" }]);
  });

  it("returns null when every patch is dropped", () => {
    const raw = '```json\n{"action":"fix_bubble_overflow","patches":[{"bubbleId":"nope","language":"de","width":1,"height":1,"fontSize":1,"note":""}]}\n```';
    expect(parseFixOverflowAction(raw, targets)).toBeNull();
  });
});
