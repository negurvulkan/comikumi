import { create } from "zustand";
import { v4 as uuid } from "uuid";
import type { Bubble, BubbleShapeKind, CurvedTextElement, ImageElement, LayerItem, PageLayout, Panel, PanelCut, Point } from "../../../shared/src/layoutSchema";
import {
  boxCorners,
  createBubble,
  createCurvedTextElement,
  createImageElement,
  createPanel,
  offsetBubble,
  pageLayerOrder,
  withLayerOrder,
} from "../../../shared/src/layoutSchema";
import { bubbleCenter, pointInQuad } from "../editor/geometry";
import { api } from "../api/client";
import i18n from "../i18n";
import { translateApiError } from "../i18n/translateApiError";

const MAX_HISTORY = 50;
// Rapid-fire updates (typing in a text field, dragging a handle across many
// mousemove events) would otherwise each become their own undo step — this
// coalesces a burst of updateBubble/updateImage/updateCurvedText/nudge calls
// that happen within the window into a single snapshot taken from BEFORE the
// burst started, so undo restores "before you started typing/dragging" in
// one step instead of one keystroke/pixel at a time.
const HISTORY_DEBOUNCE_MS = 600;

function offsetImage(img: ImageElement, dx: number, dy: number): ImageElement {
  return { ...img, corners: img.corners.map((c) => ({ x: c.x + dx, y: c.y + dy })) };
}

function offsetCurvedText(el: CurvedTextElement, dx: number, dy: number): CurvedTextElement {
  return { ...el, points: el.points.map((p) => ({ x: p.x + dx, y: p.y + dy })) };
}

/** Shifts a whole panel rigidly by (dx, dy) — moves `origin` in lockstep with `points`,
 * since this is a deliberate whole-panel translate (nudge/duplicate), not a reshape. See
 * PanelPointsSchema.origin's doc comment for why a vertex-only reshape must never do
 * this. If a `languageOverride` already exists for `languageCode`, shifts THAT entry's
 * points/origin instead of the base fields — same "opt in per language" pattern as
 * PanelShape.tsx's commitPanel, so nudging/duplicating a panel currently showing a
 * language-specific position moves that position, not the (possibly different) base one. */
function offsetPanel(p: Panel, dx: number, dy: number, languageCode: string): Panel {
  const override = p.languageOverride?.[languageCode];
  if (override) {
    return {
      ...p,
      languageOverride: {
        ...p.languageOverride,
        [languageCode]: {
          ...override,
          points: override.points.map((pt) => ({ x: pt.x + dx, y: pt.y + dy })),
          origin: { x: override.origin.x + dx, y: override.origin.y + dy },
        },
      },
    };
  }
  return { ...p, points: p.points.map((pt) => ({ x: pt.x + dx, y: pt.y + dy })), origin: { x: p.origin.x + dx, y: p.origin.y + dy } };
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
  /** ETag of the layout as last loaded/saved — sent as If-Match on the next save so the
   * server can detect someone else having saved this same page in the meantime (see
   * server/src/routes/layout.ts). Null while nothing's been loaded yet. */
  layoutEtag: string | null;
  /** Set instead of `error` when a save hits a 409 — the page was saved by someone else
   * since this session last loaded/saved it. `serverLayout` is what they saved (null if
   * the conflict body couldn't be parsed), shown by LayoutConflictModal.tsx so the user
   * can choose to keep their own version or take the other one. */
  conflict: { serverLayout: PageLayout | null } | null;
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
  addBubble: (
    shape: BubbleShapeKind,
    box: { x: number; y: number; width: number; height: number },
    opts?: { isEffect?: boolean }
  ) => void;
  updateBubble: (id: string, patch: Partial<Bubble>) => void;
  removeBubble: (id: string) => void;
  addImage: (fileName: string, naturalWidth: number, naturalHeight: number, languageCodes: string[]) => void;
  updateImage: (id: string, patch: Partial<ImageElement>) => void;
  removeImage: (id: string) => void;
  addCurvedText: () => void;
  updateCurvedText: (id: string, patch: Partial<CurvedTextElement>) => void;
  removeCurvedText: (id: string) => void;
  /** Always creates a plain reference-only Panel — its optional Cut-Panel behavior (see
   * shared/src/layoutSchema.ts's Panel.cut doc comment) is activated afterward from
   * PanelInspector.tsx, not at creation time. */
  /** `initialCut`, when given, seeds the new panel's BASE `cut` field directly (used by
   * the panel-grid quick-start templates to create panels that are immediately ready
   * for "replace with own image" content in every language) — optional and additive,
   * the plain Panel drawing tool never passes it. */
  addPanel: (points: Point[], initialCut?: PanelCut) => void;
  updatePanel: (id: string, patch: Partial<Panel>) => void;
  removePanel: (id: string) => void;
  /** Single choke point for every manual panel (re)assignment/detachment — converts the
   * bubble's coordinates between absolute and panel-relative as needed so it never visibly
   * jumps. `newPanelId: null` detaches back to absolute. */
  reassignBubblePanel: (bubbleId: string, newPanelId: string | null) => void;
  importBubbles: (bubbles: Bubble[]) => void;
  /** Appends `bubbles` to the layout (unlike importBubbles(), which replaces the whole
   * array) as ONE undo step, and selects all of them — for batch inserts like accepted
   * Auto-Bubbles/OCR detections, where "detected 12 bubbles" should undo in one Ctrl+Z,
   * not twelve. */
  addBubbles: (bubbles: Bubble[]) => void;
  /** Sets `text[language]` on each named EXISTING bubble as ONE undo step — the
   * apply-side of the AI assistant's "translate missing bubbles" action
   * (see aiTranslateAction.ts/AiTranslateReviewPanel.tsx), same batch-in-one-step
   * shape as addBubbles() above but patching rather than inserting. Unknown bubbleIds
   * are silently skipped (defense in depth — the caller already filters against real
   * targets, see parseTranslateAction()'s doc comment). Just another local edit: marks
   * `dirty`, no server call — goes through the normal save() flow like anything else. */
  applyBubbleTextPatches: (patches: { bubbleId: string; language: string; text: string }[]) => void;
  /** Applies a DIFFERENT field patch to each named EXISTING bubble as ONE undo step —
   * the generic apply-side for the AI assistant's field-patch actions (fix overflow,
   * assign characters, style SFX bubbles — see client/src/editor/aiActions/), which
   * unlike applyBubbleTextPatches() above don't all touch the same field. A locked
   * bubble is skipped entirely (same "AI suggestions never override an explicit user
   * lock" rule as every other mutator here), as is an unknown bubbleId. */
  applyBubblePatches: (patches: { bubbleId: string; patch: Partial<Bubble> }[]) => void;
  /** Toggles between the raw scan and the server's cached cleaned (text-removed)
   * version — see server/src/lib/inpainting.ts, CleanPageReviewPanel.tsx. One undo
   * step, marks `dirty`; the actual pixels never live in the layout JSON itself (just
   * this flag), so this is a cheap, instant toggle either direction, not a re-render
   * of anything heavy. */
  setUseCleanedBackground: (value: boolean) => void;
  /** Non-destructive merge of every selected, unlocked, non-"quad" bubble (see
   * Bubble.mergeGroupId/mergePrimary in shared/src/layoutSchema.ts) — a no-op if fewer
   * than 2 such bubbles are selected. */
  mergeSelectedBubbles: () => void;
  /** Un-merges every merge group touched by the current selection (the WHOLE group, not
   * just the selected members — see the implementation's doc comment for why). */
  unmergeSelectedBubbles: () => void;
  save: () => Promise<void>;
  /** Resolves a save conflict by overwriting the server's version with the current
   * local layout — an unconditional save (no If-Match), then refreshes layoutEtag from
   * the response. */
  resolveConflictOverwrite: () => Promise<void>;
  /** Resolves a save conflict by discarding local changes and reloading the page —
   * equivalent to loadPage() with the same volumeId/page. */
  resolveConflictReload: () => Promise<void>;
  undo: () => void;
  redo: () => void;
  /** Deletes every currently-selected bubble/image/curved-text/panel element, across all four arrays at once. */
  removeSelected: () => void;
  /** Duplicates every currently-selected element (offset so copies don't sit exactly on top of the originals) and selects the new copies. */
  duplicateSelected: () => void;
  /** Moves every currently-selected element by (dx, dy) image px — used for arrow-key nudging. */
  nudgeSelected: (dx: number, dy: number) => void;
  /** Applies the same field patch to every currently-selected, unlocked bubble at once —
   * the bulk-edit primitive behind MultiSelectInspector's preset/padding/font-size
   * controls. A no-op (no history entry) if no selected bubble qualifies. Deliberately
   * bubble-only (not images/curved texts/panels) — the fields it's used for (presetId,
   * paddingRatio, fontSize) only exist on Bubble. */
  updateSelectedBubbles: (patch: Partial<Bubble>) => void;
  /** Sets/clears `locked` on every currently-selected element across all four arrays at
   * once — the bulk counterpart to LockToggleHandle.tsx's per-element toggle, for a
   * multi-selection (shift-click or the LayersPanel navigator). A no-op (no history
   * entry) when nothing is selected. */
  setLockedForSelection: (locked: boolean) => void;
  /** Sets/clears `locked` on every panel on the page — bubbles/images/curved texts are
   * untouched. */
  setAllPanelsLocked: (locked: boolean) => void;
  /** Sets/clears `locked` on one panel AND every bubble assigned to it
   * (`bubble.panelId === panelId`) — images/curved texts have no `panelId` (see
   * layoutSchema.ts) and are never part of a panel's lock cascade. A no-op if the panel
   * doesn't exist. */
  setPanelLockCascade: (panelId: string, locked: boolean) => void;
  /** Moves one bubble/image/curved text to the very top or bottom of the page's paint
   * order (see layoutSchema.ts's pageLayerOrder/withLayerOrder) — the Layers navigator's
   * and the bubble context menu's "bring to front"/"send to back" actions. A no-op (no
   * history entry) if the target isn't found or is already at that end of the stack. */
  bringLayerToFront: (target: LayerItem) => void;
  sendLayerToBack: (target: LayerItem) => void;
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
    layoutEtag: null,
    conflict: null,
    past: [],
    future: [],

    async loadPage(volumeId, page) {
      set({ loading: true, error: null, conflict: null, ...clearSelection(), past: [], future: [], volumeId, page });
      try {
        const { layout, etag } = await api.getLayoutWithEtag(volumeId, page);
        set({ layout, layoutEtag: etag, loading: false, dirty: false });
      } catch (e) {
        set({ loading: false, error: translateApiError(e, i18n.t) });
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

    addBubble(shape, box, opts) {
      const layout = get().layout;
      if (!layout) return;
      pushHistory(true);
      const bubble = createBubble({ id: uuid(), shape, ...box, ...(opts?.isEffect ? { isEffect: true } : {}) });
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
      // A patch touching the bubble's own geometry (drag/resize/rotate) can move a child
      // bubble's center outside its panel's polygon — auto-detach back to absolute
      // coordinates in that case (see reassignBubblePanel for the manual equivalent). Text/
      // style/tail-only patches never touch these fields, so they never trigger this check.
      const geometryChanged = "x" in patch || "y" in patch || "width" in patch || "height" in patch || "corners" in patch || "rotation" in patch;
      set({
        layout: {
          ...layout,
          bubbles: layout.bubbles.map((b) => {
            if (b.id !== id) return b;
            // A locked bubble rejects any geometry patch wholesale (drag/resize/rotate
            // handlers never mix geometry with text/style in one patch, so this is safe) —
            // the panel auto-detach check below is geometry-dependent too, so it correctly
            // never runs for a locked bubble either.
            if (geometryChanged && b.locked) return b;
            const merged = { ...b, ...patch };
            if (!geometryChanged || !merged.panelId) return merged;
            const panel = layout.panels.find((p) => p.id === merged.panelId);
            if (!panel) return merged; // stale panelId — already treated as unassigned elsewhere
            const center = bubbleCenter(merged);
            const absoluteCenter = { x: panel.origin.x + center.x, y: panel.origin.y + center.y };
            if (pointInQuad(absoluteCenter, panel.points)) return merged;
            return { ...offsetBubble(merged, panel.origin.x, panel.origin.y), panelId: null };
          }),
        },
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
      // See updateBubble's comment — a locked element rejects a geometry patch wholesale.
      const geometryChanged = "corners" in patch;
      set({
        layout: {
          ...layout,
          images: layout.images.map((img) => (img.id === id ? (geometryChanged && img.locked ? img : { ...img, ...patch }) : img)),
        },
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
      // See updateBubble's comment — a locked element rejects a geometry patch wholesale.
      const geometryChanged = "points" in patch;
      set({
        layout: {
          ...layout,
          curvedTexts: layout.curvedTexts.map((el) => (el.id === id ? (geometryChanged && el.locked ? el : { ...el, ...patch }) : el)),
        },
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

    addPanel(points, initialCut) {
      const layout = get().layout;
      if (!layout) return;
      pushHistory(true);
      const panel = createPanel({ id: uuid(), points, cut: initialCut });
      // Auto-assign: any bubble not already belonging to another panel whose center falls
      // inside the new polygon becomes a child (coordinates converted to panel-relative).
      // Bubbles already assigned elsewhere are left alone — no stealing.
      const bubbles = layout.bubbles.map((b) => {
        if (b.panelId) return b;
        if (!pointInQuad(bubbleCenter(b), panel.points)) return b;
        return offsetBubble({ ...b, panelId: panel.id }, -panel.origin.x, -panel.origin.y);
      });
      set({
        layout: { ...layout, panels: [...layout.panels, panel], bubbles },
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
      // See updateBubble's comment — a locked element rejects a geometry patch wholesale.
      // `languageOverride` is included too — a per-language move/reshape (see
      // PanelShape.tsx's commitPanel) is still a geometry change and must be blocked the
      // same as a base `points` patch.
      const geometryChanged = "points" in patch || "languageOverride" in patch;
      set({
        layout: {
          ...layout,
          panels: layout.panels.map((p) => (p.id === id ? (geometryChanged && p.locked ? p : { ...p, ...patch }) : p)),
        },
        dirty: true,
      });
    },

    removePanel(id) {
      const layout = get().layout;
      if (!layout) return;
      pushHistory(true);
      const panel = layout.panels.find((p) => p.id === id);
      // Children are detached (converted back to absolute coordinates), not deleted —
      // same "stale reference = unassigned" convention as deleted Characters/Presets.
      const bubbles = panel
        ? layout.bubbles.map((b) => (b.panelId === id ? { ...offsetBubble(b, panel.origin.x, panel.origin.y), panelId: null } : b))
        : layout.bubbles;
      set({
        layout: { ...layout, panels: layout.panels.filter((p) => p.id !== id), bubbles },
        selectedPanelIds: get().selectedPanelIds.filter((x) => x !== id),
        dirty: true,
      });
    },

    reassignBubblePanel(bubbleId, newPanelId) {
      const layout = get().layout;
      if (!layout) return;
      const bubble = layout.bubbles.find((b) => b.id === bubbleId);
      if (!bubble || bubble.panelId === newPanelId) return;
      pushHistory(true);
      const oldPanel = bubble.panelId ? layout.panels.find((p) => p.id === bubble.panelId) : undefined;
      const newPanel = newPanelId ? layout.panels.find((p) => p.id === newPanelId) : undefined;
      let next = bubble;
      if (oldPanel) next = offsetBubble(next, oldPanel.origin.x, oldPanel.origin.y); // back to absolute
      if (newPanel) next = offsetBubble(next, -newPanel.origin.x, -newPanel.origin.y); // into new panel-relative
      next = { ...next, panelId: newPanelId, readingOrderOverride: undefined };
      set({
        layout: { ...layout, bubbles: layout.bubbles.map((b) => (b.id === bubbleId ? next : b)) },
        dirty: true,
      });
    },

    importBubbles(bubbles) {
      const layout = get().layout;
      if (!layout) return;
      pushHistory(true);
      set({ layout: { ...layout, bubbles }, ...clearSelection(), dirty: true });
    },

    addBubbles(bubbles) {
      const layout = get().layout;
      if (!layout || bubbles.length === 0) return;
      pushHistory(true);
      set({
        layout: { ...layout, bubbles: [...layout.bubbles, ...bubbles] },
        ...clearSelection(),
        selectedBubbleIds: bubbles.map((b) => b.id),
        dirty: true,
      });
    },

    setUseCleanedBackground(value) {
      const layout = get().layout;
      if (!layout || layout.useCleanedBackground === value) return;
      pushHistory(true);
      set({ layout: { ...layout, useCleanedBackground: value }, dirty: true });
    },

    applyBubbleTextPatches(patches) {
      const layout = get().layout;
      if (!layout || patches.length === 0) return;
      pushHistory(true);
      const byId = new Map(patches.map((p) => [p.bubbleId, p]));
      set({
        layout: {
          ...layout,
          bubbles: layout.bubbles.map((b) => {
            const patch = byId.get(b.id);
            return patch ? { ...b, text: { ...b.text, [patch.language]: patch.text } } : b;
          }),
        },
        dirty: true,
      });
    },

    applyBubblePatches(patches) {
      const layout = get().layout;
      if (!layout || patches.length === 0) return;
      pushHistory(true);
      const byId = new Map(patches.map((p) => [p.bubbleId, p.patch]));
      set({
        layout: {
          ...layout,
          bubbles: layout.bubbles.map((b) => {
            const patch = byId.get(b.id);
            return patch && !b.locked ? { ...b, ...patch } : b;
          }),
        },
        dirty: true,
      });
    },

    async save() {
      const { volumeId, page, layout, layoutEtag } = get();
      if (!volumeId || !page || !layout) return;
      set({ saving: true, error: null });
      try {
        const result = await api.saveLayout(volumeId, page, layout, layoutEtag ?? undefined);
        if (result.conflict) {
          set({ saving: false, conflict: { serverLayout: result.currentLayout } });
          return;
        }
        set({ saving: false, dirty: false, layoutEtag: result.etag });
      } catch (e) {
        set({ saving: false, error: translateApiError(e, i18n.t) });
      }
    },

    async resolveConflictOverwrite() {
      const { volumeId, page, layout } = get();
      if (!volumeId || !page || !layout) return;
      set({ saving: true, error: null });
      try {
        const result = await api.saveLayout(volumeId, page, layout);
        set({ saving: false, dirty: false, conflict: null, layoutEtag: result.conflict ? null : result.etag });
      } catch (e) {
        set({ saving: false, error: translateApiError(e, i18n.t) });
      }
    },

    async resolveConflictReload() {
      const { volumeId, page } = get();
      if (!volumeId || !page) return;
      set({ conflict: null });
      await get().loadPage(volumeId, page);
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
      // A locked element is kept (and stays selected) even though it was targeted — full
      // protection (as opposed to just drag/resize) means Delete must leave it alone too.
      set({
        layout: {
          ...layout,
          bubbles: layout.bubbles.filter((b) => !selectedBubbleIds.includes(b.id) || b.locked),
          images: layout.images.filter((img) => !selectedImageIds.includes(img.id) || img.locked),
          curvedTexts: layout.curvedTexts.filter((el) => !selectedCurvedTextIds.includes(el.id) || el.locked),
          panels: layout.panels.filter((p) => !selectedPanelIds.includes(p.id) || p.locked),
        },
        selectedBubbleIds: layout.bubbles.filter((b) => selectedBubbleIds.includes(b.id) && b.locked).map((b) => b.id),
        selectedImageIds: layout.images.filter((img) => selectedImageIds.includes(img.id) && img.locked).map((img) => img.id),
        selectedCurvedTextIds: layout.curvedTexts.filter((el) => selectedCurvedTextIds.includes(el.id) && el.locked).map((el) => el.id),
        selectedPanelIds: layout.panels.filter((p) => selectedPanelIds.includes(p.id) && p.locked).map((p) => p.id),
        dirty: true,
      });
    },

    duplicateSelected() {
      const layout = get().layout;
      if (!layout) return;
      const { selectedBubbleIds, selectedImageIds, selectedCurvedTextIds, selectedPanelIds, activeLanguage } = get();
      if (selectedBubbleIds.length + selectedImageIds.length + selectedCurvedTextIds.length + selectedPanelIds.length === 0) return;
      pushHistory(true);
      const OFFSET = 24;
      // Locked elements are excluded entirely — full protection means they can't be
      // duplicated either. A bubble whose parent panel is locked (and therefore not
      // duplicated) falls through to the existing "panel not duplicated" branch below,
      // no special-casing needed.
      const selectedPanels = layout.panels.filter((p) => selectedPanelIds.includes(p.id) && !p.locked);
      const newPanels = selectedPanels.map((p) => offsetPanel({ ...p, id: uuid() }, OFFSET, OFFSET, activeLanguage));
      const panelIdRemap = new Map(selectedPanels.map((p, i) => [p.id, newPanels[i].id]));
      const newBubbles = layout.bubbles
        .filter((b) => selectedBubbleIds.includes(b.id) && !b.locked)
        .map((b) => {
          const copy = { ...b, id: uuid() };
          if (b.panelId && panelIdRemap.has(b.panelId)) {
            // Parent panel duplicated too — the copy stays panel-relative, sitting in the
            // same spot inside the new panel copy; just repoint it, no coordinate shift
            // (the panel's own offset already carries it).
            return { ...copy, panelId: panelIdRemap.get(b.panelId)! };
          }
          return offsetBubble(copy, OFFSET, OFFSET);
        });
      const newImages = layout.images
        .filter((img) => selectedImageIds.includes(img.id) && !img.locked)
        .map((img) => offsetImage({ ...img, id: uuid() }, OFFSET, OFFSET));
      const newCurvedTexts = layout.curvedTexts
        .filter((el) => selectedCurvedTextIds.includes(el.id) && !el.locked)
        .map((el) => offsetCurvedText({ ...el, id: uuid() }, OFFSET, OFFSET));
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

    mergeSelectedBubbles() {
      const layout = get().layout;
      if (!layout) return;
      const { selectedBubbleIds } = get();
      const targets = layout.bubbles.filter((b) => selectedBubbleIds.includes(b.id) && b.shape !== "quad" && !b.locked);
      if (targets.length < 2) return;
      pushHistory(true);
      const groupId = uuid();
      const targetIds = new Set(targets.map((b) => b.id));
      // The first selected bubble becomes the primary (carries the shared text/tail for
      // the whole merged outline) — an arbitrary but stable choice; the user can always
      // unmerge and re-merge in a different order if they wanted a different one.
      const primaryId = targets[0].id;
      set({
        layout: {
          ...layout,
          bubbles: layout.bubbles.map((b) =>
            targetIds.has(b.id) ? { ...b, mergeGroupId: groupId, mergePrimary: b.id === primaryId } : b
          ),
        },
        dirty: true,
      });
    },

    unmergeSelectedBubbles() {
      const layout = get().layout;
      if (!layout) return;
      const { selectedBubbleIds } = get();
      // Un-merges the WHOLE group(s) touched by the selection, not just the selected
      // members — leaving a group half-merged (a member still mergeGroupId-tagged with no
      // primary left to draw it) would silently stop rendering that member's own text.
      const groupIds = new Set(
        layout.bubbles.filter((b) => selectedBubbleIds.includes(b.id) && b.mergeGroupId).map((b) => b.mergeGroupId as string)
      );
      if (groupIds.size === 0) return;
      pushHistory(true);
      set({
        layout: {
          ...layout,
          bubbles: layout.bubbles.map((b) =>
            b.mergeGroupId && groupIds.has(b.mergeGroupId) ? { ...b, mergeGroupId: null, mergePrimary: false } : b
          ),
        },
        dirty: true,
      });
    },

    nudgeSelected(dx, dy) {
      const layout = get().layout;
      if (!layout) return;
      const { selectedBubbleIds, selectedImageIds, selectedCurvedTextIds, selectedPanelIds, activeLanguage } = get();
      if (selectedBubbleIds.length + selectedImageIds.length + selectedCurvedTextIds.length + selectedPanelIds.length === 0) return;
      pushHistory(false);
      set({
        layout: {
          ...layout,
          // A bubble whose parent panel is ALSO selected is skipped here — the panel's own
          // origin shift already carries it along (via nested Konva Group transform on
          // render), so also shifting the bubble's own relative x/y would double-move it.
          bubbles: layout.bubbles.map((b) =>
            selectedBubbleIds.includes(b.id) && !b.locked && !(b.panelId && selectedPanelIds.includes(b.panelId))
              ? offsetBubble(b, dx, dy)
              : b
          ),
          images: layout.images.map((img) => (selectedImageIds.includes(img.id) && !img.locked ? offsetImage(img, dx, dy) : img)),
          curvedTexts: layout.curvedTexts.map((el) => (selectedCurvedTextIds.includes(el.id) && !el.locked ? offsetCurvedText(el, dx, dy) : el)),
          panels: layout.panels.map((p) => (selectedPanelIds.includes(p.id) && !p.locked ? offsetPanel(p, dx, dy, activeLanguage) : p)),
        },
        dirty: true,
      });
    },

    updateSelectedBubbles(patch) {
      const layout = get().layout;
      if (!layout) return;
      const { selectedBubbleIds } = get();
      const targetIds = new Set(layout.bubbles.filter((b) => selectedBubbleIds.includes(b.id) && !b.locked).map((b) => b.id));
      if (targetIds.size === 0) return;
      pushHistory(true);
      set({
        layout: {
          ...layout,
          bubbles: layout.bubbles.map((b) => (targetIds.has(b.id) ? { ...b, ...patch } : b)),
        },
        dirty: true,
      });
    },

    setLockedForSelection(locked) {
      const layout = get().layout;
      if (!layout) return;
      const { selectedBubbleIds, selectedImageIds, selectedCurvedTextIds, selectedPanelIds } = get();
      if (selectedBubbleIds.length + selectedImageIds.length + selectedCurvedTextIds.length + selectedPanelIds.length === 0) return;
      pushHistory(true);
      // `locked: undefined` (not `false`) matches LockToggleHandle.tsx's own single-element
      // toggle convention — see Bubble.locked's doc comment in layoutSchema.ts: only ever
      // written to disk while actually locked, dropped entirely once unlocked.
      const lockPatch = { locked: locked ? true : undefined };
      set({
        layout: {
          ...layout,
          bubbles: layout.bubbles.map((b) => (selectedBubbleIds.includes(b.id) ? { ...b, ...lockPatch } : b)),
          images: layout.images.map((img) => (selectedImageIds.includes(img.id) ? { ...img, ...lockPatch } : img)),
          curvedTexts: layout.curvedTexts.map((el) => (selectedCurvedTextIds.includes(el.id) ? { ...el, ...lockPatch } : el)),
          panels: layout.panels.map((p) => (selectedPanelIds.includes(p.id) ? { ...p, ...lockPatch } : p)),
        },
        dirty: true,
      });
    },

    setAllPanelsLocked(locked) {
      const layout = get().layout;
      if (!layout) return;
      if (layout.panels.length === 0) return;
      pushHistory(true);
      const lockPatch = { locked: locked ? true : undefined };
      set({
        layout: { ...layout, panels: layout.panels.map((p) => ({ ...p, ...lockPatch })) },
        dirty: true,
      });
    },

    setPanelLockCascade(panelId, locked) {
      const layout = get().layout;
      if (!layout) return;
      if (!layout.panels.some((p) => p.id === panelId)) return;
      pushHistory(true);
      const lockPatch = { locked: locked ? true : undefined };
      set({
        layout: {
          ...layout,
          panels: layout.panels.map((p) => (p.id === panelId ? { ...p, ...lockPatch } : p)),
          bubbles: layout.bubbles.map((b) => (b.panelId === panelId ? { ...b, ...lockPatch } : b)),
        },
        dirty: true,
      });
    },

    bringLayerToFront(target) {
      const layout = get().layout;
      if (!layout) return;
      const order = pageLayerOrder(layout);
      const i = order.findIndex((x) => x.type === target.type && x.id === target.id);
      if (i === -1 || i === order.length - 1) return;
      const [item] = order.splice(i, 1);
      order.push(item);
      pushHistory(true);
      set({ layout: withLayerOrder(layout, order), dirty: true });
    },

    sendLayerToBack(target) {
      const layout = get().layout;
      if (!layout) return;
      const order = pageLayerOrder(layout);
      const i = order.findIndex((x) => x.type === target.type && x.id === target.id);
      if (i === -1 || i === 0) return;
      const [item] = order.splice(i, 1);
      order.unshift(item);
      pushHistory(true);
      set({ layout: withLayerOrder(layout, order), dirty: true });
    },
  };
});
