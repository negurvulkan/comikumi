import polygonClipping from "polygon-clipping";
import type { Bubble, BubbleForm, Point } from "../../../shared/src/layoutSchema";
import { buildBoundaryForStyle } from "../../../shared/src/rendering/bubbleBackground";

/**
 * Non-destructive bubble merging (see Bubble.mergeGroupId/mergePrimary in
 * shared/src/layoutSchema.ts): bubbles sharing a mergeGroupId are drawn as one
 * continuous outline — the union of their individual boundaries — instead of
 * individually. Client-only (like svgBubbleGeometry.ts) because it depends on the
 * `polygon-clipping` package, which only client/package.json installs; shared/ itself
 * stays free of runtime dependencies.
 */

/** Groups bubbles by mergeGroupId — "quad" bubbles are excluded even if tagged (their
 * perspective-warped rendering has no buildBoundaryForStyle-compatible outline). */
export function resolveMergeGroups(bubbles: Bubble[]): Map<string, Bubble[]> {
  const groups = new Map<string, Bubble[]>();
  for (const b of bubbles) {
    if (!b.mergeGroupId || b.shape === "quad") continue;
    const list = groups.get(b.mergeGroupId);
    if (list) list.push(b);
    else groups.set(b.mergeGroupId, [b]);
  }
  return groups;
}

export interface MergeMemberInput {
  bubble: Bubble;
  /** Resolved (resolveBubbleForm) and panel-origin-adjusted, but NOT yet rotated —
   * same "form" shape the caller already builds for its own per-bubble draw loop. */
  form: BubbleForm;
  svgBoundary?: Point[] | null;
}

function degToRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

function rotateAround(p: Point, center: Point, rad: number): Point {
  if (!rad) return p;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const dx = p.x - center.x;
  const dy = p.y - center.y;
  return { x: center.x + dx * cos - dy * sin, y: center.y + dx * sin + dy * cos };
}

/** A member's own LOCAL (0..w, 0..h) boundary point -> absolute page-space, applying its
 * own x/y (already panel-origin-adjusted by the caller) and rotation — the exact same
 * transform the main render loop applies via ctx.translate/ctx.rotate, just done in plain
 * point math since the union needs every member in one common coordinate space. */
function toWorld(p: Point, form: BubbleForm): Point {
  const center = { x: form.x + form.width / 2, y: form.y + form.height / 2 };
  return rotateAround({ x: form.x + p.x, y: form.y + p.y }, center, degToRad(form.rotation));
}

/** The inverse of toWorld, against the PRIMARY member's own form — converts an absolute
 * page-space point back into the local boundary coordinates drawBubbleBackground expects
 * for its `precomputedBoundary` parameter (drawn inside the same translate/rotate wrapper
 * as any procedurally-built boundary, so it lands back at the correct absolute position). */
function toPrimaryLocal(p: Point, primaryForm: BubbleForm): Point {
  const center = { x: primaryForm.x + primaryForm.width / 2, y: primaryForm.y + primaryForm.height / 2 };
  const unrotated = rotateAround(p, center, -degToRad(primaryForm.rotation));
  return { x: unrotated.x - primaryForm.x, y: unrotated.y - primaryForm.y };
}

function ringArea(ring: Point[]): number {
  let sum = 0;
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i];
    const b = ring[(i + 1) % ring.length];
    sum += a.x * b.y - b.x * a.y;
  }
  return Math.abs(sum) / 2;
}

/**
 * Unions every member's boundary (each transformed into absolute page-space by its own
 * position/rotation) and returns the result in the PRIMARY member's local, unrotated
 * boundary coordinates. Members not overlapping the rest can legitimately produce several
 * disjoint result polygons — the largest by area is used as "the" outline (a known v1
 * limitation for non-overlapping merges, see the plan's "Nicht im Umfang"). Falls back to
 * the primary's own plain boundary — no merge — if the union can't be computed at all
 * (degenerate geometry, fewer than 2 members), so a broken merge never breaks the render.
 */
export function computeMergedBoundary(members: MergeMemberInput[], primary: MergeMemberInput): Point[] {
  try {
    if (members.length < 2) throw new Error("not enough members to merge");
    const polygons = members.map((m) => {
      const local = buildBoundaryForStyle(m.form.bubbleStyle, m.bubble.shape, m.form.width, m.form.height, m.svgBoundary);
      if (local.length < 3) throw new Error("empty member boundary");
      const ring: [number, number][] = local.map((p) => {
        const w = toWorld(p, m.form);
        return [w.x, w.y];
      });
      return [ring];
    });
    const result = polygonClipping.union(polygons[0], ...polygons.slice(1));
    if (result.length === 0) throw new Error("empty union result");
    let best = result[0][0];
    let bestArea = ringArea(best.map(([x, y]) => ({ x, y })));
    for (const poly of result) {
      const area = ringArea(poly[0].map(([x, y]) => ({ x, y })));
      if (area > bestArea) {
        best = poly[0];
        bestArea = area;
      }
    }
    return best.map(([x, y]) => toPrimaryLocal({ x, y }, primary.form));
  } catch {
    return buildBoundaryForStyle(primary.form.bubbleStyle, primary.bubble.shape, primary.form.width, primary.form.height, primary.svgBoundary);
  }
}
