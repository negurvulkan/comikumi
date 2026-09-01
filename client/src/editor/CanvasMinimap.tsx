import { useTranslation } from "react-i18next";
import type { Bubble, Panel } from "../../../shared/src/layoutSchema";
import { polygonBounds } from "../../../shared/src/layoutSchema";

interface Props {
  imageWidth: number;
  imageHeight: number;
  bubbles: Bubble[];
  panels: Panel[];
  /** Currently visible portion of the page, in the SAME unscaled image-px coordinate
   * space as Bubble.x/y/width/height and Panel.points — PageCanvas.tsx derives this
   * from its own zoom/pan state each render. */
  visibleRect: { x: number; y: number; width: number; height: number };
  /** Fired with an image-px point to recenter the main viewport on (zoom unchanged) —
   * PageCanvas.tsx's panToImagePoint, mirroring the same stage-position math its
   * existing focusOnPanel()/zoomAt() already use. */
  onPanTo: (imageX: number, imageY: number) => void;
}

const MAX_WIDTH_PX = 160;
const MAX_HEIGHT_PX = 120;
// Below this many elements, the full-size canvas already shows everything at once —
// a minimap would just be a redundant tiny copy of what's already fully on screen
// (see the TODO's own "bei Seiten mit vielen Panels/Bubbles" framing).
const MIN_ELEMENT_COUNT = 6;

/** A child bubble's x/y/corners are relative to its parent panel's origin (see
 * PanelPointsSchema.origin) — same helper duplicated identically in every other
 * renderer (renderPageToPng.ts, server/src/lib/pageRaster.ts) since it's a 4-line,
 * render-context-specific lookup, not general-purpose math. Unassigned/stale-panelId
 * bubbles resolve to {x:0,y:0} (a no-op shift), matching how they're already absolute. */
function panelOriginFor(bubble: Bubble, panels: Panel[]): { x: number; y: number } {
  const panel = bubble.panelId ? panels.find((p) => p.id === bubble.panelId) : undefined;
  return panel?.origin ?? { x: 0, y: 0 };
}

export function boundsOf(bubble: Bubble, panels: Panel[]): { minX: number; minY: number; maxX: number; maxY: number } {
  const origin = panelOriginFor(bubble, panels);
  if (bubble.shape === "quad" && bubble.corners) {
    const xs = bubble.corners.map((c) => c.x + origin.x);
    const ys = bubble.corners.map((c) => c.y + origin.y);
    return { minX: Math.min(...xs), minY: Math.min(...ys), maxX: Math.max(...xs), maxY: Math.max(...ys) };
  }
  return {
    minX: bubble.x + origin.x,
    minY: bubble.y + origin.y,
    maxX: bubble.x + origin.x + bubble.width,
    maxY: bubble.y + origin.y + bubble.height,
  };
}

/** Small always-visible overview of the whole page (panels + bubbles as tiny boxes,
 * plus a rectangle marking what's currently in view) with click-to-recenter — lets a
 * translator jump across a busy, heavily-panel'd page without repeatedly zooming out
 * and back in. Plain absolutely-positioned HTML/CSS, not a second Konva Stage — a
 * decorative overview this small doesn't need canvas rendering, and staying in HTML
 * keeps it trivial to position as a corner overlay independent of the Stage's own
 * coordinate system. Ignores per-language form/panel overrides (uses base
 * geometry) — an overview only needs to be roughly right, not pixel-exact. */
export function CanvasMinimap({ imageWidth, imageHeight, bubbles, panels, visibleRect, onPanTo }: Props) {
  const { t } = useTranslation();
  if (imageWidth <= 0 || imageHeight <= 0 || bubbles.length + panels.length < MIN_ELEMENT_COUNT) return null;

  const mapScale = Math.min(MAX_WIDTH_PX / imageWidth, MAX_HEIGHT_PX / imageHeight);
  const mapWidth = imageWidth * mapScale;
  const mapHeight = imageHeight * mapScale;

  function handleClick(e: React.MouseEvent<HTMLDivElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    onPanTo((e.clientX - rect.left) / mapScale, (e.clientY - rect.top) / mapScale);
  }

  return (
    <div
      className="canvas-minimap"
      style={{ width: mapWidth, height: mapHeight }}
      onClick={handleClick}
      title={t("editor.canvas.minimapHint")}
    >
      {panels.map((panel) => {
        const b = polygonBounds(panel.points);
        return (
          <div
            key={panel.id}
            className="canvas-minimap-panel"
            style={{ left: b.minX * mapScale, top: b.minY * mapScale, width: (b.maxX - b.minX) * mapScale, height: (b.maxY - b.minY) * mapScale }}
          />
        );
      })}
      {bubbles.map((bubble) => {
        const b = boundsOf(bubble, panels);
        return (
          <div
            key={bubble.id}
            className="canvas-minimap-bubble"
            style={{ left: b.minX * mapScale, top: b.minY * mapScale, width: (b.maxX - b.minX) * mapScale, height: (b.maxY - b.minY) * mapScale }}
          />
        );
      })}
      <div
        className="canvas-minimap-viewport"
        style={{
          left: Math.max(0, visibleRect.x * mapScale),
          top: Math.max(0, visibleRect.y * mapScale),
          width: Math.min(mapWidth, visibleRect.width * mapScale),
          height: Math.min(mapHeight, visibleRect.height * mapScale),
        }}
      />
    </div>
  );
}
