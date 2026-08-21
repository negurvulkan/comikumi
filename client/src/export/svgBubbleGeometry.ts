import type { Point } from "../../../shared/src/layoutSchema";
import { api } from "../api/client";

/**
 * Parses an uploaded SVG bubble contour into a normalized (0..1) boundary
 * Point[] — the same shape buildBoundaryForStyle() produces for the
 * procedural bubble styles, so the tail-splice/chain/detached-tail logic in
 * bubbleBackground.ts needs no SVG-specific branch. Sampling uses the native
 * SVGGeometryElement.getPointAtLength() (works for <path>/<rect>/<circle>/
 * <ellipse>/<polygon>/<polyline> alike) — no parsing library needed.
 */

const GEOMETRY_SELECTOR = "path, rect, circle, ellipse, polygon, polyline";
const SAMPLE_STEPS = 128;

function bboxArea(el: SVGGraphicsElement): number {
  try {
    const box = el.getBBox();
    return box.width * box.height;
  } catch {
    return 0;
  }
}

/** Picks the largest geometry element by bounding-box area — a multi-path SVG (outline + decorative extras) uses its main outline. Must be called while `svg` is attached to the document (getBBox needs layout). */
function pickLargestGeometry(svg: SVGSVGElement): SVGGeometryElement | null {
  const candidates = Array.from(svg.querySelectorAll<SVGGeometryElement & SVGGraphicsElement>(GEOMETRY_SELECTOR));
  let best: SVGGeometryElement & SVGGraphicsElement | null = null;
  let bestArea = -1;
  for (const el of candidates) {
    const area = bboxArea(el);
    if (area > bestArea) {
      bestArea = area;
      best = el;
    }
  }
  return best;
}

function sampleGeometry(el: SVGGeometryElement): Point[] {
  const total = el.getTotalLength();
  if (!total || !isFinite(total)) return [];
  const points: Point[] = [];
  for (let i = 0; i < SAMPLE_STEPS; i++) {
    const p = el.getPointAtLength((i / SAMPLE_STEPS) * total);
    points.push({ x: p.x, y: p.y });
  }
  return points;
}

/** Maps sampled points into a 0..1 box via the geometry's own bbox — x/y normalized independently so a later non-uniform bubble resize (stretch) behaves the same as the procedural oval/rect boundaries already do. */
function normalize(points: Point[], el: SVGGeometryElement & SVGGraphicsElement): Point[] {
  const box = el.getBBox();
  const w = box.width || 1;
  const h = box.height || 1;
  return points.map((p) => ({ x: (p.x - box.x) / w, y: (p.y - box.y) / h }));
}

/** Parses `svgText`, returns the normalized boundary of its largest geometry element, or null if none found/parseable. */
function parseSvgBoundary(svgText: string): Point[] | null {
  const doc = new DOMParser().parseFromString(svgText, "image/svg+xml");
  const svg = doc.documentElement as unknown as SVGSVGElement;
  if (!svg || svg.tagName.toLowerCase() !== "svg") return null;

  // getBBox()/getPointAtLength() need the element attached to a rendered
  // document (Firefox returns an all-zero bbox for a fully detached tree) —
  // host it off-screen (not display:none, which also breaks layout in
  // Firefox) just long enough to measure and sample.
  const host = document.createElement("div");
  host.style.cssText = "position:absolute; left:-99999px; top:-99999px; width:0; height:0; overflow:hidden;";
  document.body.appendChild(host);
  host.appendChild(svg);
  try {
    const el = pickLargestGeometry(svg);
    if (!el) return null;
    const raw = sampleGeometry(el);
    if (raw.length === 0) return null;
    return normalize(raw, el as SVGGeometryElement & SVGGraphicsElement);
  } finally {
    document.body.removeChild(host);
  }
}

const cache = new Map<string, Point[] | null>();
const loading = new Map<string, Promise<Point[] | null>>();

/** Synchronous lookup for use inside a Konva sceneFunc / canvas draw call — null until ensureSvgBubbleBoundaryLoaded() for this file has resolved. */
export function getCachedSvgBubbleBoundary(fileName: string | null | undefined): Point[] | null {
  if (!fileName) return null;
  return cache.get(fileName) ?? null;
}

/** Whether `fileName` has already finished loading (successfully or not) — lets a caller skip re-triggering a version bump for files it already knows about. */
export function isSvgBubbleBoundaryCached(fileName: string): boolean {
  return cache.has(fileName);
}

/** Loads + parses + caches a bubble SVG exactly once (Promise-memoized, same pattern as ensureFontsLoaded in editor/fontLoader.ts). */
export function ensureSvgBubbleBoundaryLoaded(fileName: string): Promise<Point[] | null> {
  if (cache.has(fileName)) return Promise.resolve(cache.get(fileName) ?? null);
  const existing = loading.get(fileName);
  if (existing) return existing;

  const promise = fetch(api.bubbleSvgFileUrl(fileName))
    .then((r) => (r.ok ? r.text() : Promise.reject(new Error(`HTTP ${r.status}`))))
    .then((text) => parseSvgBoundary(text))
    .catch((err) => {
      console.warn(`SVG-Sprechblase "${fileName}" konnte nicht geladen werden`, err);
      return null;
    })
    .then((points) => {
      cache.set(fileName, points);
      loading.delete(fileName);
      return points;
    });

  loading.set(fileName, promise);
  return promise;
}
