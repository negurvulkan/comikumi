import { describe, it, expect } from "vitest";
import { createBubble } from "../../../../shared/src/layoutSchema";
import type { LetteringPreset } from "../../../../shared/src/presets";
import { buildStyleSfxPrompt, findStyleSfxTargets, parseStyleSfxAction } from "./styleSfxAction";

const presets: LetteringPreset[] = [{ id: "p1", name: "Manga SFX", text: {}, background: {} }];

describe("findStyleSfxTargets", () => {
  it("finds an effect bubble with text and no preset", () => {
    const bubble = createBubble({ id: "a", x: 0, y: 0, width: 10, height: 10, isEffect: true });
    bubble.text = { de: "BUMM" };
    expect(findStyleSfxTargets([bubble])).toEqual([{ bubbleId: "a", text: "BUMM" }]);
  });

  it("ignores a non-effect bubble", () => {
    const bubble = createBubble({ id: "a", x: 0, y: 0, width: 10, height: 10 });
    bubble.text = { de: "Hallo" };
    expect(findStyleSfxTargets([bubble])).toEqual([]);
  });

  it("ignores an effect bubble that already has a preset", () => {
    const bubble = createBubble({ id: "a", x: 0, y: 0, width: 10, height: 10, isEffect: true, presetId: "p1" });
    bubble.text = { de: "BUMM" };
    expect(findStyleSfxTargets([bubble])).toEqual([]);
  });
});

describe("buildStyleSfxPrompt", () => {
  it("returns an empty string with no presets configured", () => {
    expect(buildStyleSfxPrompt([{ bubbleId: "a", text: "BUMM" }], [])).toBe("");
  });

  it("lists available presets and target bubbles", () => {
    const prompt = buildStyleSfxPrompt([{ bubbleId: "a", text: "BUMM" }], presets);
    expect(prompt).toContain("id=p1");
    expect(prompt).toContain("Manga SFX");
  });
});

describe("parseStyleSfxAction", () => {
  const targets = [{ bubbleId: "a", text: "BUMM" }];

  it("parses a well-formed fenced JSON action", () => {
    const raw = '```json\n{"action":"style_sfx_bubbles","patches":[{"bubbleId":"a","presetId":"p1","rotation":-8,"note":"dynamisch"}]}\n```';
    expect(parseStyleSfxAction(raw, targets, presets)).toEqual({
      action: "style_sfx_bubbles",
      patches: [{ bubbleId: "a", presetId: "p1", rotation: -8, note: "dynamisch" }],
    });
  });

  it("drops a hallucinated presetId", () => {
    const raw = '```json\n{"action":"style_sfx_bubbles","patches":[{"bubbleId":"a","presetId":"nope","rotation":0,"note":"x"}]}\n```';
    expect(parseStyleSfxAction(raw, targets, presets)).toBeNull();
  });
});
