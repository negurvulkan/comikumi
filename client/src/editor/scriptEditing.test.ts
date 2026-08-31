import { describe, it, expect } from "vitest";
import { createBubble, createEmptyLayout } from "../../../shared/src/layoutSchema";
import { scriptPageFromLayout } from "./scriptEditing";

describe("scriptPageFromLayout", () => {
  it("excludes effect (SFX) bubbles from the generated dialogue lines", () => {
    const layout = createEmptyLayout("page_01", "page_01.png", 1000, 1500);
    const dialogue = createBubble({ id: "b1", x: 0, y: 0, width: 100, height: 50, text: { ja: "こんにちは" } });
    const effect = createBubble({ id: "b2", x: 0, y: 60, width: 100, height: 50, text: { ja: "ドン" }, isEffect: true });
    layout.bubbles = [dialogue, effect];

    const scriptPage = scriptPageFromLayout("page_01", layout);
    const allDialogueLines = scriptPage.panels.flatMap((p) => p.dialogue);

    expect(allDialogueLines).toHaveLength(1);
    expect(allDialogueLines[0].text.ja).toBe("こんにちは");
  });
});
