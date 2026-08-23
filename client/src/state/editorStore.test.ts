import { describe, it, expect, beforeEach } from "vitest";
import { createBubble, createEmptyLayout, createPanel } from "../../../shared/src/layoutSchema";
import { useEditorStore } from "./editorStore";

function seedLayout() {
  return createEmptyLayout("page_01", "page_01.png", 1000, 1000);
}

function setLayout(layout: ReturnType<typeof seedLayout>) {
  useEditorStore.setState({
    layout,
    selectedBubbleIds: [],
    selectedImageIds: [],
    selectedCurvedTextIds: [],
    selectedPanelIds: [],
    past: [],
    future: [],
  });
}

beforeEach(() => {
  setLayout(seedLayout());
});

describe("addPanel — auto-assign on creation", () => {
  it("assigns an unassigned bubble whose center falls inside the new panel, converting it to panel-relative coordinates", () => {
    const bubble = createBubble({ id: "b1", x: 30, y: 40, width: 10, height: 10 }); // center (35,45)
    setLayout({ ...seedLayout(), bubbles: [bubble] });

    useEditorStore.getState().addPanel([{ x: 20, y: 30 }, { x: 120, y: 30 }, { x: 120, y: 130 }, { x: 20, y: 130 }]);

    const layout = useEditorStore.getState().layout!;
    const panel = layout.panels[0];
    const b = layout.bubbles[0];
    expect(panel.origin).toEqual({ x: 20, y: 30 });
    expect(b.panelId).toBe(panel.id);
    // absolute (30,40) minus panel origin (20,30) = relative (10,10)
    expect(b.x).toBe(10);
    expect(b.y).toBe(10);
  });

  it("does not steal a bubble already assigned to a different panel, even if its center falls inside the new polygon", () => {
    const otherPanel = createPanel({ id: "other", points: [{ x: 0, y: 0 }, { x: 500, y: 0 }, { x: 500, y: 500 }, { x: 0, y: 500 }] });
    const bubble = { ...createBubble({ id: "b1", x: 30, y: 40, width: 10, height: 10 }), panelId: "other" };
    setLayout({ ...seedLayout(), panels: [otherPanel], bubbles: [bubble] });

    useEditorStore.getState().addPanel([{ x: 20, y: 30 }, { x: 120, y: 30 }, { x: 120, y: 130 }, { x: 20, y: 130 }]);

    const b = useEditorStore.getState().layout!.bubbles[0];
    expect(b.panelId).toBe("other");
    expect(b.x).toBe(30); // untouched
    expect(b.y).toBe(40);
  });

  it("leaves a bubble outside the new panel's polygon untouched", () => {
    const bubble = createBubble({ id: "b1", x: 900, y: 900, width: 10, height: 10 });
    setLayout({ ...seedLayout(), bubbles: [bubble] });

    useEditorStore.getState().addPanel([{ x: 20, y: 30 }, { x: 120, y: 30 }, { x: 120, y: 130 }, { x: 20, y: 130 }]);

    const b = useEditorStore.getState().layout!.bubbles[0];
    expect(b.panelId).toBeNull();
    expect(b.x).toBe(900);
  });
});

describe("reassignBubblePanel", () => {
  function twoPanelsLayout() {
    const panelA = createPanel({ id: "A", points: [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }, { x: 0, y: 100 }] });
    const panelB = createPanel({ id: "B", points: [{ x: 200, y: 200 }, { x: 300, y: 200 }, { x: 300, y: 300 }, { x: 200, y: 300 }] });
    return { panelA, panelB };
  }

  it("attaches an unassigned bubble (absolute -> relative)", () => {
    const { panelA } = twoPanelsLayout();
    const bubble = createBubble({ id: "b1", x: 10, y: 20, width: 5, height: 5 });
    setLayout({ ...seedLayout(), panels: [panelA], bubbles: [bubble] });

    useEditorStore.getState().reassignBubblePanel("b1", "A");

    const b = useEditorStore.getState().layout!.bubbles[0];
    expect(b.panelId).toBe("A");
    expect(b).toMatchObject({ x: 10, y: 20 }); // panelA's origin is (0,0) — no visible shift
  });

  it("detaches a child bubble (relative -> absolute)", () => {
    const { panelA } = twoPanelsLayout();
    const bubble = { ...createBubble({ id: "b1", x: 10, y: 20, width: 5, height: 5 }), panelId: "A" };
    setLayout({ ...seedLayout(), panels: [panelA], bubbles: [bubble] });

    useEditorStore.getState().reassignBubblePanel("b1", null);

    const b = useEditorStore.getState().layout!.bubbles[0];
    expect(b.panelId).toBeNull();
    expect(b).toMatchObject({ x: 10, y: 20 }); // panelA's origin is (0,0) — absolute value unchanged here
  });

  it("reparents directly from one panel to another with the correct combined offset", () => {
    const { panelA, panelB } = twoPanelsLayout();
    // Relative to panelA's origin (0,0) — absolute position is (10,20).
    const bubble = { ...createBubble({ id: "b1", x: 10, y: 20, width: 5, height: 5 }), panelId: "A" };
    setLayout({ ...seedLayout(), panels: [panelA, panelB], bubbles: [bubble] });

    useEditorStore.getState().reassignBubblePanel("b1", "B");

    const b = useEditorStore.getState().layout!.bubbles[0];
    expect(b.panelId).toBe("B");
    // absolute (10,20) minus panelB's origin (200,200) = (-190,-180)
    expect(b.x).toBe(-190);
    expect(b.y).toBe(-180);
  });

  it("is a no-op when reassigning to the same panel", () => {
    const { panelA } = twoPanelsLayout();
    const bubble = { ...createBubble({ id: "b1", x: 10, y: 20, width: 5, height: 5 }), panelId: "A" };
    setLayout({ ...seedLayout(), panels: [panelA], bubbles: [bubble] });
    const before = useEditorStore.getState().layout;

    useEditorStore.getState().reassignBubblePanel("b1", "A");

    expect(useEditorStore.getState().layout).toBe(before);
  });
});

describe("updateBubble — auto-detach", () => {
  it("detaches a child bubble whose geometry patch moves its center outside the panel", () => {
    const panel = createPanel({ id: "A", points: [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }, { x: 0, y: 100 }] });
    const bubble = { ...createBubble({ id: "b1", x: 10, y: 10, width: 10, height: 10 }), panelId: "A" }; // relative center (15,15), absolute (15,15)
    setLayout({ ...seedLayout(), panels: [panel], bubbles: [bubble] });

    useEditorStore.getState().updateBubble("b1", { x: 500, y: 500 }); // way outside panel A

    const b = useEditorStore.getState().layout!.bubbles[0];
    expect(b.panelId).toBeNull();
    // merged (relative 500,500) + origin (0,0) = absolute 500,500 — origin here is 0 so no shift needed
    expect(b.x).toBe(500);
    expect(b.y).toBe(500);
  });

  it("leaves a child bubble attached when the geometry patch keeps its center inside the panel", () => {
    const panel = createPanel({ id: "A", points: [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }, { x: 0, y: 100 }] });
    const bubble = { ...createBubble({ id: "b1", x: 10, y: 10, width: 10, height: 10 }), panelId: "A" };
    setLayout({ ...seedLayout(), panels: [panel], bubbles: [bubble] });

    useEditorStore.getState().updateBubble("b1", { x: 20, y: 20 });

    const b = useEditorStore.getState().layout!.bubbles[0];
    expect(b.panelId).toBe("A");
    expect(b.x).toBe(20);
  });

  it("never triggers the containment check for a non-geometry patch", () => {
    // Panel spans only x:[0,10] so this bubble's center is already outside it —
    // a contrived state that could only arise from a stale panel, used here purely to
    // prove that a text-only patch never runs the containment check at all.
    const panel = createPanel({ id: "A", points: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }] });
    const bubble = { ...createBubble({ id: "b1", x: 500, y: 500, width: 10, height: 10 }), panelId: "A" };
    setLayout({ ...seedLayout(), panels: [panel], bubbles: [bubble] });

    useEditorStore.getState().updateBubble("b1", { text: { de: "Hallo" } });

    const b = useEditorStore.getState().layout!.bubbles[0];
    expect(b.panelId).toBe("A");
    expect(b.text.de).toBe("Hallo");
  });
});

describe("removePanel", () => {
  it("detaches (not deletes) child bubbles, converting them back to absolute coordinates", () => {
    const panel = createPanel({ id: "A", points: [{ x: 20, y: 30 }, { x: 120, y: 30 }, { x: 120, y: 130 }, { x: 20, y: 130 }] });
    const child = { ...createBubble({ id: "b1", x: 10, y: 10, width: 5, height: 5 }), panelId: "A" };
    const other = createBubble({ id: "b2", x: 999, y: 999, width: 5, height: 5 });
    setLayout({ ...seedLayout(), panels: [panel], bubbles: [child, other] });

    useEditorStore.getState().removePanel("A");

    const layout = useEditorStore.getState().layout!;
    expect(layout.panels).toHaveLength(0);
    expect(layout.bubbles).toHaveLength(2);
    const b1 = layout.bubbles.find((b) => b.id === "b1")!;
    expect(b1.panelId).toBeNull();
    // relative (10,10) + origin (20,30) = absolute (30,40)
    expect(b1.x).toBe(30);
    expect(b1.y).toBe(40);
    const b2 = layout.bubbles.find((b) => b.id === "b2")!;
    expect(b2).toMatchObject({ x: 999, y: 999 }); // unrelated bubble untouched
  });
});

describe("nudgeSelected — no double-move when a panel and its child are both selected", () => {
  it("moves the child bubble's absolute position by exactly the nudge amount, not double", () => {
    const panel = createPanel({ id: "A", points: [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }, { x: 0, y: 100 }] });
    const child = { ...createBubble({ id: "b1", x: 10, y: 10, width: 5, height: 5 }), panelId: "A" };
    setLayout({ ...seedLayout(), panels: [panel], bubbles: [child] });
    useEditorStore.setState({ selectedPanelIds: ["A"], selectedBubbleIds: ["b1"] });

    useEditorStore.getState().nudgeSelected(7, 3);

    const layout = useEditorStore.getState().layout!;
    const newPanel = layout.panels[0];
    const newBubble = layout.bubbles[0];
    // Panel origin moved by the nudge amount...
    expect(newPanel.origin).toEqual({ x: 7, y: 3 });
    // ...and the bubble's own relative x/y is untouched (it rides along via the panel).
    expect(newBubble.x).toBe(10);
    expect(newBubble.y).toBe(10);
    // Absolute position (origin + relative) moved by exactly the nudge amount, once.
    expect(newPanel.origin.x + newBubble.x).toBe(17);
    expect(newPanel.origin.y + newBubble.y).toBe(13);
  });

  it("still moves an independently-selected bubble normally when its panel is not selected", () => {
    const panel = createPanel({ id: "A", points: [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }, { x: 0, y: 100 }] });
    const child = { ...createBubble({ id: "b1", x: 10, y: 10, width: 5, height: 5 }), panelId: "A" };
    setLayout({ ...seedLayout(), panels: [panel], bubbles: [child] });
    useEditorStore.setState({ selectedPanelIds: [], selectedBubbleIds: ["b1"] });

    useEditorStore.getState().nudgeSelected(7, 3);

    const b = useEditorStore.getState().layout!.bubbles[0];
    expect(b.x).toBe(17);
    expect(b.y).toBe(13);
  });
});

describe("duplicateSelected — panel/child id remapping", () => {
  it("repoints a duplicated child bubble at the duplicated panel's new id, not the original", () => {
    const panel = createPanel({ id: "A", points: [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }, { x: 0, y: 100 }] });
    const child = { ...createBubble({ id: "b1", x: 10, y: 10, width: 5, height: 5 }), panelId: "A" };
    setLayout({ ...seedLayout(), panels: [panel], bubbles: [child] });
    useEditorStore.setState({ selectedPanelIds: ["A"], selectedBubbleIds: ["b1"] });

    useEditorStore.getState().duplicateSelected();

    const layout = useEditorStore.getState().layout!;
    expect(layout.panels).toHaveLength(2);
    expect(layout.bubbles).toHaveLength(2);
    const newPanel = layout.panels.find((p) => p.id !== "A")!;
    const newBubble = layout.bubbles.find((b) => b.id !== "b1")!;
    expect(newBubble.panelId).toBe(newPanel.id);
    // no coordinate shift for the bubble itself — it stays at the same spot relative to
    // its (duplicated, offset) panel.
    expect(newBubble.x).toBe(10);
    expect(newBubble.y).toBe(10);
  });

  it("offsets an independently duplicated bubble normally when its panel isn't duplicated", () => {
    const panel = createPanel({ id: "A", points: [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }, { x: 0, y: 100 }] });
    const child = { ...createBubble({ id: "b1", x: 10, y: 10, width: 5, height: 5 }), panelId: "A" };
    setLayout({ ...seedLayout(), panels: [panel], bubbles: [child] });
    useEditorStore.setState({ selectedPanelIds: [], selectedBubbleIds: ["b1"] });

    useEditorStore.getState().duplicateSelected();

    const layout = useEditorStore.getState().layout!;
    expect(layout.panels).toHaveLength(1);
    const newBubble = layout.bubbles.find((b) => b.id !== "b1")!;
    expect(newBubble.panelId).toBe("A"); // still points at the original, undupliated panel
    expect(newBubble.x).toBe(34); // 10 + OFFSET(24)
    expect(newBubble.y).toBe(34);
  });
});

describe("locked — updateBubble/updatePanel/updateImage/updateCurvedText reject geometry patches", () => {
  it("updateBubble rejects a geometry patch on a locked bubble but allows a text/style patch", () => {
    const bubble = { ...createBubble({ id: "b1", x: 10, y: 10, width: 5, height: 5 }), locked: true };
    setLayout({ ...seedLayout(), bubbles: [bubble] });

    useEditorStore.getState().updateBubble("b1", { x: 999, y: 999 });
    expect(useEditorStore.getState().layout!.bubbles[0]).toMatchObject({ x: 10, y: 10 });

    useEditorStore.getState().updateBubble("b1", { text: { de: "Hallo" } });
    expect(useEditorStore.getState().layout!.bubbles[0].text.de).toBe("Hallo");
  });

  it("updatePanel rejects a points patch on a locked panel but allows a label/color patch", () => {
    const panel = { ...createPanel({ id: "p1", points: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }] }), locked: true };
    setLayout({ ...seedLayout(), panels: [panel] });

    useEditorStore.getState().updatePanel("p1", { points: [{ x: 999, y: 999 }, { x: 998, y: 998 }, { x: 997, y: 997 }] });
    expect(useEditorStore.getState().layout!.panels[0].points).toEqual(panel.points);

    useEditorStore.getState().updatePanel("p1", { label: "Splash" });
    expect(useEditorStore.getState().layout!.panels[0].label).toBe("Splash");
  });

  it("updatePanel rejects a languageOverride patch on a locked panel just like a points patch", () => {
    const panel = { ...createPanel({ id: "p1", points: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }] }), locked: true };
    setLayout({ ...seedLayout(), panels: [panel] });

    useEditorStore.getState().updatePanel("p1", {
      languageOverride: { de: { points: [{ x: 999, y: 999 }, { x: 998, y: 998 }, { x: 997, y: 997 }], origin: { x: 999, y: 999 } } },
    });

    expect(useEditorStore.getState().layout!.panels[0].languageOverride).toBeUndefined();
  });

  it("updateImage rejects a corners patch on a locked image but allows an opacity patch", () => {
    setLayout(seedLayout());
    useEditorStore.getState().addImage("poster.png", 100, 100, ["de"]);
    const imageId = useEditorStore.getState().layout!.images[0].id;
    useEditorStore.setState({
      layout: { ...useEditorStore.getState().layout!, images: [{ ...useEditorStore.getState().layout!.images[0], locked: true }] },
    });

    const before = useEditorStore.getState().layout!.images[0].corners;
    useEditorStore.getState().updateImage(imageId, { corners: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }] });
    expect(useEditorStore.getState().layout!.images[0].corners).toEqual(before);

    useEditorStore.getState().updateImage(imageId, { opacity: 0.5 });
    expect(useEditorStore.getState().layout!.images[0].opacity).toBe(0.5);
  });

  it("updateCurvedText rejects a points patch on a locked element but allows a text patch", () => {
    setLayout(seedLayout());
    useEditorStore.getState().addCurvedText();
    const elId = useEditorStore.getState().layout!.curvedTexts[0].id;
    useEditorStore.setState({
      layout: { ...useEditorStore.getState().layout!, curvedTexts: [{ ...useEditorStore.getState().layout!.curvedTexts[0], locked: true }] },
    });

    const before = useEditorStore.getState().layout!.curvedTexts[0].points;
    useEditorStore.getState().updateCurvedText(elId, { points: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }] });
    expect(useEditorStore.getState().layout!.curvedTexts[0].points).toEqual(before);

    useEditorStore.getState().updateCurvedText(elId, { text: { de: "BOOM" } });
    expect(useEditorStore.getState().layout!.curvedTexts[0].text.de).toBe("BOOM");
  });
});

describe("locked — removeSelected/duplicateSelected/nudgeSelected skip locked elements", () => {
  it("removeSelected leaves a locked, selected bubble in place (and still selected) but removes an unlocked one", () => {
    const locked = { ...createBubble({ id: "b1", x: 0, y: 0, width: 5, height: 5 }), locked: true };
    const unlocked = createBubble({ id: "b2", x: 0, y: 0, width: 5, height: 5 });
    setLayout({ ...seedLayout(), bubbles: [locked, unlocked] });
    useEditorStore.setState({ selectedBubbleIds: ["b1", "b2"] });

    useEditorStore.getState().removeSelected();

    const state = useEditorStore.getState();
    expect(state.layout!.bubbles.map((b) => b.id)).toEqual(["b1"]);
    expect(state.selectedBubbleIds).toEqual(["b1"]);
  });

  it("duplicateSelected produces no copy for a locked bubble/panel", () => {
    const lockedBubble = { ...createBubble({ id: "b1", x: 0, y: 0, width: 5, height: 5 }), locked: true };
    const lockedPanel = { ...createPanel({ id: "p1", points: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }] }), locked: true };
    setLayout({ ...seedLayout(), bubbles: [lockedBubble], panels: [lockedPanel] });
    useEditorStore.setState({ selectedBubbleIds: ["b1"], selectedPanelIds: ["p1"] });

    useEditorStore.getState().duplicateSelected();

    const layout = useEditorStore.getState().layout!;
    expect(layout.bubbles).toHaveLength(1);
    expect(layout.panels).toHaveLength(1);
  });

  it("nudgeSelected does not move a locked, selected bubble", () => {
    const locked = { ...createBubble({ id: "b1", x: 10, y: 10, width: 5, height: 5 }), locked: true };
    setLayout({ ...seedLayout(), bubbles: [locked] });
    useEditorStore.setState({ selectedBubbleIds: ["b1"] });

    useEditorStore.getState().nudgeSelected(5, 5);

    expect(useEditorStore.getState().layout!.bubbles[0]).toMatchObject({ x: 10, y: 10 });
  });
});

describe("addPanel — Cut-Panel creation", () => {
  it("marks the new panel as a Cut-Panel with cutOrigin equal to its own origin, when a hole-fill color is passed", () => {
    useEditorStore.getState().addPanel([{ x: 10, y: 10 }, { x: 30, y: 10 }, { x: 30, y: 30 }, { x: 10, y: 30 }], "#abcdef");

    const panel = useEditorStore.getState().layout!.panels[0];
    expect(panel.cut).toEqual({ cutOrigin: panel.origin, holeFill: { mode: "auto", color: "#abcdef" } });
  });

  it("creates a plain (non-cut) panel when no color is passed", () => {
    useEditorStore.getState().addPanel([{ x: 10, y: 10 }, { x: 30, y: 10 }, { x: 30, y: 30 }, { x: 10, y: 30 }]);

    expect(useEditorStore.getState().layout!.panels[0].cut).toBeUndefined();
  });
});

describe("duplicateSelected — Cut-Panel", () => {
  it("copies cut.cutOrigin unchanged onto the duplicate, so it shows the same source content at its new position", () => {
    useEditorStore.getState().addPanel([{ x: 10, y: 10 }, { x: 30, y: 10 }, { x: 30, y: 30 }, { x: 10, y: 30 }], "#abcdef");
    const original = useEditorStore.getState().layout!.panels[0];
    useEditorStore.setState({ selectedPanelIds: [original.id] });

    useEditorStore.getState().duplicateSelected();

    const duplicate = useEditorStore.getState().layout!.panels.find((p) => p.id !== original.id)!;
    expect(duplicate.cut!.cutOrigin).toEqual(original.cut!.cutOrigin);
    expect(duplicate.cut!.holeFill).toEqual(original.cut!.holeFill);
    // The duplicate's own origin moved by the duplicate OFFSET, so it now differs from
    // cutOrigin — it displays as "moved" content sourced from the same original region.
    expect(duplicate.origin).not.toEqual(duplicate.cut!.cutOrigin);
  });
});

describe("nudgeSelected/duplicateSelected — respect a per-language panel override", () => {
  it("nudgeSelected shifts the active language's override, not the base, when one exists", () => {
    const panel = {
      ...createPanel({ id: "p1", points: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }] }),
      languageOverride: {
        de: { points: [{ x: 50, y: 50 }, { x: 60, y: 50 }, { x: 60, y: 60 }], origin: { x: 50, y: 50 } },
      },
    };
    setLayout({ ...seedLayout(), panels: [panel] });
    useEditorStore.setState({ selectedPanelIds: ["p1"], activeLanguage: "de" });

    useEditorStore.getState().nudgeSelected(5, 5);

    const result = useEditorStore.getState().layout!.panels[0];
    // Base untouched...
    expect(result.points).toEqual(panel.points);
    // ...only the "de" override moved.
    expect(result.languageOverride!.de.origin).toEqual({ x: 55, y: 55 });
  });

  it("duplicateSelected shifts the active language's override on the copy, not the base", () => {
    const panel = {
      ...createPanel({ id: "p1", points: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }] }),
      languageOverride: {
        de: { points: [{ x: 50, y: 50 }, { x: 60, y: 50 }, { x: 60, y: 60 }], origin: { x: 50, y: 50 } },
      },
    };
    setLayout({ ...seedLayout(), panels: [panel] });
    useEditorStore.setState({ selectedPanelIds: ["p1"], activeLanguage: "de" });

    useEditorStore.getState().duplicateSelected();

    const copy = useEditorStore.getState().layout!.panels.find((p) => p.id !== "p1")!;
    expect(copy.points).toEqual(panel.points); // base copied unchanged
    expect(copy.languageOverride!.de.origin).toEqual({ x: 74, y: 74 }); // 50 + OFFSET(24)
  });
});
