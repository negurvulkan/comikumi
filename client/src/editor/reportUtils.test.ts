import { describe, it, expect } from "vitest";
import { createBubble, createPanel } from "../../../shared/src/layoutSchema";
import type { Character } from "../../../shared/src/characters";
import {
  characterName,
  sortBubblesByPosition,
  groupBubblesByPanel,
  uniqueCharacterNames,
  charactersByPanel,
  getPageReadingOrder,
  moveBubbleInReadingOrder,
  NO_CHARACTER_LABEL,
  NO_PANEL_LABEL,
} from "./reportUtils";

function bubble(id: string, y: number, extra: Partial<Parameters<typeof createBubble>[0]> = {}) {
  return createBubble({ id, x: 0, y, width: 100, height: 50, ...extra });
}

function panel(id: string, minY: number, minX = 0, label = "") {
  return createPanel({ id, label, points: [{ x: minX, y: minY }, { x: minX + 100, y: minY }, { x: minX + 100, y: minY + 100 }] });
}

const characters: Character[] = [
  { id: "c1", name: "Kei", color: "#fff", voiceNotes: "" },
  { id: "c2", name: "Anna", color: "#000", voiceNotes: "" },
];

describe("characterName", () => {
  it("returns the placeholder for null/undefined/unknown ids", () => {
    expect(characterName(characters, null)).toBe(NO_CHARACTER_LABEL);
    expect(characterName(characters, undefined)).toBe(NO_CHARACTER_LABEL);
    expect(characterName(characters, "does-not-exist")).toBe(NO_CHARACTER_LABEL);
  });

  it("returns the matching character's name", () => {
    expect(characterName(characters, "c1")).toBe("Kei");
  });
});

describe("sortBubblesByPosition", () => {
  it("sorts by Y position with no overrides (stable, same as plain Y-sort)", () => {
    const bubbles = [bubble("b3", 300), bubble("b1", 100), bubble("b2", 200)];
    expect(sortBubblesByPosition(bubbles, "de").map((b) => b.id)).toEqual(["b1", "b2", "b3"]);
  });

  it("a readingOrderOverride slots a bubble anywhere regardless of its Y position", () => {
    const bubbles = [
      bubble("b1", 100, { readingOrderOverride: 2 }),
      bubble("b2", 200),
      bubble("b3", 300, { readingOrderOverride: 0 }),
    ];
    // auto ranks (by Y): b1=0, b2=1, b3=2. Effective keys: b1->2, b2->1(auto), b3->0.
    expect(sortBubblesByPosition(bubbles, "de").map((b) => b.id)).toEqual(["b3", "b2", "b1"]);
  });

  it("orders bubbles at roughly the same height (overlapping Y) by X, per readingDirection", () => {
    const bubbles = [bubble("b-left", 100, { x: 0 }), bubble("b-right", 105, { x: 300 })];
    expect(sortBubblesByPosition(bubbles, "de", "ltr").map((b) => b.id)).toEqual(["b-left", "b-right"]);
    expect(sortBubblesByPosition(bubbles, "de", "rtl").map((b) => b.id)).toEqual(["b-right", "b-left"]);
  });

  it("readingOrderOverride wins regardless of readingDirection", () => {
    const bubbles = [bubble("b-left", 100, { x: 0, readingOrderOverride: 1 }), bubble("b-right", 105, { x: 300, readingOrderOverride: 0 })];
    expect(sortBubblesByPosition(bubbles, "de", "ltr").map((b) => b.id)).toEqual(["b-right", "b-left"]);
    expect(sortBubblesByPosition(bubbles, "de", "rtl").map((b) => b.id)).toEqual(["b-right", "b-left"]);
  });

  it("non-overlapping Y ranges stay ordered purely by Y regardless of readingDirection", () => {
    const bubbles = [bubble("b-top", 0, { x: 300 }), bubble("b-bottom", 300, { x: 0 })];
    expect(sortBubblesByPosition(bubbles, "de", "ltr").map((b) => b.id)).toEqual(["b-top", "b-bottom"]);
    expect(sortBubblesByPosition(bubbles, "de", "rtl").map((b) => b.id)).toEqual(["b-top", "b-bottom"]);
  });
});

describe("groupBubblesByPanel", () => {
  it("groups bubbles under their panel in panel reading order, with an 'Ohne Panel' bucket last", () => {
    const p1 = panel("p1", 0);
    const p2 = panel("p2", 200);
    const bubbles = [
      bubble("b-unassigned", 50),
      bubble("b-p2", 250, { panelId: "p2" }),
      bubble("b-p1", 10, { panelId: "p1" }),
    ];
    const groups = groupBubblesByPanel(bubbles, [p2, p1], "de");
    expect(groups.map((g) => g.label)).toEqual(["Panel 2", "Panel 1", NO_PANEL_LABEL]);
    expect(groups[0].bubbles.map((b) => b.id)).toEqual(["b-p1"]);
    expect(groups[1].bubbles.map((b) => b.id)).toEqual(["b-p2"]);
    expect(groups[2].bubbles.map((b) => b.id)).toEqual(["b-unassigned"]);
    expect(groups.map((g) => g.panelId)).toEqual(["p1", "p2", null]);
  });

  it("still creates a group (with panelId set) for a panel with zero assigned bubbles", () => {
    const p1 = panel("p1", 0);
    const p2 = panel("p2", 200);
    const groups = groupBubblesByPanel([bubble("b-p2", 250, { panelId: "p2" })], [p1, p2], "de");
    expect(groups.map((g) => ({ panelId: g.panelId, count: g.bubbles.length }))).toEqual([
      { panelId: "p1", count: 0 },
      { panelId: "p2", count: 1 },
    ]);
  });

  it("treats a stale panelId (panel deleted) as unassigned", () => {
    const bubbles = [bubble("b1", 0, { panelId: "gone" })];
    const groups = groupBubblesByPanel(bubbles, [], "de");
    expect(groups).toHaveLength(1);
    expect(groups[0].label).toBe(NO_PANEL_LABEL);
  });

  it("omits the 'Ohne Panel' group entirely when every bubble is assigned", () => {
    const p1 = panel("p1", 0);
    const groups = groupBubblesByPanel([bubble("b1", 10, { panelId: "p1" })], [p1], "de");
    expect(groups.map((g) => g.label)).toEqual(["Panel 1"]);
  });

  it("excludes a Cut-Panel marked cut.removed entirely — its bubble falls to 'Ohne Panel' with panelId unchanged", () => {
    const removedPanel = { ...panel("p2", 200), cut: { cutOrigin: { x: 0, y: 0 }, holeFill: { mode: "auto" as const, color: "#fff" }, removed: true } };
    const b = bubble("b-removed", 210, { panelId: "p2" });
    const groups = groupBubblesByPanel([b], [removedPanel], "de");

    expect(groups.map((g) => g.panelId)).toEqual([null]);
    expect(groups[0].bubbles.map((x) => x.id)).toEqual(["b-removed"]);
    // Structurally untouched — still points at the removed panel, not detached/rewritten.
    expect(b.panelId).toBe("p2");
  });

  it("a panel removed only via a language override stays visible in other languages, but not the overridden one", () => {
    const base = panel("p1", 0);
    const removedInDe = {
      ...base,
      languageOverride: {
        de: {
          points: base.points,
          origin: base.origin,
          cut: { cutOrigin: base.origin, holeFill: { mode: "auto" as const, color: "#fff" }, removed: true },
        },
      },
    };
    const b = bubble("b1", 10, { panelId: "p1" });

    const jaGroups = groupBubblesByPanel([b], [removedInDe], "ja");
    expect(jaGroups.map((g) => g.panelId)).toEqual(["p1"]);

    const deGroups = groupBubblesByPanel([b], [removedInDe], "de");
    expect(deGroups.map((g) => g.panelId)).toEqual([null]);
  });

  it("orders two panels at roughly the same height (overlapping Y) by X, per readingDirection", () => {
    const pLeft = panel("p-left", 0, 0, "Left");
    const pRight = panel("p-right", 5, 300, "Right");
    expect(groupBubblesByPanel([], [pRight, pLeft], "de", "ltr").map((g) => g.label)).toEqual(["Left", "Right"]);
    expect(groupBubblesByPanel([], [pRight, pLeft], "de", "rtl").map((g) => g.label)).toEqual(["Right", "Left"]);
  });
});

describe("uniqueCharacterNames", () => {
  it("returns unique, alphabetically sorted names, ignoring unassigned/unknown ids", () => {
    const bubbles = [
      bubble("b1", 0, { characterId: "c2" }),
      bubble("b2", 10, { characterId: "c1" }),
      bubble("b3", 20, { characterId: "c1" }),
      bubble("b4", 30, { characterId: null }),
      bubble("b5", 40, { characterId: "unknown" }),
    ];
    expect(uniqueCharacterNames(bubbles, characters)).toEqual(["Anna", "Kei"]);
  });
});

describe("charactersByPanel", () => {
  it("lists character names per panel in reading order, omitting panels with none", () => {
    const p1 = panel("p1", 0);
    const p2 = panel("p2", 200);
    const bubbles = [bubble("b1", 10, { panelId: "p1", characterId: "c1" })];
    const result = charactersByPanel(bubbles, [p1, p2], characters, "de");
    expect(result).toEqual([{ label: "Panel 1", characterNames: ["Kei"] }]);
  });

  it("excludes a Cut-Panel marked cut.removed even if it has assigned characters", () => {
    const removedPanel = { ...panel("p1", 0), cut: { cutOrigin: { x: 0, y: 0 }, holeFill: { mode: "auto" as const, color: "#fff" }, removed: true } };
    const bubbles = [bubble("b1", 10, { panelId: "p1", characterId: "c1" })];
    expect(charactersByPanel(bubbles, [removedPanel], characters, "de")).toEqual([]);
  });
});

describe("getPageReadingOrder", () => {
  it("flattens panel groups + unassigned bucket into one page-wide reading order", () => {
    const p1 = panel("p1", 0);
    const bubbles = [bubble("b-unassigned", 5), bubble("b-p1", 10, { panelId: "p1" })];
    expect(getPageReadingOrder(bubbles, [p1], "de").map((b) => b.id)).toEqual(["b-p1", "b-unassigned"]);
  });
});

describe("moveBubbleInReadingOrder", () => {
  it("swaps a bubble with its neighbor and renumbers the whole group densely", () => {
    const bubbles = [bubble("b1", 0), bubble("b2", 10), bubble("b3", 20)];
    const patches = moveBubbleInReadingOrder(bubbles, [], "de", "b2", "up");
    expect(patches).toEqual([
      { id: "b2", readingOrderOverride: 0 },
      { id: "b1", readingOrderOverride: 1 },
      { id: "b3", readingOrderOverride: 2 },
    ]);
  });

  it("returns [] when moving the first bubble up or the last bubble down (out of bounds)", () => {
    const bubbles = [bubble("b1", 0), bubble("b2", 10)];
    expect(moveBubbleInReadingOrder(bubbles, [], "de", "b1", "up")).toEqual([]);
    expect(moveBubbleInReadingOrder(bubbles, [], "de", "b2", "down")).toEqual([]);
  });

  it("returns [] for an unknown bubble id", () => {
    expect(moveBubbleInReadingOrder([bubble("b1", 0)], [], "de", "missing", "up")).toEqual([]);
  });

  it("only reorders within the bubble's own group, not across panels", () => {
    const p1 = panel("p1", 0);
    const bubbles = [bubble("b-p1", 10, { panelId: "p1" }), bubble("b-unassigned", 20)];
    // b-p1 is the only bubble in its group — moving it can't go anywhere.
    expect(moveBubbleInReadingOrder(bubbles, [p1], "de", "b-p1", "down")).toEqual([]);
  });
});
