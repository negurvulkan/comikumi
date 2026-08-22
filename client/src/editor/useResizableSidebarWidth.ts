import { useRef, useState } from "react";

const STORAGE_KEY = "comikumi.sidebarWidth";
const DEFAULT_WIDTH = 260;
const MIN_WIDTH = 220;
const MAX_WIDTH = 640;

function clamp(value: number): number {
  return Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, value));
}

function readStoredWidth(): number {
  const raw = Number(localStorage.getItem(STORAGE_KEY));
  return Number.isFinite(raw) && raw >= MIN_WIDTH && raw <= MAX_WIDTH ? raw : DEFAULT_WIDTH;
}

/** One shared, localStorage-persisted width for all docked sidebars (TextListPanel,
 * TranslatorContextPanel, ScriptSidebar) — they're mutually exclusive (never more than
 * one open at once) and dock in the exact same layout slot, so a single remembered
 * width behaves more predictably than three independent ones: widen whichever sidebar
 * is open, and the next one you switch to keeps that width too. Writes to localStorage
 * on every drag tick rather than only on pointerup, sidestepping any stale-closure risk
 * from reading `width` inside a handler created on an earlier render. */
export function useResizableSidebarWidth() {
  const [width, setWidth] = useState(readStoredWidth);
  const [dragging, setDragging] = useState(false);
  const dragStart = useRef<{ pointerX: number; startWidth: number } | null>(null);

  function handlePointerDown(e: React.PointerEvent) {
    e.preventDefault();
    (e.target as Element).setPointerCapture(e.pointerId);
    dragStart.current = { pointerX: e.clientX, startWidth: width };
    setDragging(true);
  }

  function handlePointerMove(e: React.PointerEvent) {
    if (!dragStart.current) return;
    // The sidebar is docked on the left edge — dragging the right-edge handle to the
    // right (positive clientX delta) should widen it, so width grows as the pointer
    // moves right of where the drag started.
    const next = clamp(dragStart.current.startWidth + (e.clientX - dragStart.current.pointerX));
    setWidth(next);
    localStorage.setItem(STORAGE_KEY, String(next));
  }

  function handlePointerUp() {
    dragStart.current = null;
    setDragging(false);
  }

  return { width, dragging, handlePointerDown, handlePointerMove, handlePointerUp };
}
