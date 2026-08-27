import type { PageSummary } from "../api/client";

/** Pure helpers for building the page-order array the page grid drags/inserts into and
 * PUTs back via api.savePageOrder() — same "pure function over an array, caller
 * persists" style as scriptEditing.ts's movePanel()/reportUtils.ts's
 * moveBubbleInReadingOrder(), just with full-array replacement instead of a patch list
 * (order arrays are small — one entry per page — so there's no
 * readingOrderOverride-style collision-key concern to avoid). */

/** Moves `pageId` to `toIndex` in `order`, returning a new array. `toIndex` is
 * interpreted against the array with `pageId` already removed (i.e. "insert at this
 * position among the remaining pages"), clamped to a valid range. No-op (returns the
 * same reference) if `pageId` isn't present. */
export function movePage(order: string[], pageId: string, toIndex: number): string[] {
  const from = order.indexOf(pageId);
  if (from === -1) return order;
  const next = [...order.slice(0, from), ...order.slice(from + 1)];
  const clamped = Math.max(0, Math.min(toIndex, next.length));
  next.splice(clamped, 0, pageId);
  return next;
}

/** Splices `newPageNames` into `order` at `atIndex` (clamped) — used both for "insert
 * here" uploads and blank-page creation. */
export function insertPageAt(order: string[], newPageNames: string[], atIndex: number): string[] {
  const clamped = Math.max(0, Math.min(atIndex, order.length));
  return [...order.slice(0, clamped), ...newPageNames, ...order.slice(clamped)];
}

/** Client-side mirror of server/src/lib/projectScanner.ts's listPages() tolerance:
 * drops any order entry no longer present in `currentPages`, and appends any current
 * page missing from `order` (naturally sorted among itself) at the end. Keeps drag/
 * insert interactions working off an array that actually matches what's on screen even
 * if the saved order and the fetched page list have drifted (e.g. another tab just
 * uploaded or deleted a page). */
export function reconcileOrder(order: string[], currentPages: PageSummary[]): string[] {
  const currentNames = new Set(currentPages.map((p) => p.page));
  const reconciled = order.filter((name) => currentNames.has(name));
  const reconciledNames = new Set(reconciled);
  const stragglers = currentPages
    .map((p) => p.page)
    .filter((name) => !reconciledNames.has(name))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  return [...reconciled, ...stragglers];
}
