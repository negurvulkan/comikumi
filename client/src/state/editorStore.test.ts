import { describe, it, expect, beforeEach } from "vitest";
import { createBubble, createCurvedTextElement, createEmptyLayout, createImageElement, createPanel } from "../../../shared/src/layoutSchema";
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

describe("applyBubbleTextPatches", () => {
  beforeEach(resetStoreWithEmptyLayout);

  it("sets text[language] on each named bubble, leaving others untouched", () => {
    const a = createBubble({ id: "a", x: 0, y: 0, width: 10, height: 10 });
    const b = createBubble({ id: "b", x: 0, y: 0, width: 10, height: 10 });
    useEditorStore.setState((s) => ({ layout: { ...s.layout!, bubbles: [a, b] } }));

    useEditorStore.getState().applyBubbleTextPatches([
      { bubbleId: "a", language: "de", text: "Hallo" },
      { bubbleId: "b", language: "de", text: "Welt" },
    ]);

    const bubbles = useEditorStore.getState().layout!.bubbles;
    expect(bubbles.find((x) => x.id === "a")!.text.de).toBe("Hallo");
    expect(bubbles.find((x) => x.id === "b")!.text.de).toBe("Welt");
  });

  it("preserves a bubble's existing text in other languages", () => {
    const a = createBubble({ id: "a", x: 0, y: 0, width: 10, height: 10 });
    a.text = { en: "Hello" };
    useEditorStore.setState((s) => ({ layout: { ...s.layout!, bubbles: [a] } }));

    useEditorStore.getState().applyBubbleTextPatches([{ bubbleId: "a", language: "de", text: "Hallo" }]);

    const patched = useEditorStore.getState().layout!.bubbles[0];
    expect(patched.text).toEqual({ en: "Hello", de: "Hallo" });
  });

  it("silently skips patches for unknown bubbleIds", () => {
    const a = createBubble({ id: "a", x: 0, y: 0, width: 10, height: 10 });
    useEditorStore.setState((s) => ({ layout: { ...s.layout!, bubbles: [a] } }));

    useEditorStore.getState().applyBubbleTextPatches([{ bubbleId: "does-not-exist", language: "de", text: "Hallo" }]);

    expect(useEditorStore.getState().layout!.bubbles).toEqual([a]);
  });

  it("creates exactly one undo step for the whole batch and marks the layout dirty", () => {
    const a = createBubble({ id: "a", x: 0, y: 0, width: 10, height: 10 });
    const b = createBubble({ id: "b", x: 0, y: 0, width: 10, height: 10 });
    useEditorStore.setState((s) => ({ layout: { ...s.layout!, bubbles: [a, b] }, dirty: false }));

    useEditorStore.getState().applyBubbleTextPatches([
      { bubbleId: "a", language: "de", text: "Hallo" },
      { bubbleId: "b", language: "de", text: "Welt" },
    ]);

    expect(useEditorStore.getState().past.length).toBe(1);
    expect(useEditorStore.getState().dirty).toBe(true);
  });

  it("is a no-op when given an empty array (no history entry, no state change)", () => {
    useEditorStore.getState().applyBubbleTextPatches([]);
    expect(useEditorStore.getState().past.length).toBe(0);
  });

  it("is a no-op when there is no layout loaded", () => {
    useEditorStore.setState({ layout: null });
    useEditorStore.getState().applyBubbleTextPatches([{ bubbleId: "a", language: "de", text: "Hallo" }]);
    expect(useEditorStore.getState().layout).toBeNull();
  });
});

describe("applyBubblePatches", () => {
  beforeEach(resetStoreWithEmptyLayout);

  it("applies a DIFFERENT patch to each named bubble", () => {
    const a = createBubble({ id: "a", x: 0, y: 0, width: 10, height: 10 });
    const b = createBubble({ id: "b", x: 0, y: 0, width: 10, height: 10 });
    useEditorStore.setState((s) => ({ layout: { ...s.layout!, bubbles: [a, b] } }));

    useEditorStore.getState().applyBubblePatches([
      { bubbleId: "a", patch: { characterId: "c1" } },
      { bubbleId: "b", patch: { presetId: "p1", rotation: -8 } },
    ]);

    const bubbles = useEditorStore.getState().layout!.bubbles;
    expect(bubbles.find((x) => x.id === "a")!.characterId).toBe("c1");
    const patchedB = bubbles.find((x) => x.id === "b")!;
    expect(patchedB.presetId).toBe("p1");
    expect(patchedB.rotation).toBe(-8);
  });

  it("skips a locked bubble entirely", () => {
    const a = createBubble({ id: "a", x: 0, y: 0, width: 10, height: 10, locked: true });
    useEditorStore.setState((s) => ({ layout: { ...s.layout!, bubbles: [a] } }));

    useEditorStore.getState().applyBubblePatches([{ bubbleId: "a", patch: { characterId: "c1" } }]);

    expect(useEditorStore.getState().layout!.bubbles[0].characterId).toBeNull();
  });

  it("silently skips patches for unknown bubbleIds", () => {
    const a = createBubble({ id: "a", x: 0, y: 0, width: 10, height: 10 });
    useEditorStore.setState((s) => ({ layout: { ...s.layout!, bubbles: [a] } }));

    useEditorStore.getState().applyBubblePatches([{ bubbleId: "does-not-exist", patch: { characterId: "c1" } }]);

    expect(useEditorStore.getState().layout!.bubbles).toEqual([a]);
  });

  it("creates exactly one undo step for the whole batch and marks the layout dirty", () => {
    const a = createBubble({ id: "a", x: 0, y: 0, width: 10, height: 10 });
    useEditorStore.setState((s) => ({ layout: { ...s.layout!, bubbles: [a] }, dirty: false }));

    useEditorStore.getState().applyBubblePatches([{ bubbleId: "a", patch: { characterId: "c1" } }]);

    expect(useEditorStore.getState().past.length).toBe(1);
    expect(useEditorStore.getState().dirty).toBe(true);
  });

  it("is a no-op when given an empty array (no history entry, no state change)", () => {
    useEditorStore.getState().applyBubblePatches([]);
    expect(useEditorStore.getState().past.length).toBe(0);
  });

  it("is a no-op when there is no layout loaded", () => {
    useEditorStore.setState({ layout: null });
    useEditorStore.getState().applyBubblePatches([{ bubbleId: "a", patch: { characterId: "c1" } }]);
    expect(useEditorStore.getState().layout).toBeNull();
  });
});

describe("setUseCleanedBackground", () => {
  beforeEach(resetStoreWithEmptyLayout);

  it("flips the layout's useCleanedBackground flag and marks dirty", () => {
    useEditorStore.getState().setUseCleanedBackground(true);
    expect(useEditorStore.getState().layout!.useCleanedBackground).toBe(true);
    expect(useEditorStore.getState().dirty).toBe(true);
  });

  it("is a no-op (no history entry) when already at the requested value", () => {
    useEditorStore.setState((s) => ({ layout: { ...s.layout!, useCleanedBackground: true }, dirty: false }));
    useEditorStore.getState().setUseCleanedBackground(true);
    expect(useEditorStore.getState().past.length).toBe(0);
    expect(useEditorStore.getState().dirty).toBe(false);
  });

  it("is a no-op when there is no layout loaded", () => {
    useEditorStore.setState({ layout: null });
    useEditorStore.getState().setUseCleanedBackground(true);
    expect(useEditorStore.getState().layout).toBeNull();
  });
});

describe("addBubble", () => {
  beforeEach(resetStoreWithEmptyLayout);

  it("sets isEffect on the new bubble when opts.isEffect is true (the Effect tool)", () => {
    useEditorStore.getState().addBubble("rect", { x: 0, y: 0, width: 100, height: 50 }, { isEffect: true });
    expect(useEditorStore.getState().layout!.bubbles[0].isEffect).toBe(true);
  });

  it("leaves isEffect unset for a normal bubble (no opts)", () => {
    useEditorStore.getState().addBubble("rect", { x: 0, y: 0, width: 100, height: 50 });
    expect(useEditorStore.getState().layout!.bubbles[0].isEffect).toBeUndefined();
  });
});

describe("updateSelectedBubbles", () => {
  beforeEach(resetStoreWithEmptyLayout);

  it("applies the patch to every selected bubble, skips unselected and locked ones", () => {
    const a = createBubble({ id: "a", x: 0, y: 0, width: 10, height: 10 });
    const b = createBubble({ id: "b", x: 0, y: 0, width: 10, height: 10 });
    const lockedC = createBubble({ id: "c", x: 0, y: 0, width: 10, height: 10, locked: true });
    const untouched = createBubble({ id: "d", x: 0, y: 0, width: 10, height: 10 });
    useEditorStore.setState((s) => ({
      layout: { ...s.layout!, bubbles: [a, b, lockedC, untouched] },
      selectedBubbleIds: ["a", "b", "c"],
    }));

    useEditorStore.getState().updateSelectedBubbles({ fontSize: 40 });

    const bubbles = useEditorStore.getState().layout!.bubbles;
    expect(bubbles.find((x) => x.id === "a")!.fontSize).toBe(40);
    expect(bubbles.find((x) => x.id === "b")!.fontSize).toBe(40);
    expect(bubbles.find((x) => x.id === "c")!.fontSize).not.toBe(40); // locked
    expect(bubbles.find((x) => x.id === "d")!.fontSize).not.toBe(40); // not selected
  });

  it("creates one undo step and marks the layout dirty", () => {
    const a = createBubble({ id: "a", x: 0, y: 0, width: 10, height: 10 });
    useEditorStore.setState((s) => ({ layout: { ...s.layout!, bubbles: [a] }, selectedBubbleIds: ["a"] }));

    useEditorStore.getState().updateSelectedBubbles({ presetId: "preset-1" });

    expect(useEditorStore.getState().past.length).toBe(1);
    expect(useEditorStore.getState().dirty).toBe(true);
  });

  it("is a no-op (no history entry) when nothing selected qualifies", () => {
    const lockedOnly = createBubble({ id: "a", x: 0, y: 0, width: 10, height: 10, locked: true });
    useEditorStore.setState((s) => ({ layout: { ...s.layout!, bubbles: [lockedOnly] }, selectedBubbleIds: ["a"] }));

    useEditorStore.getState().updateSelectedBubbles({ fontSize: 40 });

    expect(useEditorStore.getState().past.length).toBe(0);
    expect(useEditorStore.getState().layout!.bubbles[0].fontSize).not.toBe(40);
  });
});

describe("setLockedForSelection", () => {
  beforeEach(resetStoreWithEmptyLayout);

  it("locks every selected element across bubbles/images/curvedTexts/panels, leaves the rest untouched", () => {
    const selectedBubble = createBubble({ id: "b1", x: 0, y: 0, width: 10, height: 10 });
    const otherBubble = createBubble({ id: "b2", x: 0, y: 0, width: 10, height: 10 });
    const panel = createPanel({ id: "p1", points: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }] });
    const otherPanel = createPanel({ id: "p2", points: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }] });
    useEditorStore.setState((s) => ({
      layout: { ...s.layout!, bubbles: [selectedBubble, otherBubble], panels: [panel, otherPanel] },
      selectedBubbleIds: ["b1"],
      selectedPanelIds: ["p1"],
    }));

    useEditorStore.getState().setLockedForSelection(true);

    const layout = useEditorStore.getState().layout!;
    expect(layout.bubbles.find((b) => b.id === "b1")!.locked).toBe(true);
    expect(layout.bubbles.find((b) => b.id === "b2")!.locked).toBeUndefined();
    expect(layout.panels.find((p) => p.id === "p1")!.locked).toBe(true);
    expect(layout.panels.find((p) => p.id === "p2")!.locked).toBeUndefined();
  });

  it("unlocking writes `locked: undefined` rather than `false` (dropped from JSON on save)", () => {
    const bubble = createBubble({ id: "b1", x: 0, y: 0, width: 10, height: 10, locked: true });
    useEditorStore.setState((s) => ({ layout: { ...s.layout!, bubbles: [bubble] }, selectedBubbleIds: ["b1"] }));

    useEditorStore.getState().setLockedForSelection(false);

    expect(useEditorStore.getState().layout!.bubbles[0].locked).toBeUndefined();
  });

  it("creates one undo step and marks the layout dirty", () => {
    const bubble = createBubble({ id: "b1", x: 0, y: 0, width: 10, height: 10 });
    useEditorStore.setState((s) => ({ layout: { ...s.layout!, bubbles: [bubble] }, selectedBubbleIds: ["b1"] }));

    useEditorStore.getState().setLockedForSelection(true);

    expect(useEditorStore.getState().past.length).toBe(1);
    expect(useEditorStore.getState().dirty).toBe(true);
  });

  it("is a no-op (no history entry) when nothing is selected", () => {
    const bubble = createBubble({ id: "b1", x: 0, y: 0, width: 10, height: 10 });
    useEditorStore.setState((s) => ({
      layout: { ...s.layout!, bubbles: [bubble] },
      selectedBubbleIds: [],
      selectedImageIds: [],
      selectedCurvedTextIds: [],
      selectedPanelIds: [],
    }));

    useEditorStore.getState().setLockedForSelection(true);

    expect(useEditorStore.getState().past.length).toBe(0);
    expect(useEditorStore.getState().layout!.bubbles[0].locked).toBeUndefined();
  });
});

describe("setAllPanelsLocked", () => {
  beforeEach(resetStoreWithEmptyLayout);

  it("locks/unlocks every panel on the page, leaves bubbles untouched", () => {
    const bubble = createBubble({ id: "b1", x: 0, y: 0, width: 10, height: 10 });
    const p1 = createPanel({ id: "p1", points: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }] });
    const p2 = createPanel({ id: "p2", points: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }] });
    useEditorStore.setState((s) => ({ layout: { ...s.layout!, bubbles: [bubble], panels: [p1, p2] } }));

    useEditorStore.getState().setAllPanelsLocked(true);
    let layout = useEditorStore.getState().layout!;
    expect(layout.panels.every((p) => p.locked)).toBe(true);
    expect(layout.bubbles[0].locked).toBeUndefined();

    useEditorStore.getState().setAllPanelsLocked(false);
    layout = useEditorStore.getState().layout!;
    expect(layout.panels.every((p) => !p.locked)).toBe(true);
  });

  it("is a no-op (no history entry) when the page has no panels", () => {
    useEditorStore.getState().setAllPanelsLocked(true);
    expect(useEditorStore.getState().past.length).toBe(0);
  });
});

describe("setPanelLockCascade", () => {
  beforeEach(resetStoreWithEmptyLayout);

  it("locks the panel and every bubble assigned to it, leaves other panels/bubbles untouched", () => {
    const assigned = createBubble({ id: "b1", x: 0, y: 0, width: 10, height: 10, panelId: "p1" });
    const unassigned = createBubble({ id: "b2", x: 0, y: 0, width: 10, height: 10 });
    const otherPanelBubble = createBubble({ id: "b3", x: 0, y: 0, width: 10, height: 10, panelId: "p2" });
    const p1 = createPanel({ id: "p1", points: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }] });
    const p2 = createPanel({ id: "p2", points: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }] });
    useEditorStore.setState((s) => ({
      layout: { ...s.layout!, bubbles: [assigned, unassigned, otherPanelBubble], panels: [p1, p2] },
    }));

    useEditorStore.getState().setPanelLockCascade("p1", true);

    const layout = useEditorStore.getState().layout!;
    expect(layout.panels.find((p) => p.id === "p1")!.locked).toBe(true);
    expect(layout.panels.find((p) => p.id === "p2")!.locked).toBeUndefined();
    expect(layout.bubbles.find((b) => b.id === "b1")!.locked).toBe(true);
    expect(layout.bubbles.find((b) => b.id === "b2")!.locked).toBeUndefined();
    expect(layout.bubbles.find((b) => b.id === "b3")!.locked).toBeUndefined();
  });

  it("creates one undo step for the whole cascade", () => {
    const bubble = createBubble({ id: "b1", x: 0, y: 0, width: 10, height: 10, panelId: "p1" });
    const p1 = createPanel({ id: "p1", points: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }] });
    useEditorStore.setState((s) => ({ layout: { ...s.layout!, bubbles: [bubble], panels: [p1] } }));

    useEditorStore.getState().setPanelLockCascade("p1", true);

    expect(useEditorStore.getState().past.length).toBe(1);
  });

  it("is a no-op (no history entry) when the panel doesn't exist", () => {
    useEditorStore.getState().setPanelLockCascade("missing", true);
    expect(useEditorStore.getState().past.length).toBe(0);
  });
});

describe("bringLayerToFront / sendLayerToBack", () => {
  beforeEach(resetStoreWithEmptyLayout);

  function setupLayout() {
    const image = createImageElement({ id: "i1", corners: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }], files: {} });
    const bubble = createBubble({ id: "b1", x: 0, y: 0, width: 10, height: 10 });
    const curvedText = createCurvedTextElement({ id: "c1", points: [{ x: 0, y: 0 }, { x: 1, y: 1 }, { x: 2, y: 2 }, { x: 3, y: 3 }] });
    useEditorStore.setState((s) => ({ layout: { ...s.layout!, images: [image], bubbles: [bubble], curvedTexts: [curvedText] } }));
  }

  it("bringLayerToFront moves the target (e.g. an image) above everything else, including bubbles", () => {
    setupLayout();
    // Default order is image, bubble, curvedText — bringing the image to front should
    // put it ahead of the bubble too, the motivating use case for this whole feature.
    useEditorStore.getState().bringLayerToFront({ type: "image", id: "i1" });

    const layout = useEditorStore.getState().layout!;
    const image = layout.images[0];
    const bubble = layout.bubbles[0];
    const curvedText = layout.curvedTexts[0];
    expect(image.layerOrderOverride).toBeGreaterThan(bubble.layerOrderOverride!);
    expect(image.layerOrderOverride).toBeGreaterThan(curvedText.layerOrderOverride!);
  });

  it("sendLayerToBack moves the target below everything else", () => {
    setupLayout();
    useEditorStore.getState().sendLayerToBack({ type: "curvedText", id: "c1" });

    const layout = useEditorStore.getState().layout!;
    expect(layout.curvedTexts[0].layerOrderOverride).toBeLessThan(layout.images[0].layerOrderOverride!);
    expect(layout.curvedTexts[0].layerOrderOverride).toBeLessThan(layout.bubbles[0].layerOrderOverride!);
  });

  it("creates one undo step and marks the layout dirty", () => {
    setupLayout();
    useEditorStore.getState().bringLayerToFront({ type: "bubble", id: "b1" });
    expect(useEditorStore.getState().past.length).toBe(1);
    expect(useEditorStore.getState().dirty).toBe(true);
  });

  it("is a no-op (no history entry) when the target isn't found", () => {
    setupLayout();
    useEditorStore.getState().bringLayerToFront({ type: "bubble", id: "missing" });
    expect(useEditorStore.getState().past.length).toBe(0);
  });

  it("is a no-op (no history entry) when the target is already at that end of the stack", () => {
    setupLayout();
    // curvedText is already last (frontmost) in the default order.
    useEditorStore.getState().bringLayerToFront({ type: "curvedText", id: "c1" });
    expect(useEditorStore.getState().past.length).toBe(0);
  });
});
