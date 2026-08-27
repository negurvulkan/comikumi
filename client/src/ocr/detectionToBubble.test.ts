import { describe, it, expect } from "vitest";
import { detectionToBubble } from "./detectionToBubble";
import type { DetectedRegion } from "./types";

function region(overrides: Partial<DetectedRegion> = {}): DetectedRegion {
  return { id: "r1", x: 10, y: 20, width: 100, height: 50, recognizedText: "こんにちは", confidence: 0.9, ...overrides };
}

describe("detectionToBubble", () => {
  it("maps the detected rect onto the new bubble's geometry", () => {
    const bubble = detectionToBubble(region({ x: 10, y: 20, width: 100, height: 50 }), "ja");
    expect(bubble.shape).toBe("rect");
    expect(bubble).toMatchObject({ x: 10, y: 20, width: 100, height: 50 });
  });

  it("fills the recognized text into the given language code only", () => {
    const bubble = detectionToBubble(region({ recognizedText: "こんにちは" }), "ja");
    expect(bubble.text).toEqual({ ja: "こんにちは" });
  });

  it("generates a fresh id independent of the detection's own id", () => {
    const bubble = detectionToBubble(region({ id: "detected-region-1" }), "ja");
    expect(bubble.id).not.toBe("detected-region-1");
    expect(bubble.id.length).toBeGreaterThan(0);
  });

  it("two detections produce two bubbles with different ids", () => {
    const a = detectionToBubble(region({ id: "r1" }), "ja");
    const b = detectionToBubble(region({ id: "r2" }), "ja");
    expect(a.id).not.toBe(b.id);
  });

  it("leaves style/panel/character fields at createBubble()'s own defaults", () => {
    const bubble = detectionToBubble(region(), "ja");
    expect(bubble.panelId).toBeNull();
    expect(bubble.characterId).toBeNull();
    expect(bubble.bubbleStyle).toBe("none");
  });
});
