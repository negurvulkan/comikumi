import type { Bubble, Panel } from "../../../shared/src/layoutSchema";
import { panelDisplayLabel, polygonBounds, resolveBubbleForm } from "../../../shared/src/layoutSchema";
import type { Character } from "../../../shared/src/characters";

export const NO_CHARACTER_LABEL = "– kein Charakter –";
export const NO_PANEL_LABEL = "Ohne Panel";

/** Shared by ReportModal (one page) and VolumeReportModal (many pages), so the two
 * never disagree on what "wer sagt was" / "welche Charaktere" actually mean. */

export function characterName(characters: Character[], characterId: string | null | undefined): string {
  if (!characterId) return NO_CHARACTER_LABEL;
  return characters.find((c) => c.id === characterId)?.name ?? NO_CHARACTER_LABEL;
}

/** Bubbles in top-to-bottom reading order — same convention as TextListPanel.tsx.
 * Two-pass: first the automatic Y-position order establishes a rank (0,1,2,...) for
 * every bubble, then a final sort by `readingOrderOverride ?? autoRank` lets a manual
 * correction (see moveBubbleInReadingOrder) slot a bubble anywhere without needing to
 * touch every other bubble's rank. With no overrides present this is byte-for-byte the
 * same order as the plain Y-sort (stable sort, ES2019+). */
export function sortBubblesByPosition(bubbles: Bubble[], language: string): Bubble[] {
  const autoRanked = [...bubbles].sort((a, b) => resolveBubbleForm(a, language).y - resolveBubbleForm(b, language).y);
  return autoRanked
    .map((b, autoRank) => ({ b, key: b.readingOrderOverride ?? autoRank }))
    .sort((x, y) => x.key - y.key)
    .map((x) => x.b);
}

function sortPanelsByPosition(panels: Panel[]): { panel: Panel; index: number }[] {
  return panels
    .map((panel, index) => ({ panel, index }))
    .sort((a, b) => polygonBounds(a.panel.points).minY - polygonBounds(b.panel.points).minY);
}

/** A bubble's panelId is only "assigned" if it still points at a panel that
 * actually exists — a deleted panel leaves stale ids behind on old bubbles. */
function isAssignedTo(bubble: Bubble, panelId: string, panels: Panel[]): boolean {
  return bubble.panelId === panelId && panels.some((p) => p.id === panelId);
}

export interface BubbleGroup {
  label: string;
  bubbles: Bubble[];
}

/** "Wer sagt was in welchem Panel?" grouping — panels in reading order, then an
 * "Ohne Panel" group for everything left over (including stale panelId references). */
export function groupBubblesByPanel(bubbles: Bubble[], panels: Panel[], language: string): BubbleGroup[] {
  const groups: BubbleGroup[] = sortPanelsByPosition(panels).map(({ panel, index }) => ({
    label: panelDisplayLabel(panel, index),
    bubbles: sortBubblesByPosition(
      bubbles.filter((b) => isAssignedTo(b, panel.id, panels)),
      language
    ),
  }));
  const assignedIds = new Set(panels.map((p) => p.id));
  const unassigned = sortBubblesByPosition(
    bubbles.filter((b) => !b.panelId || !assignedIds.has(b.panelId)),
    language
  );
  if (unassigned.length > 0) groups.push({ label: NO_PANEL_LABEL, bubbles: unassigned });
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
export function charactersByPanel(bubbles: Bubble[], panels: Panel[], characters: Character[]): CharacterPanelGroup[] {
  return sortPanelsByPosition(panels)
    .map(({ panel, index }) => ({
      label: panelDisplayLabel(panel, index),
      characterNames: uniqueCharacterNames(
        bubbles.filter((b) => isAssignedTo(b, panel.id, panels)),
        characters
      ),
    }))
    .filter((g) => g.characterNames.length > 0);
}

/** The whole page's bubbles flattened into one reading-order list — panels top-to-bottom,
 * each panel's own bubbles in their (auto/override) order, then the "Ohne Panel" bucket.
 * Used by the translator context sidebar to find "previous"/"next" bubble on a page. */
export function getPageReadingOrder(bubbles: Bubble[], panels: Panel[], language: string): Bubble[] {
  return groupBubblesByPanel(bubbles, panels, language).flatMap((g) => g.bubbles);
}

/** Moves one bubble up/down by one slot within its own reading-order group (its panel,
 * or the "Ohne Panel" bucket) and returns the readingOrderOverride patches needed to
 * commit that — the ENTIRE group is renumbered to dense 0..n-1 in the new order, not
 * just the two swapped bubbles. A two-value swap would eventually produce colliding
 * effective keys after repeated reorders (whose tie-break would then depend on
 * incidental array storage order, not on anything the translator set) — renumbering the
 * whole group avoids that at negligible cost, since panel groups are small (a handful
 * of bubbles). Returns [] if the bubble isn't found or the move would go out of bounds. */
export function moveBubbleInReadingOrder(
  bubbles: Bubble[],
  panels: Panel[],
  language: string,
  bubbleId: string,
  direction: "up" | "down"
): { id: string; readingOrderOverride: number }[] {
  const group = groupBubblesByPanel(bubbles, panels, language).find((g) => g.bubbles.some((b) => b.id === bubbleId));
  if (!group) return [];
  const ordered = group.bubbles;
  const i = ordered.findIndex((b) => b.id === bubbleId);
  const j = direction === "up" ? i - 1 : i + 1;
  if (j < 0 || j >= ordered.length) return [];
  const reordered = [...ordered];
  [reordered[i], reordered[j]] = [reordered[j], reordered[i]];
  return reordered.map((b, idx) => ({ id: b.id, readingOrderOverride: idx }));
}
