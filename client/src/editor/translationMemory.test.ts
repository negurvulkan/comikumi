import { describe, it, expect } from "vitest";
import type { IndexedBubble } from "./projectSearchIndex";
import { findSimilarBubbles } from "./translationMemory";

function bubble(over: Partial<IndexedBubble>): IndexedBubble {
  return { volumeId: "v1", volumeLabel: "Volume 1", page: "page_01", bubbleId: "b1", text: {}, ...over };
}

describe("findSimilarBubbles", () => {
  it("ranks a near-identical bubble above a loosely related one", () => {
    const index = [
      bubble({ bubbleId: "b2", text: { de: "Ich hasse dich so sehr" } }),
      bubble({ bubbleId: "b3", text: { de: "Guten Morgen, wie geht es dir" } }),
    ];
    const results = findSimilarBubbles(index, "de", "Ich hasse dich sehr", "b1");
    expect(results[0].bubbleId).toBe("b2");
  });

  it("excludes the bubble currently being edited even if it's in the index", () => {
    const index = [bubble({ bubbleId: "b1", text: { de: "Ich hasse dich so sehr" } })];
    expect(findSimilarBubbles(index, "de", "Ich hasse dich so sehr", "b1")).toHaveLength(0);
  });

  it("only compares text in the requested language", () => {
    const index = [bubble({ bubbleId: "b2", text: { en: "I hate you so much" } })];
    expect(findSimilarBubbles(index, "de", "Ich hasse dich so sehr", "b1")).toHaveLength(0);
  });

  it("returns nothing for an empty query", () => {
    const index = [bubble({ bubbleId: "b2", text: { de: "Ich hasse dich so sehr" } })];
    expect(findSimilarBubbles(index, "de", "", "b1")).toHaveLength(0);
  });

  it("filters out matches below the minimum similarity score", () => {
    const index = [bubble({ bubbleId: "b2", text: { de: "Der Zug fährt heute Abend ab" } })];
    // Shares no meaningful overlap with a completely different sentence.
    expect(findSimilarBubbles(index, "de", "Ich mag Kekse", "b1")).toHaveLength(0);
  });

  it("respects the limit option", () => {
    const index = Array.from({ length: 10 }, (_, i) => bubble({ bubbleId: `b${i + 2}`, text: { de: "Ich hasse dich so sehr" } }));
    expect(findSimilarBubbles(index, "de", "Ich hasse dich so sehr", "b1", { limit: 3 })).toHaveLength(3);
  });
});
