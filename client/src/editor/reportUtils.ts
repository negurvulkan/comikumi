import type { Bubble, Panel } from "../../../shared/src/layoutSchema";
import { panelDisplayLabel, polygonBounds, resolveBubbleForm, resolvePanelForLanguage } from "../../../shared/src/layoutSchema";
import type { Character } from "../../../shared/src/characters";

export const NO_CHARACTER_LABEL = "– kein Charakter –";
export const NO_PANEL_LABEL = "Ohne Panel";

/** Physical panel/bubble reading order on the page — see
 * shared/src/settings.ts's ProjectSettingsSchema.readingDirection. Unrelated to
 * Bubble.direction (per-bubble TEXT layout). */
export type ReadingDirection = "ltr" | "rtl";

interface Bounds {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

/** Groups items into horizontal "rows" by vertical (Y) bounding-box overlap — no fixed
 * pixel threshold, so it works whether panels/bubbles are tiny or huge: sorted by minY,
 * a sweep starts a new row whenever the next item's minY falls below the current row's
 * running maxY (no vertical overlap with anything already in the row); otherwise it
 * joins the row and extends the row's maxY. Within each row, items are then ordered by
 * X according to `readingDirection` — ascending minX (ltr) or descending minX (rtl).
 * Replaces a pure-Y sort, which breaks down whenever two items sit at roughly the same
 * height (exactly the manga case: side-by-side panels/bubbles in one tier). */
function sortByRowsAndDirection<T>(items: T[], boundsOf: (item: T) => Bounds, readingDirection: ReadingDirection): T[] {
  const withBounds = items.map((item) => ({ item, bounds: boundsOf(item) })).sort((a, b) => a.bounds.minY - b.bounds.minY);
  const rows: (typeof withBounds)[number][][] = [];
  let currentRow: typeof withBounds = [];
  let rowMaxY = -Infinity;
  for (const entry of withBounds) {
    if (currentRow.length > 0 && entry.bounds.minY > rowMaxY) {
      rows.push(currentRow);
      currentRow = [];
      rowMaxY = -Infinity;
    }
    currentRow.push(entry);
    rowMaxY = Math.max(rowMaxY, entry.bounds.maxY);
  }
  if (currentRow.length > 0) rows.push(currentRow);
  return rows.flatMap((row) =>
    row.sort((a, b) => (readingDirection === "ltr" ? a.bounds.minX - b.bounds.minX : b.bounds.minX - a.bounds.minX)).map((e) => e.item)
  );
}

/** Shared by ReportModal (one page) and VolumeReportModal (many pages), so the two
 * never disagree on what "wer sagt was" / "welche Charaktere" actually mean. */

export function characterName(characters: Character[], characterId: string | null | undefined): string {
  if (!characterId) return NO_CHARACTER_LABEL;
  return characters.find((c) => c.id === characterId)?.name ?? NO_CHARACTER_LABEL;
}

/** Bubbles in reading order — same convention as TextListPanel.tsx. Two-pass: first
 * the automatic row+direction order (see sortByRowsAndDirection) establishes a rank
 * (0,1,2,...) for every bubble, then a final sort by `readingOrderOverride ?? autoRank`
 * lets a manual correction (see moveBubbleInReadingOrder) slot a bubble anywhere without
 * needing to touch every other bubble's rank — the override always wins, regardless of
 * readingDirection. With no overrides present this is byte-for-byte the same order as
 * the plain automatic sort (stable sort, ES2019+). */
export function sortBubblesByPosition(bubbles: Bubble[], language: string, readingDirection: ReadingDirection = "rtl"): Bubble[] {
  const autoRanked = sortByRowsAndDirection(
    bubbles,
    (b) => {
      const form = resolveBubbleForm(b, language);
      return { minX: form.x, maxX: form.x + form.width, minY: form.y, maxY: form.y + form.height };
    },
    readingDirection
  );
  return autoRanked
    .map((b, autoRank) => ({ b, key: b.readingOrderOverride ?? autoRank }))
    .sort((x, y) => x.key - y.key)
    .map((x) => x.b);
}

/** Sorts panels by their position *for the given language* (a Cut-Panel may be moved
 * only for certain languages — see Panel.languageOverride's doc comment) — resolves
 * each panel's points before computing bounds. */
function sortPanelsByPosition(
  panels: Panel[],
  languageCode: string,
  readingDirection: ReadingDirection = "rtl"
): { panel: Panel; index: number }[] {
  return sortByRowsAndDirection(
    panels.map((panel, index) => ({ panel, index })),
    ({ panel }) => polygonBounds(resolvePanelForLanguage(panel, languageCode).points),
    readingDirection
  );
}

/** A bubble's panelId is only "assigned" if it still points at a panel that
 * actually exists — a deleted panel leaves stale ids behind on old bubbles. */
function isAssignedTo(bubble: Bubble, panelId: string, panels: Panel[]): boolean {
  return bubble.panelId === panelId && panels.some((p) => p.id === panelId);
}

/** Panels that "exist" for script/report/reading-order purposes, *for the given
 * language* — a Cut-Panel marked `cut.removed` for this language (resolved via
 * resolvePanelForLanguage — removal itself can be language-specific, see
 * Panel.languageOverride's doc comment) stays fully intact structurally (geometry,
 * child-bubble assignment, undoable any time) but is treated here exactly like a deleted
 * panel: filtered out before grouping, so bubbles assigned to it fall through to
 * isAssignedTo()'s existing stale-reference fallback (the "Ohne Panel" bucket) with no
 * new code path needed. A panel removed only in "de" still appears normally in "ja"
 * groups/reports/script. */
function existingPanels(panels: Panel[], languageCode: string): Panel[] {
  return panels.filter((p) => !resolvePanelForLanguage(p, languageCode).cut?.removed);
}

export interface BubbleGroup {
  label: string;
  bubbles: Bubble[];
  /** The real Panel this group belongs to, or null for the trailing "Ohne Panel"
   * bucket — lets a caller (e.g. TranslatorContextPanel.tsx's panel-selected mode)
   * find a specific panel's group directly, even one with zero bubbles in it. */
  panelId: string | null;
}

/** "Wer sagt was in welchem Panel?" grouping — panels in reading order, then an
 * "Ohne Panel" group for everything left over (including stale panelId references). */
export function groupBubblesByPanel(
  bubbles: Bubble[],
  panels: Panel[],
  language: string,
  readingDirection: ReadingDirection = "rtl"
): BubbleGroup[] {
  const effectivePanels = existingPanels(panels, language);
  const groups: BubbleGroup[] = sortPanelsByPosition(effectivePanels, language, readingDirection).map(({ panel, index }) => ({
    label: panelDisplayLabel(panel, index),
    panelId: panel.id,
    bubbles: sortBubblesByPosition(
      bubbles.filter((b) => isAssignedTo(b, panel.id, effectivePanels)),
      language,
      readingDirection
    ),
  }));
  const assignedIds = new Set(effectivePanels.map((p) => p.id));
  const unassigned = sortBubblesByPosition(
    bubbles.filter((b) => !b.panelId || !assignedIds.has(b.panelId)),
    language,
    readingDirection
  );
  if (unassigned.length > 0) groups.push({ label: NO_PANEL_LABEL, panelId: null, bubbles: unassigned });
  return groups;
}

/** Unique, alphabetically sorted character names referenced by any of `bubbles`. */
export function uniqueCharacterNames(bubbles: Bubble[], characters: Character[]): string[] {
  const ids = new Set(bubbles.map((b) => b.characterId).filter((id): id is string => !!id));
  const names = [...ids].map((id) => characters.find((c) => c.id === id)?.name).filter((n): n is string => !!n);
  return [...new Set(names)].sort((a, b) => a.localeCompare(b));
}

export interface CharacterPanelGroup {
  label: string;
  characterNames: string[];
}

/** "Welche Charaktere kommen in welchen Panels vor?" — panels in reading order,
 * panels with no assigned characters are omitted rather than shown empty. */
export function charactersByPanel(
  bubbles: Bubble[],
  panels: Panel[],
  characters: Character[],
  languageCode: string,
  readingDirection: ReadingDirection = "rtl"
): CharacterPanelGroup[] {
  const effectivePanels = existingPanels(panels, languageCode);
  return sortPanelsByPosition(effectivePanels, languageCode, readingDirection)
    .map(({ panel, index }) => ({
      label: panelDisplayLabel(panel, index),
      characterNames: uniqueCharacterNames(
        bubbles.filter((b) => isAssignedTo(b, panel.id, effectivePanels)),
        characters
      ),
    }))
    .filter((g) => g.characterNames.length > 0);
}

/** The whole page's bubbles flattened into one reading-order list — panels top-to-bottom,
 * each panel's own bubbles in their (auto/override) order, then the "Ohne Panel" bucket.
 * Used by the context sidebar to find "previous"/"next" bubble on a page. */
export function getPageReadingOrder(
  bubbles: Bubble[],
  panels: Panel[],
  language: string,
  readingDirection: ReadingDirection = "rtl"
): Bubble[] {
  return groupBubblesByPanel(bubbles, panels, language, readingDirection).flatMap((g) => g.bubbles);
}

/** Moves one bubble up/down by one slot within its own reading-order group (its panel,
 * or the "Ohne Panel" bucket) and returns the readingOrderOverride patches needed to
 * commit that — the ENTIRE group is renumbered to dense 0..n-1 in the new order, not
 * just the two swapped bubbles. A two-value swap would eventually produce colliding
 * effective keys after repeated reorders (whose tie-break would then depend on
 * incidental array storage order, not on anything the user set) — renumbering the
 * whole group avoids that at negligible cost, since panel groups are small (a handful
 * of bubbles). Returns [] if the bubble isn't found or the move would go out of bounds. */
export function moveBubbleInReadingOrder(
  bubbles: Bubble[],
  panels: Panel[],
  language: string,
  bubbleId: string,
  direction: "up" | "down",
  readingDirection: ReadingDirection = "rtl"
): { id: string; readingOrderOverride: number }[] {
  const group = groupBubblesByPanel(bubbles, panels, language, readingDirection).find((g) => g.bubbles.some((b) => b.id === bubbleId));
  if (!group) return [];
  const ordered = group.bubbles;
  const i = ordered.findIndex((b) => b.id === bubbleId);
  const j = direction === "up" ? i - 1 : i + 1;
  if (j < 0 || j >= ordered.length) return [];
  const reordered = [...ordered];
  [reordered[i], reordered[j]] = [reordered[j], reordered[i]];
  return reordered.map((b, idx) => ({ id: b.id, readingOrderOverride: idx }));
}
