import { create } from "zustand";
import { v4 as uuid } from "uuid";
import type { Bubble, BubbleShapeKind, CurvedTextElement, ImageElement, PageLayout, Panel, Point } from "../../../shared/src/layoutSchema";
import { boxCorners, createBubble, createCurvedTextElement, createImageElement, createPanel } from "../../../shared/src/layoutSchema";
import { api } from "../api/client";

const MAX_HISTORY = 50;
// Rapid-fire updates (typing in a text field, dragging a handle across many
// mousemove events) would otherwise each become their own undo step — this
// coalesces a burst of updateBubble/updateImage/updateCurvedText/nudge calls
// that happen within the window into a single snapshot taken from BEFORE the
// burst started, so undo restores "before you started typing/dragging" in
// one step instead of one keystroke/pixel at a time.
const HISTORY_DEBOUNCE_MS = 600;

/** Shifts a bubble's position (and everything position-derived: quad corners, per-language form overrides) by (dx, dy). Deliberately does NOT touch `tail`/`tailAnchor` — those are already LOCAL, box-relative coordinates (see layoutSchema.ts), so they stay correct automatically when the box itself moves. */
function offsetBubble(b: Bubble, dx: number, dy: number): Bubble {
  return {
    ...b,
    x: b.x + dx,
    y: b.y + dy,
    corners: b.corners ? b.corners.map((c) => ({ x: c.x + dx, y: c.y + dy })) : b.corners,
    formOverride: b.formOverride
      ? Object.fromEntries(Object.entries(b.formOverride).map(([lang, f]) => [lang, { ...f, x: f.x + dx, y: f.y + dy }]))
      : b.formOverride,
  };
}

function offsetImage(img: ImageElement, dx: number, dy: number): ImageElement {
  return { ...img, corners: img.corners.map((c) => ({ x: c.x + dx, y: c.y + dy })) };
}

function offsetCurvedText(el: CurvedTextElement, dx: number, dy: number): CurvedTextElement {
  return { ...el, points: el.points.map((p) => ({ x: p.x + dx, y: p.y + dy })) };
}

function offsetPanel(p: Panel, dx: number, dy: number): Panel {
  return { ...p, points: p.points.map((pt) => ({ x: pt.x + dx, y: pt.y + dy })) };
}

interface EditorState {
  volumeId: string | null;
  page: string | null;
  layout: PageLayout | null;
  selectedBubbleIds: string[];
  selectedImageIds: string[];
  selectedCurvedTextIds: string[];
  selectedPanelIds: string[];
  activeLanguage: string;
  dirty: boolean;
  loading: boolean;
  error: string | null;
  saving: boolean;
  past: PageLayout[];
  future: PageLayout[];

  loadPage: (volumeId: string, page: string) => Promise<void>;
  setActiveLanguage: (code: string) => void;
  /** `additive` (shift-click) toggles the id within the current selection instead of replacing it — switching to a different element TYPE while additive always starts a fresh single-type selection (mixed-type multi-select isn't supported, keeps the inspector/bulk actions simple). */
  selectBubble: (id: string | null, additive?: boolean) => void;
  selectImage: (id: string | null, additive?: boolean) => void;
  selectCurvedText: (id: string | null, additive?: boolean) => void;
  selectPanel: (id: string | null, additive?: boolean) => void;
  deselectAll: () => void;
  addBubble: (shape: BubbleShapeKind, box: { x: number; y: number; width: number; height: number }) => void;
  updateBubble: (id: string, patch: Partial<Bubble>) => void;
  removeBubble: (id: string) => void;
  addImage: (fileName: string, naturalWidth: number, naturalHeight: number, languageCodes: string[]) => void;
  updateImage: (id: string, patch: Partial<ImageElement>) => void;
  removeImage: (id: string) => void;
  addCurvedText: () => void;
  updateCurvedText: (id: string, patch: Partial<CurvedTextElement>) => void;
  removeCurvedText: (id: string) => void;
  addPanel: (points: Point[]) => void;
  updatePanel: (id: string, patch: Partial<Panel>) => void;
  removePanel: (id: string) => void;
  importBubbles: (bubbles: Bubble[]) => void;
  save: () => Promise<void>;
  undo: () => void;
  redo: () => void;
  /** Deletes every currently-selected bubble/image/curved-text/panel element, across all four arrays at once. */
  removeSelected: () => void;
  /** Duplicates every currently-selected element (offset so copies don't sit exactly on top of the originals) and selects the new copies. */
  duplicateSelected: () => void;
  /** Moves every currently-selected element by (dx, dy) image px — used for arrow-key nudging. */
  nudgeSelected: (dx: number, dy: number) => void;
}

export const useEditorStore = create<EditorState>((set, get) => {
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;
  let pendingSnapshot: PageLayout | null = null;

  /** Captures the current layout onto the undo stack. `immediate: false` coalesces a burst of calls (see HISTORY_DEBOUNCE_MS) into one snapshot of the layout as it was before the burst started. */
  function pushHistory(immediate: boolean) {
    const { layout } = get();
    if (!layout) return;
    if (immediate) {
      if (debounceTimer) {
        clearTimeout(debounceTimer);
        debounceTimer = null;
        pendingSnapshot = null;
      }
      set((state) => ({ past: [...state.past, layout].slice(-MAX_HISTORY), future: [] }));
      return;
    }
    if (!debounceTimer) pendingSnapshot = layout;
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      if (pendingSnapshot) {
        const snapshot = pendingSnapshot;
        set((state) => ({ past: [...state.past, snapshot].slice(-MAX_HISTORY), future: [] }));
      }
      pendingSnapshot = null;
      debounceTimer = null;
    }, HISTORY_DEBOUNCE_MS);
  }

  function clearSelection() {
    return {
      selectedBubbleIds: [] as string[],
      selectedImageIds: [] as string[],
      selectedCurvedTextIds: [] as string[],
      selectedPanelIds: [] as string[],
    };
  }

  return {
    volumeId: null,
    page: null,
    layout: null,
    selectedBubbleIds: [],
    selectedImageIds: [],
    selectedCurvedTextIds: [],
    selectedPanelIds: [],
    activeLanguage: "de",
    dirty: false,
    loading: false,
    error: null,
    saving: false,
    past: [],
    future: [],

    async loadPage(volumeId, page) {
      set({ loading: true, error: null, ...clearSelection(), past: [], future: [], volumeId, page });
      try {
        const layout = await api.getLayout(volumeId, page);
        set({ layout, loading: false, dirty: false });
      } catch (e) {
        set({ loading: false, error: (e as Error).message });
      }
    },

    setActiveLanguage(code) {
      set({ activeLanguage: code });
    },

    selectBubble(id, additive = false) {
      if (id === null) {
        set(clearSelection());
        return;
      }
      const state = get();
      const switchingType = state.selectedImageIds.length > 0 || state.selectedCurvedTextIds.length > 0 || state.selectedPanelIds.length > 0;
      const base = additive && !switchingType ? state.selectedBubbleIds : [];
      const next = base.includes(id) ? base.filter((x) => x !== id) : [...base, id];
      set({ selectedBubbleIds: next, selectedImageIds: [], selectedCurvedTextIds: [], selectedPanelIds: [] });
    },

    selectImage(id, additive = false) {
      if (id === null) {
        set(clearSelection());
        return;
      }
      const state = get();
      const switchingType = state.selectedBubbleIds.length > 0 || state.selectedCurvedTextIds.length > 0 || state.selectedPanelIds.length > 0;
      const base = additive && !switchingType ? state.selectedImageIds : [];
      const next = base.includes(id) ? base.filter((x) => x !== id) : [...base, id];
      set({ selectedImageIds: next, selectedBubbleIds: [], selectedCurvedTextIds: [], selectedPanelIds: [] });
    },

    selectCurvedText(id, additive = false) {
      if (id === null) {
        set(clearSelection());
        return;
      }
      const state = get();
      const switchingType = state.selectedBubbleIds.length > 0 || state.selectedImageIds.length > 0 || state.selectedPanelIds.length > 0;
      const base = additive && !switchingType ? state.selectedCurvedTextIds : [];
      const next = base.includes(id) ? base.filter((x) => x !== id) : [...base, id];
      set({ selectedCurvedTextIds: next, selectedBubbleIds: [], selectedImageIds: [], selectedPanelIds: [] });
    },

    selectPanel(id, additive = false) {
      if (id === null) {
        set(clearSelection());
        return;
      }
      const state = get();
      const switchingType = state.selectedBubbleIds.length > 0 || state.selectedImageIds.length > 0 || state.selectedCurvedTextIds.length > 0;
      const base = additive && !switchingType ? state.selectedPanelIds : [];
      const next = base.includes(id) ? base.filter((x) => x !== id) : [...base, id];
      set({ selectedPanelIds: next, selectedBubbleIds: [], selectedImageIds: [], selectedCurvedTextIds: [] });
    },

    deselectAll() {
      set(clearSelection());
    },

    addBubble(shape, box) {
      const layout = get().layout;
      if (!layout) return;
      pushHistory(true);
      const bubble = createBubble({ id: uuid(), shape, ...box });
      set({
        layout: { ...layout, bubbles: [...layout.bubbles, bubble] },
        selectedBubbleIds: [bubble.id],
        selectedImageIds: [],
        selectedCurvedTextIds: [],
        selectedPanelIds: [],
        dirty: true,
      });
    },

    updateBubble(id, patch) {
      const layout = get().layout;
      if (!layout) return;
      pushHistory(false);
      set({
        layout: { ...layout, bubbles: layout.bubbles.map((b) => (b.id === id ? { ...b, ...patch } : b)) },
        dirty: true,
      });
    },

    removeBubble(id) {
      const layout = get().layout;
      if (!layout) return;
      pushHistory(true);
      set({
        layout: { ...layout, bubbles: layout.bubbles.filter((b) => b.id !== id) },
        selectedBubbleIds: get().selectedBubbleIds.filter((x) => x !== id),
        dirty: true,
      });
    },

    addImage(fileName, naturalWidth, naturalHeight, languageCodes) {
      const layout = get().layout;
      if (!layout) return;
      pushHistory(true);
      // Default placement: centered, scaled to ~35% of the page width, aspect preserved.
      const targetWidth = layout.imageWidth * 0.35;
      const aspect = naturalWidth > 0 ? naturalHeight / naturalWidth : 1;
      const targetHeight = targetWidth * aspect;
      const x = (layout.imageWidth - targetWidth) / 2;
      const y = (layout.imageHeight - targetHeight) / 2;
      const corners: Point[] = boxCorners(x, y, targetWidth, targetHeight);
      // Seed every known language with the same file so the image is visible
      // right away on any tab — the user then swaps in translated versions
      // per language as needed, same workflow as editing bubble text per tab.
      const files = Object.fromEntries(languageCodes.map((code) => [code, fileName]));
      const element = createImageElement({ id: uuid(), corners, files });
      set({
        layout: { ...layout, images: [...layout.images, element] },
        selectedImageIds: [element.id],
        selectedBubbleIds: [],
        selectedCurvedTextIds: [],
        selectedPanelIds: [],
        dirty: true,
      });
    },

    updateImage(id, patch) {
      const layout = get().layout;
      if (!layout) return;
      pushHistory(false);
      set({
        layout: { ...layout, images: layout.images.map((img) => (img.id === id ? { ...img, ...patch } : img)) },
        dirty: true,
      });
    },

    removeImage(id) {
      const layout = get().layout;
      if (!layout) return;
      pushHistory(true);
      set({
        layout: { ...layout, images: layout.images.filter((img) => img.id !== id) },
        selectedImageIds: get().selectedImageIds.filter((x) => x !== id),
        dirty: true,
      });
    },

    addCurvedText() {
      const layout = get().layout;
      if (!layout) return;
      pushHistory(true);
      // Default placement: centered, gentle upward arc, upper third of the
      // page — typical spot for a title/chapter-heading effect text.
      const width = layout.imageWidth * 0.4;
      const cx = layout.imageWidth / 2;
      const y = layout.imageHeight * 0.15;
      const arc = width * 0.18;
      const points: Point[] = [
        { x: cx - width / 2, y },
        { x: cx - width / 6, y: y - arc },
        { x: cx + width / 6, y: y - arc },
        { x: cx + width / 2, y },
      ];
      const element = createCurvedTextElement({ id: uuid(), points });
      set({
        layout: { ...layout, curvedTexts: [...layout.curvedTexts, element] },
        selectedCurvedTextIds: [element.id],
        selectedBubbleIds: [],
        selectedImageIds: [],
        selectedPanelIds: [],
        dirty: true,
      });
    },

    updateCurvedText(id, patch) {
      const layout = get().layout;
      if (!layout) return;
      pushHistory(false);
      set({
        layout: { ...layout, curvedTexts: layout.curvedTexts.map((el) => (el.id === id ? { ...el, ...patch } : el)) },
        dirty: true,
      });
    },

    removeCurvedText(id) {
      const layout = get().layout;
      if (!layout) return;
      pushHistory(true);
      set({
        layout: { ...layout, curvedTexts: layout.curvedTexts.filter((el) => el.id !== id) },
        selectedCurvedTextIds: get().selectedCurvedTextIds.filter((x) => x !== id),
        dirty: true,
      });
    },

    addPanel(points) {
      const layout = get().layout;
      if (!layout) return;
      pushHistory(true);
      const panel = createPanel({ id: uuid(), points });
      set({
        layout: { ...layout, panels: [...layout.panels, panel] },
        selectedPanelIds: [panel.id],
        selectedBubbleIds: [],
        selectedImageIds: [],
        selectedCurvedTextIds: [],
        dirty: true,
      });
    },

    updatePanel(id, patch) {
      const layout = get().layout;
      if (!layout) return;
      pushHistory(false);
      set({
        layout: { ...layout, panels: layout.panels.map((p) => (p.id === id ? { ...p, ...patch } : p)) },
        dirty: true,
      });
    },

    removePanel(id) {
      const layout = get().layout;
      if (!layout) return;
      pushHistory(true);
      set({
        layout: { ...layout, panels: layout.panels.filter((p) => p.id !== id) },
        selectedPanelIds: get().selectedPanelIds.filter((x) => x !== id),
        dirty: true,
      });
    },

    importBubbles(bubbles) {
      const layout = get().layout;
      if (!layout) return;
      pushHistory(true);
      set({ layout: { ...layout, bubbles }, ...clearSelection(), dirty: true });
    },

    async save() {
      const { volumeId, page, layout } = get();
      if (!volumeId || !page || !layout) return;
      set({ saving: true, error: null });
      try {
        await api.saveLayout(volumeId, page, layout);
        set({ saving: false, dirty: false });
      } catch (e) {
        set({ saving: false, error: (e as Error).message });
      }
    },

    undo() {
      const { past, layout } = get();
      if (past.length === 0 || !layout) return;
      const previous = past[past.length - 1];
      set((state) => ({
        layout: previous,
        past: state.past.slice(0, -1),
        future: [layout, ...state.future].slice(0, MAX_HISTORY),
        dirty: true,
        ...clearSelection(),
      }));
    },

    redo() {
      const { future, layout } = get();
      if (future.length === 0 || !layout) return;
      const next = future[0];
      set((state) => ({
        layout: next,
        future: state.future.slice(1),
        past: [...state.past, layout].slice(-MAX_HISTORY),
        dirty: true,
        ...clearSelection(),
      }));
    },

    removeSelected() {
      const layout = get().layout;
      if (!layout) return;
      const { selectedBubbleIds, selectedImageIds, selectedCurvedTextIds, selectedPanelIds } = get();
      if (selectedBubbleIds.length + selectedImageIds.length + selectedCurvedTextIds.length + selectedPanelIds.length === 0) return;
      pushHistory(true);
      set({
        layout: {
          ...layout,
          bubbles: layout.bubbles.filter((b) => !selectedBubbleIds.includes(b.id)),
          images: layout.images.filter((img) => !selectedImageIds.includes(img.id)),
          curvedTexts: layout.curvedTexts.filter((el) => !selectedCurvedTextIds.includes(el.id)),
          panels: layout.panels.filter((p) => !selectedPanelIds.includes(p.id)),
        },
        ...clearSelection(),
        dirty: true,
      });
    },

    duplicateSelected() {
      const layout = get().layout;
      if (!layout) return;
      const { selectedBubbleIds, selectedImageIds, selectedCurvedTextIds, selectedPanelIds } = get();
      if (selectedBubbleIds.length + selectedImageIds.length + selectedCurvedTextIds.length + selectedPanelIds.length === 0) return;
      pushHistory(true);
      const OFFSET = 24;
      const newBubbles = layout.bubbles.filter((b) => selectedBubbleIds.includes(b.id)).map((b) => offsetBubble({ ...b, id: uuid() }, OFFSET, OFFSET));
      const newImages = layout.images.filter((img) => selectedImageIds.includes(img.id)).map((img) => offsetImage({ ...img, id: uuid() }, OFFSET, OFFSET));
      const newCurvedTexts = layout.curvedTexts
        .filter((el) => selectedCurvedTextIds.includes(el.id))
        .map((el) => offsetCurvedText({ ...el, id: uuid() }, OFFSET, OFFSET));
      const newPanels = layout.panels.filter((p) => selectedPanelIds.includes(p.id)).map((p) => offsetPanel({ ...p, id: uuid() }, OFFSET, OFFSET));
      set({
        layout: {
          ...layout,
          bubbles: [...layout.bubbles, ...newBubbles],
          images: [...layout.images, ...newImages],
          curvedTexts: [...layout.curvedTexts, ...newCurvedTexts],
          panels: [...layout.panels, ...newPanels],
        },
        selectedBubbleIds: newBubbles.map((b) => b.id),
        selectedImageIds: newImages.map((i) => i.id),
        selectedCurvedTextIds: newCurvedTexts.map((e) => e.id),
        selectedPanelIds: newPanels.map((p) => p.id),
        dirty: true,
      });
    },

    nudgeSelected(dx, dy) {
      const layout = get().layout;
      if (!layout) return;
      const { selectedBubbleIds, selectedImageIds, selectedCurvedTextIds, selectedPanelIds } = get();
      if (selectedBubbleIds.length + selectedImageIds.length + selectedCurvedTextIds.length + selectedPanelIds.length === 0) return;
      pushHistory(false);
      set({
        layout: {
          ...layout,
          bubbles: layout.bubbles.map((b) => (selectedBubbleIds.includes(b.id) ? offsetBubble(b, dx, dy) : b)),
          images: layout.images.map((img) => (selectedImageIds.includes(img.id) ? offsetImage(img, dx, dy) : img)),
          curvedTexts: layout.curvedTexts.map((el) => (selectedCurvedTextIds.includes(el.id) ? offsetCurvedText(el, dx, dy) : el)),
          panels: layout.panels.map((p) => (selectedPanelIds.includes(p.id) ? offsetPanel(p, dx, dy) : p)),
        },
        dirty: true,
      });
    },
  };
});
