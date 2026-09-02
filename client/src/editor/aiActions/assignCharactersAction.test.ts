import { describe, it, expect } from "vitest";
import { createBubble } from "../../../../shared/src/layoutSchema";
import type { Character } from "../../../../shared/src/characters";
import { buildAssignCharactersPrompt, findAssignCharacterTargets, parseAssignCharactersAction } from "./assignCharactersAction";

const characters: Character[] = [{ id: "c1", name: "Aiko", color: "#6c8cff", voiceNotes: "" }];

describe("findAssignCharacterTargets", () => {
  it("finds a bubble with dialogue and no character assigned", () => {
    const bubble = createBubble({ id: "a", x: 0, y: 0, width: 10, height: 10 });
    bubble.text = { de: "Hallo" };
    expect(findAssignCharacterTargets([bubble], characters)).toEqual([{ bubbleId: "a", text: "Hallo" }]);
  });

  it("ignores a bubble that already has a character", () => {
    const bubble = createBubble({ id: "a", x: 0, y: 0, width: 10, height: 10, characterId: "c1" });
    bubble.text = { de: "Hallo" };
    expect(findAssignCharacterTargets([bubble], characters)).toEqual([]);
  });

  it("ignores an effect (SFX) bubble", () => {
    const bubble = createBubble({ id: "a", x: 0, y: 0, width: 10, height: 10, isEffect: true });
    bubble.text = { de: "BUMM" };
    expect(findAssignCharacterTargets([bubble], characters)).toEqual([]);
  });

  it("returns nothing when the project has no characters at all", () => {
    const bubble = createBubble({ id: "a", x: 0, y: 0, width: 10, height: 10 });
    bubble.text = { de: "Hallo" };
    expect(findAssignCharacterTargets([bubble], [])).toEqual([]);
  });
});

describe("buildAssignCharactersPrompt", () => {
  it("returns an empty string with no targets", () => {
    expect(buildAssignCharactersPrompt([], characters)).toBe("");
  });

  it("lists available characters and target bubbles", () => {
    const prompt = buildAssignCharactersPrompt([{ bubbleId: "a", text: "Hallo" }], characters);
    expect(prompt).toContain("id=c1");
    expect(prompt).toContain("Aiko");
    expect(prompt).toContain("bubbleId=a");
  });
});

describe("parseAssignCharactersAction", () => {
  const targets = [{ bubbleId: "a", text: "Hallo" }];

  it("parses a well-formed fenced JSON action", () => {
    const raw = '```json\n{"action":"assign_characters","patches":[{"bubbleId":"a","characterId":"c1","note":"spricht zuerst"}]}\n```';
    expect(parseAssignCharactersAction(raw, targets, characters)).toEqual({
      action: "assign_characters",
      patches: [{ bubbleId: "a", characterId: "c1", note: "spricht zuerst" }],
    });
  });

  it("drops a hallucinated characterId", () => {
    const raw = '```json\n{"action":"assign_characters","patches":[{"bubbleId":"a","characterId":"does-not-exist","note":"x"}]}\n```';
    expect(parseAssignCharactersAction(raw, targets, characters)).toBeNull();
  });
});
