import type { Point } from "../../../shared/src/layoutSchema";
import { api } from "../api/client";

/**
 * Parses an uploaded SVG bubble contour into a normalized (0..1) boundary
 * Point[] — the same shape buildBoundaryForStyle() produces for the
 * procedural bubble styles, so the tail-splice/chain/detached-tail logic in
 * bubbleBackground.ts needs no SVG-specific branch. Sampling uses the native
 * SVGGeometryElement.getPointAtLength() (works for <path>/<rect>/<circle>/
 * <ellipse>/<polygon>/<polyline> alike) — no parsing library needed.
 *
 * Optionally also splits the SVG into an "outline" + "interior" pair — for a
 * bubble whose decorative outline (e.g. a jagged shout-style burst, often
 * drawn as many separate, deliberately overlapping spike shapes rather than
 * one continuous contour) is too irregular to wrap text against or fill/
 * stroke as ComiKumi's own boundary, an artist can mark a second, smoother
 * shape as the actual functional bubble. Convention: `id="outline"` on the
 * decorative geometry (or a <g> wrapping it) and `id="interior"` on the
 * text-safe shape — either id is optional and falls back to today's
 * single-shape behavior, so every already-uploaded SVG keeps working
 * unchanged. When both are present:
 *   - the INTERIOR becomes "the boundary" everywhere else in the app already
 *     means that term — fill/tail attachment/clip-line, and (via
 *     textLayout.ts's existing flat SVG_BUBBLE_PADDING_RATIO inset,
 *     unchanged) the text box. It's normalized against the OUTLINE's own
 *     overall bbox, not its own — so an interior deliberately offset within
 *     the outline keeps that offset once both are stretched together onto
 *     the bubble's actual box (see normalize()). drawBubbleBackground() in
 *     bubbleBackground.ts fills it with the bubble's normal fill color/
 *     gradient/screentone but skips the stroke entirely — see
 *     getCachedSvgBubbleOutline below for why.
 *   - the OUTLINE becomes a set of normalized (0..1, same shared reference
 *     frame as the boundary) closed subpaths — see getCachedSvgBubbleOutline
 *     — filled with the bubble's stroke color as a single flat multi-subpath
 *     canvas fill, drawn on top of the interior. Kept as PURE VECTOR data
 *     (never rasterized to a bitmap) so it stays crisp at any zoom/export
 *     resolution: canvas's native fill() already composites overlapping/
 *     adjacent subpaths correctly via the nonzero winding rule, the exact
 *     same math the SVG spec itself uses, so a hand-drawn burst's outline —
 *     confirmed on a real asset to be a single <path> with 238 separate "M"
 *     subpath commands — needs no polygon-union library and no
 *     rasterize-then-redraw step. splitPathIntoSubpaths() below splits the
 *     `d` string structurally (exact, not sampled) and resolves each
 *     subpath's own geometry independently — see its doc comment for why
 *     that's also what makes this fast on a real multi-hundred-subpath file.
 * When only ONE of outline/interior is present, that one becomes "the
 * boundary" via ordinary single-shape sampling (today's pre-existing
 * behavior/limitation — a multi-subpath OUTLINE-ONLY SVG, with no separate
 * interior to take over as the boundary, is not fixed by this file; give it
 * an `id="interior"` too to get the robust path above).
 */

const GEOMETRY_SELECTOR = "path, rect, circle, ellipse, polygon, polyline";
const SAMPLE_STEPS = 128;
// Per-subpath sample density for the outline splitter below — enough to resolve a burst
// spike's curve shape without being a noticeable cost per subpath (there can be hundreds).
const SAMPLE_STEPS_PER_SUBPATH = 24;

const SVG_NUMBER = "[+-]?(?:\\d*\\.\\d+|\\d+\\.?\\d*)(?:[eE][+-]?\\d+)?";
const LEADING_COORDINATE_PAIR = new RegExp(`^\\s*(${SVG_NUMBER})[\\s,]*(${SVG_NUMBER})`);

type Geometry = SVGGeometryElement & SVGGraphicsElement;
type Box = { x: number; y: number; width: number; height: number };

function bboxArea(el: SVGGraphicsElement): number {
  try {
    const box = el.getBBox();
    return box.width * box.height;
  } catch {
    return 0;
  }
}

/** Every geometry element within `root` (a <g> scope or the whole <svg>) — `exclude` (and
 * anything nested inside it) is skipped, so collecting an unlabeled outline's geometry
 * doesn't accidentally sweep up an explicitly `id="interior"` shape. */
function collectGeometries(root: ParentNode, exclude?: Element | null): Geometry[] {
  return Array.from(root.querySelectorAll<Geometry>(GEOMETRY_SELECTOR)).filter(
    (el) => !exclude || (el !== exclude && !exclude.contains(el))
  );
}

/** Picks the largest geometry element within `root` by bounding-box area — a multi-shape SVG
 * (outline + decorative extras) uses its main outline. Must be called while the SVG is
 * attached to the document (getBBox needs layout). */
function pickLargestGeometry(root: ParentNode, exclude?: Element | null): Geometry | null {
  const candidates = collectGeometries(root, exclude);
  let best: Geometry | null = null;
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

/** The geometry an already-resolved `id="outline"`/`id="interior"` element contributes:
 * itself if it's already a supported shape, otherwise its largest descendant (so the id can
 * sit on a <path> directly or on a <g> wrapping one/several). */
function geometryWithinScope(scopeEl: Element): Geometry | null {
  if (scopeEl.matches(GEOMETRY_SELECTOR)) return scopeEl as unknown as Geometry;
  return pickLargestGeometry(scopeEl);
}

/** getPointAtLength()/getBBox() both report positions in `el`'s OWN local coordinate
 * system — which, confirmed empirically against a real asset, does NOT include the
 * cumulative effect of `el`'s ANCESTOR transforms (a `<g id="outline">` nested inside a
 * `<g transform="translate(...)">` layer reports a bbox offset by the exact NEGATIVE of
 * that layer's translate, while the root `<svg>`'s own getBBox() — which has no ancestor
 * left to exclude — reports the correct, fully-transformed position). Two sibling groups
 * under the SAME parent are internally consistent with each other in their shared local
 * space (fine for normalizing one against the other directly), but that's not enough once
 * outline and interior need to be compared/combined at all reliably — everything is
 * converted into the SVG ROOT's own user-space (viewBox units) up front instead.
 *
 * `el.getCTM()` alone is NOT that transform — it maps to the SVG's rendered CSS-pixel
 * viewport, which picks up an EXTRA scale factor whenever the root's `width`/`height` use
 * a physical unit (confirmed empirically: a real asset declaring `width="94.98mm"` gave a
 * getCTM() with a≈3.78, exactly the browser's mm-to-px factor at 96dpi — silently
 * multiplying every coordinate by that if used directly). `svg.getCTM()` picks up that
 * SAME factor, so composing `svg.getCTM().inverse() × el.getCTM()` cancels it out and
 * leaves exactly the local-to-viewBox-space transform, confirmed to reproduce the
 * declared viewBox's own numbers exactly on the same real asset. */
function toRootSpace(svg: SVGSVGElement, el: Geometry, points: Point[]): Point[] {
  const elCtm = el.getCTM();
  if (!elCtm) return points;
  const svgCtm = svg.getCTM();
  const ctm = svgCtm ? svgCtm.inverse().multiply(elCtm) : elCtm;
  return points.map((p) => {
    const transformed = new DOMPoint(p.x, p.y).matrixTransform(ctm);
    return { x: transformed.x, y: transformed.y };
  });
}

function bboxToRootSpace(svg: SVGSVGElement, el: SVGGraphicsElement): Box {
  const box = el.getBBox();
  const corners = toRootSpace(svg, el as unknown as Geometry, [
    { x: box.x, y: box.y },
    { x: box.x + box.width, y: box.y },
    { x: box.x + box.width, y: box.y + box.height },
    { x: box.x, y: box.y + box.height },
  ]);
  const xs = corners.map((p) => p.x);
  const ys = corners.map((p) => p.y);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  return { x: minX, y: minY, width: Math.max(...xs) - minX, height: Math.max(...ys) - minY };
}

function sampleGeometry(svg: SVGSVGElement, el: Geometry): Point[] {
  const total = el.getTotalLength();
  if (!total || !isFinite(total)) return [];
  const points: Point[] = [];
  for (let i = 0; i < SAMPLE_STEPS; i++) {
    const p = el.getPointAtLength((i / SAMPLE_STEPS) * total);
    points.push({ x: p.x, y: p.y });
  }
  return toRootSpace(svg, el, points);
}

/** A moveto can be followed by extra bare coordinate pairs with no repeated command letter —
 * the SVG spec treats those as IMPLICIT linetos in the SAME relative/absolute mode as the
 * moveto itself (confirmed present on the real 238-subpath asset: "m dx,dy dx2,dy2 c …"). The
 * one exception (also spec-mandated) is the very first moveto of the whole multi-subpath
 * path: even written lowercase, its OWN leading pair is absolute, but any implicit pairs
 * after that first one are still relative. This walks the leading run of bare pairs
 * explicitly and turns each into its own absolute M/L command — an earlier version of this
 * function uppercased just the command letter and left the rest of the string untouched,
 * which silently flips an implicit pair's mode too and sends it to a wildly wrong coordinate
 * (confirmed: produced a stray subpath spanning most of the canvas on the real asset). */
function absolutizeLeadingMoveto(
  cmd: "M" | "m",
  rest: string,
  prevX: number,
  prevY: number,
  isFirstOfWholePath: boolean
): { prefix: string; newX: number; newY: number; remainder: string } {
  let x = prevX;
  let y = prevY;
  let cursor = 0;
  const parts: string[] = [];
  let pairIndex = 0;
  for (;;) {
    const match = rest.slice(cursor).match(LEADING_COORDINATE_PAIR);
    if (!match) break;
    const px = parseFloat(match[1]);
    const py = parseFloat(match[2]);
    const isAbsolute = cmd === "M" || (pairIndex === 0 && isFirstOfWholePath);
    if (isAbsolute) {
      x = px;
      y = py;
    } else {
      x += px;
      y += py;
    }
    parts.push((pairIndex === 0 ? "M " : "L ") + x + "," + y);
    pairIndex++;
    cursor += match[0].length;
  }
  return { prefix: parts.join(" "), newX: x, newY: y, remainder: rest.slice(cursor) };
}

/** Splits a single (possibly multi-subpath) <path>'s `d` string into per-subpath point
 * arrays (root-space, see toRootSpace). Every M/m in a path's `d` attribute unambiguously
 * starts a new subpath (the letter never occurs inside an SVG number), so splitting via
 * `d.split(/(?=[Mm])/)` is exact and free — an earlier version instead densely sampled the
 * WHOLE element's length and split the result via a chord-distance heuristic, which was
 * mathematically sound but confirmed catastrophically slow on the real 238-subpath asset
 * (~94s: getPointAtLength() cost scales with the whole path's complexity, so 4000 calls on
 * an 80,000-character `d` string is 4000× that whole cost, not 4000× a small constant). The
 * one thing string-splitting alone can't resolve is a RELATIVE moveto for any subpath after
 * the first — relative to the previous subpath's own end point, which isn't known just from
 * that substring — so each subpath is sampled via its own tiny `resolver` <path> element
 * (see absolutizeLeadingMoveto) whose cost is proportional to THAT subpath's own complexity,
 * confirmed on the real asset to bring the total down to well under a second. */
function splitPathIntoSubpaths(svg: SVGSVGElement, pathEl: Geometry): Point[][] {
  const d = pathEl.getAttribute("d") ?? "";
  const rawParts = d
    .split(/(?=[Mm])/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  if (rawParts.length === 0) return [];

  const resolver = document.createElementNS("http://www.w3.org/2000/svg", "path") as unknown as Geometry;
  pathEl.parentNode?.insertBefore(resolver, pathEl.nextSibling);
  const results: Point[][] = [];
  let prevX = 0;
  let prevY = 0;
  try {
    for (let i = 0; i < rawParts.length; i++) {
      const part = rawParts[i];
      const cmd = part[0] as "M" | "m";
      const rest = part.slice(1);
      const { prefix, newX, newY, remainder } = absolutizeLeadingMoveto(cmd, rest, prevX, prevY, i === 0);
      if (!prefix) continue;
      resolver.setAttribute("d", prefix + remainder);
      const total = resolver.getTotalLength();
      if (!total || !isFinite(total)) {
        prevX = newX;
        prevY = newY;
        continue;
      }
      const points: Point[] = [];
      for (let s = 0; s <= SAMPLE_STEPS_PER_SUBPATH; s++) {
        const p = resolver.getPointAtLength((s / SAMPLE_STEPS_PER_SUBPATH) * total);
        points.push({ x: p.x, y: p.y });
      }
      const endPoint = resolver.getPointAtLength(total);
      prevX = endPoint.x;
      prevY = endPoint.y;
      if (points.length >= 3) results.push(toRootSpace(svg, pathEl, points));
    }
  } finally {
    resolver.remove();
  }
  return results;
}

/** Every subpath of every geometry element found within `scope` — the outline can be one
 * multi-subpath <path>, several sibling elements, or both at once, all handled uniformly by
 * flattening into one list of closed subpaths. A <path> is split via splitPathIntoSubpaths;
 * any other geometry type (rect/circle/ellipse/polygon/polyline) has only a single implicit
 * subpath, so it's sampled directly. */
function subpathsForScope(svg: SVGSVGElement, scope: Element): Point[][] {
  const all: Point[][] = [];
  for (const geom of collectGeometries(scope)) {
    if (geom.tagName.toLowerCase() === "path") {
      all.push(...splitPathIntoSubpaths(svg, geom));
    } else {
      const points = sampleGeometry(svg, geom);
      if (points.length >= 3) all.push(points);
    }
  }
  return all;
}

/** Maps points into a 0..1 box via the given (root-space, see bboxToRootSpace) reference
 * bbox — x/y normalized independently so a later non-uniform bubble resize (stretch)
 * behaves the same as the procedural oval/rect boundaries already do. */
function normalize(points: Point[], box: Box): Point[] {
  const w = box.width || 1;
  const h = box.height || 1;
  return points.map((p) => ({ x: (p.x - box.x) / w, y: (p.y - box.y) / h }));
}

export interface SvgBubbleBoundaries {
  /** The shape ComiKumi treats as "the bubble" for fill/tail/clip/text-box purposes — see
   * this file's top doc comment for exactly which underlying SVG shape this resolves to
   * depending on whether an outline+interior split is present. */
  boundary: Point[];
  /** Normalized (0..1, same shared reference frame as `boundary`) closed subpaths making up
   * the decorative outline art, or null when this SVG has no separate `id="outline"`+
   * `id="interior"` split — see this file's top doc comment for why these stay pure vector
   * data instead of a rasterized image. */
  outlineSubpaths: Point[][] | null;
}

/** Parses `svgText`, returns the resolved boundary (+ optional decorative outline
 * subpaths), or null if no usable geometry is found at all. */
function parseSvgBoundaries(svgText: string): SvgBubbleBoundaries | null {
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
    // Looked up via querySelector, NOT doc.getElementById — appending the parsed root into
    // the live-document host above adopts it into `document`, at which point the ORIGINAL
    // parsed Document's own getElementById stops finding anything in it (confirmed live:
    // adoption moves the subtree out from under `doc`). `svg` stays a valid live reference
    // either way.
    const interiorScope = svg.querySelector("#interior");
    const outlineScope = svg.querySelector("#outline");

    const functionalScope = interiorScope ?? outlineScope;
    const functionalEl = functionalScope ? geometryWithinScope(functionalScope) : pickLargestGeometry(svg, null);
    if (!functionalEl) return null;

    const functionalRaw = sampleGeometry(svg, functionalEl);
    if (functionalRaw.length === 0) return null;

    // The outline defines the bubble's full visual extent (a burst's rays reach well past
    // its own interior), so both the boundary and the outline subpaths are normalized
    // against ITS bbox (root space, see bboxToRootSpace) when one exists — otherwise just
    // the functional shape's own bbox, identical to today's original single-shape behavior.
    const referenceBox = outlineScope
      ? bboxToRootSpace(svg, outlineScope as unknown as SVGGraphicsElement)
      : bboxToRootSpace(svg, functionalEl);
    const boundary = normalize(functionalRaw, referenceBox);

    let outlineSubpaths: Point[][] | null = null;
    if (outlineScope && interiorScope) {
      const raw = subpathsForScope(svg, outlineScope);
      outlineSubpaths = raw.map((sp) => normalize(sp, referenceBox));
    }

    return { boundary, outlineSubpaths };
  } finally {
    document.body.removeChild(host);
  }
}

const cache = new Map<string, SvgBubbleBoundaries | null>();
const loading = new Map<string, Promise<SvgBubbleBoundaries | null>>();

/** Synchronous lookup for use inside a Konva sceneFunc / canvas draw call — null until ensureSvgBubbleBoundaryLoaded() for this file has resolved. */
export function getCachedSvgBubbleBoundary(fileName: string | null | undefined): Point[] | null {
  if (!fileName) return null;
  return cache.get(fileName)?.boundary ?? null;
}

/** The cached decorative outline subpaths (see SvgBubbleBoundaries), or null both while
 * unloaded and when this SVG has no outline+interior split — callers can't tell those apart
 * from this alone (nor need to: both mean "nothing extra to draw"). */
export function getCachedSvgBubbleOutline(fileName: string | null | undefined): Point[][] | null {
  if (!fileName) return null;
  return cache.get(fileName)?.outlineSubpaths ?? null;
}

/** Whether `fileName` has already finished loading (successfully or not) — lets a caller skip re-triggering a version bump for files it already knows about. */
export function isSvgBubbleBoundaryCached(fileName: string): boolean {
  return cache.has(fileName);
}

/** Loads + parses + caches a bubble SVG's boundary (and decorative outline subpaths, if
 * any) exactly once (Promise-memoized, same pattern as ensureFontsLoaded in
 * editor/fontLoader.ts). Returns just the boundary — existing callers only ever wanted
 * that; use getCachedSvgBubbleOutline() afterward for the outline, already populated from
 * this same parse pass. */
export function ensureSvgBubbleBoundaryLoaded(fileName: string): Promise<Point[] | null> {
  if (cache.has(fileName)) return Promise.resolve(cache.get(fileName)?.boundary ?? null);
  const existing = loading.get(fileName);
  if (existing) return existing.then((b) => b?.boundary ?? null);

  const promise = fetch(api.bubbleSvgFileUrl(fileName))
    .then((r) => (r.ok ? r.text() : Promise.reject(new Error(`HTTP ${r.status}`))))
    .then((text) => parseSvgBoundaries(text))
    .catch((err) => {
      console.warn(`SVG-Sprechblase "${fileName}" konnte nicht geladen werden`, err);
      return null;
    })
    .then((boundaries) => {
      cache.set(fileName, boundaries);
      loading.delete(fileName);
      return boundaries;
    });

  loading.set(fileName, promise);
  return promise.then((b) => b?.boundary ?? null);
}
