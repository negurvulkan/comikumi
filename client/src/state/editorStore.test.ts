import { describe, it, expect, beforeEach } from "vitest";
import { createBubble, createEmptyLayout } from "../../../shared/src/layoutSchema";
import { useEditorStore } from "./editorStore";

function resetStoreWithEmptyLayout() {
  useEditorStore.setState({
    layout: createEmptyLayout("page_01", "page_01.png", 1000, 1500),
    past: [],
    future: [],
    selectedBubbleIds: ["stale"],
    dirty: false,
  });
}

describe("addBubbles", () => {
  beforeEach(resetStoreWithEmptyLayout);

  it("appends the given bubbles to the layout instead of replacing it", () => {
    const existing = createBubble({ id: "existing", x: 0, y: 0, width: 10, height: 10 });
    useEditorStore.setState((s) => ({ layout: { ...s.layout!, bubbles: [existing] } }));

    const newBubbles = [
      createBubble({ id: "a", x: 1, y: 1, width: 20, height: 20 }),
      createBubble({ id: "b", x: 2, y: 2, width: 30, height: 30 }),
    ];
    useEditorStore.getState().addBubbles(newBubbles);

    const ids = useEditorStore.getState().layout!.bubbles.map((b) => b.id);
    expect(ids).toEqual(["existing", "a", "b"]);
  });

  it("creates exactly one undo step for the whole batch", () => {
    const newBubbles = [
      createBubble({ id: "a", x: 1, y: 1, width: 20, height: 20 }),
      createBubble({ id: "b", x: 2, y: 2, width: 30, height: 30 }),
      createBubble({ id: "c", x: 3, y: 3, width: 40, height: 40 }),
    ];
    useEditorStore.getState().addBubbles(newBubbles);
    expect(useEditorStore.getState().past.length).toBe(1);
  });

  it("selects all newly added bubbles and marks the layout dirty", () => {
    const newBubbles = [
      createBubble({ id: "a", x: 1, y: 1, width: 20, height: 20 }),
      createBubble({ id: "b", x: 2, y: 2, width: 30, height: 30 }),
    ];
    useEditorStore.getState().addBubbles(newBubbles);

    expect(useEditorStore.getState().selectedBubbleIds).toEqual(["a", "b"]);
    expect(useEditorStore.getState().dirty).toBe(true);
  });

  it("is a no-op when given an empty array (no history entry, no state change)", () => {
    useEditorStore.getState().addBubbles([]);
    expect(useEditorStore.getState().past.length).toBe(0);
    expect(useEditorStore.getState().layout!.bubbles).toEqual([]);
  });

  it("is a no-op when there is no layout loaded", () => {
    useEditorStore.setState({ layout: null });
    useEditorStore.getState().addBubbles([createBubble({ id: "a", x: 0, y: 0, width: 10, height: 10 })]);
    expect(useEditorStore.getState().layout).toBeNull();
  });
});
