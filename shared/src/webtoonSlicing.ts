import type { PageLayout, Panel } from "./layoutSchema.js";
import { imageFileForLanguage, resolveBubbleForm, resolvePanelForLanguage } from "./layoutSchema.js";
import type { LetteringPreset } from "./presets.js";

/** A closed Y-interval in image-space px, inclusive. */
export interface Interval {
  minY: number;
  maxY: number;
}

/** One platform's recommended (not enforced) segment-height ceiling for uploading a
 * webtoon episode as multiple images — see computeSliceCuts's own doc comment for why a
 * cut is never actually blocked by these. Treat the numbers as defaults to verify against
 * each platform's current guidelines before relying on them, not as hard facts baked into
 * the app — that's exactly what `note` is for, and why "custom" always stays available. */
export interface SlicePreset {
  id: string;
  label: string;
  maxHeightPx: number;
  note: string;
}

export const DEFAULT_SLICE_HEIGHT = 1280;

export const SLICE_PRESETS: SlicePreset[] = [
  {
    id: "webtoon-canvas",
    label: "Webtoon Canvas",
    maxHeightPx: 1280,
    note: "Verify against Webtoon Canvas's current per-image upload guidelines before relying on this number.",
  },
  {
    id: "tapas",
    label: "Tapas",
    maxHeightPx: 20000,
    note: "Verify against Tapas's current per-image upload guidelines before relying on this number.",
  },
  {
    id: "lezhin",
    label: "Lezhin",
    maxHeightPx: 8000,
    note: "Verify against Lezhin's current per-image upload guidelines before relying on this number.",
  },
  {
    id: "custom",
    label: "Custom",
    maxHeightPx: DEFAULT_SLICE_HEIGHT,
    note: "Set your own maximum segment height.",
  },
];

/** A child bubble/curved-text/image's own coordinates are relative to its parent panel's
 * origin (see PanelPointsSchema.origin) — mirrors renderPageToPng.ts's identical
 * panelOriginFor helper (kept local here rather than shared/exported, since both copies
 * are this small and the two modules have otherwise-independent reasons to change). */
function panelOriginFor(panelId: string | null, panels: Panel[]): { x: number; y: number } {
  const panel = panelId ? panels.find((p) => p.id === panelId) : undefined;
  return panel?.origin ?? { x: 0, y: 0 };
}

/** Y-intervals a slice cut must not cross — collected from every element that would
 * otherwise visibly split across two segment images. Deliberately conservative (a plain
 * bounding box per element, no attempt to carve out transparent corners) — a slightly
 * wider no-cut zone than strictly necessary is a much better failure mode than a cut that
 * looks fine in the data but slices through a bubble's rendered tail or a glow/shadow
 * that extends past its own box. */
export function collectSliceObstacles(layout: PageLayout, languageCode: string, presets: LetteringPreset[] = []): Interval[] {
  const obstacles: Interval[] = [];

  for (const bubble of layout.bubbles) {
    const text = bubble.text[languageCode];
    const hasText = !!text && !!text.trim();
    const origin = panelOriginFor(bubble.panelId, layout.panels);
    if (bubble.shape === "quad" && bubble.corners) {
      if (!hasText) continue;
      const ys = bubble.corners.map((c) => c.y + origin.y);
      obstacles.push({ minY: Math.min(...ys), maxY: Math.max(...ys) });
      continue;
    }
    const form = resolveBubbleForm(bubble, languageCode, presets);
    if (form.bubbleStyle === "none" && !hasText) continue;
    const minY = form.y + origin.y;
    const maxY = minY + form.height;
    // A tail point extends the bubble's silhouette beyond its own box — its own
    // coordinates are in the same panel-relative space as the bubble itself.
    if (bubble.tail) {
      obstacles.push({ minY: Math.min(minY, bubble.tail.y + origin.y), maxY: Math.max(maxY, bubble.tail.y + origin.y) });
    } else {
      obstacles.push({ minY, maxY });
    }
  }

  // Curved texts and placed images carry absolute image-space coordinates already (no
  // panel-relative anchoring like Bubble.panelId) — see CurvedTextElementSchema/
  // ImageElementSchema's own doc comments.
  for (const el of layout.curvedTexts) {
    const text = el.text[languageCode];
    if (!text || !text.trim()) continue;
    const ys = el.points.map((p) => p.y);
    obstacles.push({ minY: Math.min(...ys), maxY: Math.max(...ys) });
  }

  for (const img of layout.images) {
    if (!imageFileForLanguage(img, languageCode)) continue;
    const ys = img.corners.map((p) => p.y);
    obstacles.push({ minY: Math.min(...ys), maxY: Math.max(...ys) });
  }

  return obstacles;
}

/** Midpoints of the vertical gaps between consecutive panels — a positive signal for
 * where a cut belongs, not a hard requirement. Panels are exactly the gutter annotation a
 * letterer has usually already drawn (and, unlike bubbles/text, are never exported —
 * see pageLayerOrder — so using them here costs nothing extra). Ignores overlapping
 * panels (no gap to speak of) and panels with no gap at all. */
export function collectPreferredCuts(layout: PageLayout, languageCode: string): number[] {
  // A panel's own `points` are already absolute image-space coordinates — `origin` is
  // only the anchor CHILD bubbles are relative to, not an offset on the panel itself
  // (see PanelPointsSchema.origin's doc comment).
  const boxes = layout.panels
    .map((panel) => resolvePanelForLanguage(panel, languageCode))
    .map((resolved) => {
      const ys = resolved.points.map((p) => p.y);
      return { minY: Math.min(...ys), maxY: Math.max(...ys) };
    })
    .sort((a, b) => a.minY - b.minY);

  const cuts: number[] = [];
  for (let i = 0; i < boxes.length - 1; i++) {
    const bottomOfThis = boxes[i].maxY;
    const topOfNext = boxes[i + 1].minY;
    if (topOfNext > bottomOfThis) cuts.push((bottomOfThis + topOfNext) / 2);
  }
  return cuts;
}

export interface SliceCutsInput {
  imageHeight: number;
  maxHeight: number;
  /** Segments shorter than this get merged into the previous one instead of standing on
   * their own — avoids a trailing sliver segment for e.g. a 1px rounding remainder. */
  minHeight: number;
  obstacles: Interval[];
  preferredCuts: number[];
}

export interface SliceSegment {
  index: number;
  y: number;
  height: number;
}

export interface SliceWarning {
  sliceIndex: number;
  reason: "crosses_obstacle";
}

export interface SlicePlan {
  slices: SliceSegment[];
  warnings: SliceWarning[];
}

/** How far (as a fraction of maxHeight) a cut is allowed to move away from the ideal
 * `y + maxHeight` point while searching for a preferred cut or obstacle-free y. */
const SEARCH_TOLERANCE_FRACTION = 0.35;
const SEARCH_STEP_PX = 4;

function overlapsAnyObstacle(y: number, obstacles: Interval[]): boolean {
  return obstacles.some((o) => y > o.minY && y < o.maxY);
}

/** Distance from `y` to the nearest edge of the closest obstacle — larger is safer.
 * A y outside every obstacle's own interval still wants to prefer being far from all of
 * them, not just barely clear of the nearest one. */
function clearanceAt(y: number, obstacles: Interval[]): number {
  if (obstacles.length === 0) return Infinity;
  return Math.min(...obstacles.map((o) => Math.min(Math.abs(y - o.minY), Math.abs(y - o.maxY))));
}

/**
 * Greedy top-down slice planner: walks down from y=0, placing each cut as close to
 * `y + maxHeight` as possible while preferring (in order) a `preferredCuts` entry within
 * the tolerance window, then the y with maximum clearance from every obstacle. An export
 * must never simply fail because no clean cut exists — if every candidate in the window
 * still crosses an obstacle, the ideal `y + maxHeight` point is used anyway and a warning
 * is recorded, rather than the whole slice plan (or the export) aborting.
 */
export function computeSliceCuts(input: SliceCutsInput): SlicePlan {
  const { imageHeight, maxHeight, minHeight, obstacles, preferredCuts } = input;
  const slices: SliceSegment[] = [];
  const warnings: SliceWarning[] = [];

  let y = 0;
  let index = 0;
  while (y < imageHeight) {
    const remaining = imageHeight - y;
    if (remaining <= maxHeight) {
      slices.push({ index, y, height: remaining });
      break;
    }

    const ideal = y + maxHeight;
    const tolerance = maxHeight * SEARCH_TOLERANCE_FRACTION;
    const windowMin = Math.max(y + 1, ideal - tolerance);
    const windowMax = ideal;

    // 1) A preferred (panel-gap) cut inside the window, closest to ideal wins.
    const preferredInWindow = preferredCuts
      .filter((c) => c >= windowMin && c <= windowMax && !overlapsAnyObstacle(c, obstacles))
      .sort((a, b) => Math.abs(ideal - a) - Math.abs(ideal - b));
    let cutY: number;
    if (preferredInWindow.length > 0) {
      cutY = preferredInWindow[0];
    } else {
      // 2) Otherwise the obstacle-free y in the window with maximum clearance — ties
      // broken toward the ideal point.
      let best: { y: number; clearance: number } | null = null;
      for (let candidate = windowMax; candidate >= windowMin; candidate -= SEARCH_STEP_PX) {
        if (overlapsAnyObstacle(candidate, obstacles)) continue;
        const clearance = clearanceAt(candidate, obstacles);
        if (!best || clearance > best.clearance || (clearance === best.clearance && Math.abs(ideal - candidate) < Math.abs(ideal - best.y))) {
          best = { y: candidate, clearance };
        }
      }
      if (best) {
        cutY = best.y;
      } else {
        // 3) Every candidate in the window crosses an obstacle — cut at the ideal point
        // anyway (never fail the export over this) and record it.
        cutY = ideal;
        warnings.push({ sliceIndex: index, reason: "crosses_obstacle" });
      }
    }

    slices.push({ index, y, height: cutY - y });
    y = cutY;
    index++;
  }

  // Merge a too-short final segment into the previous one instead of leaving a sliver.
  if (slices.length > 1) {
    const last = slices[slices.length - 1];
    if (last.height < minHeight) {
      slices.pop();
      const prev = slices[slices.length - 1];
      prev.height += last.height;
    }
  }

  return { slices, warnings };
}

/** Shared naming convention for a slice's output file (no extension) — imported by the
 * client exporter, the server's CBZ packer, and the export viewer so all three parse it
 * identically. NN is zero-padded to 2 digits (01, 02, … 99) — a page sliced into 100+
 * segments is far outside any realistic use of this feature. */
export function sliceFileName(pageId: string, index: number): string {
  const nn = String(index + 1).padStart(2, "0");
  return `${pageId}_s${nn}`;
}

/** Parses a slice file name (as produced by sliceFileName, WITHOUT extension) back into
 * its base page id and 0-based slice index — `null` for a plain, unsliced page name.
 * Shared by the server's CBZ packer (grouping segments back under their page) and the
 * export viewer (listing segments under their base page). */
export function parseSliceFileName(name: string): { pageId: string; index: number } | null {
  const match = /^(.*)_s(\d{2,})$/.exec(name);
  if (!match) return null;
  return { pageId: match[1], index: Number(match[2]) - 1 };
}
