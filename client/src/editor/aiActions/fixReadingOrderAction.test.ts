import { describe, it, expect } from "vitest";
import { createBubble } from "../../../../shared/src/layoutSchema";
import { buildFixReadingOrderPrompt, findReadingOrderTargets, parseFixReadingOrderAction, readingOrderPatches } from "./fixReadingOrderAction";

function bubble(id: string, x: number, y: number, text: string) {
  const b = createBubble({ id, x, y, width: 10, height: 10 });
  b.text = { de: text };
  return b;
}

describe("findReadingOrderTargets", () => {
  it("returns the page's bubbles in their current reading order", () => {
    const a = bubble("a", 0, 0, "Erstens");
    const b = bubble("b", 100, 0, "Zweitens");
    // rtl (default manga direction): rightmost bubble in a row reads first.
    expect(findReadingOrderTargets([a, b], [], "de", "rtl")).toEqual([
      { bubbleId: "b", text: "Zweitens" },
      { bubbleId: "a", text: "Erstens" },
    ]);
  });

  it("returns nothing with fewer than two bubbles", () => {
    expect(findReadingOrderTargets([bubble("a", 0, 0, "x")], [], "de", "rtl")).toEqual([]);
  });
});

describe("buildFixReadingOrderPrompt", () => {
  it("returns an empty string with no targets", () => {
    expect(buildFixReadingOrderPrompt([])).toBe("");
  });

  it("lists bubbleIds in order", () => {
    const prompt = buildFixReadingOrderPrompt([
      { bubbleId: "b", text: "Zweitens" },
      { bubbleId: "a", text: "Erstens" },
    ]);
    expect(prompt).toContain("bubbleId=b");
    expect(prompt).toContain("bubbleId=a");
  });
});

describe("parseFixReadingOrderAction", () => {
  const targets = [
    { bubbleId: "a", text: "Erstens" },
    { bubbleId: "b", text: "Zweitens" },
  ];

  it("parses a well-formed permutation of the valid ids", () => {
    const raw = '```json\n{"action":"fix_reading_order","order":["a","b"],"note":"korrigiert"}\n```';
    expect(parseFixReadingOrderAction(raw, targets)).toEqual({ action: "fix_reading_order", order: ["a", "b"], note: "korrigiert" });
  });

  it("rejects a partial order (missing a valid id)", () => {
    const raw = '```json\n{"action":"fix_reading_order","order":["a"],"note":"x"}\n```';
    expect(parseFixReadingOrderAction(raw, targets)).toBeNull();
  });

  it("rejects an order containing a hallucinated id", () => {
    const raw = '```json\n{"action":"fix_reading_order","order":["a","does-not-exist"],"note":"x"}\n```';
    expect(parseFixReadingOrderAction(raw, targets)).toBeNull();
  });
});

describe("readingOrderPatches", () => {
  it("renumbers bubbles within their group to match the proposed order", () => {
    const a = bubble("a", 0, 0, "Erstens");
    const b = bubble("b", 100, 0, "Zweitens");
    // Proposed order swaps a and b relative to the automatic rtl sort.
    const patches = readingOrderPatches([a, b], [], "de", "rtl", ["a", "b"]);
    expect(patches).toEqual(
      expect.arrayContaining([
        { bubbleId: "a", readingOrderOverride: 0 },
        { bubbleId: "b", readingOrderOverride: 1 },
      ])
    );
  });
});
