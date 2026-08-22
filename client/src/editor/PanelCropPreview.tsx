import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { Panel } from "../../../shared/src/layoutSchema";
import { polygonBounds } from "../../../shared/src/layoutSchema";
import { useHtmlImage } from "./useHtmlImage";

interface Props {
  imageUrl: string;
  panel: Panel;
  /** Fixed square side length in px (was a variable-height preview before — a tall/
   * narrow panel used to blow up the container's height and crowd out the actual
   * context data around it, see the "kleiner Fix nötig" report). */
  size?: number;
}

const MIN_ZOOM = 1;
const MAX_ZOOM = 6;
const ZOOM_STEP = 1.2;

/** Crops a Panel's bounding-box region out of the full-res page source image into a
 * small, fixed-size, zoomable/pannable `<canvas>` preview — used by
 * TranslatorContextPanel.tsx so whoever is working on a bubble can see its panel
 * without scrolling the main canvas, and without a tall panel eating the sidebar's
 * space. Bounding-box crop, not a true polygon mask (simpler, and panels are usually
 * close to their bounding box anyway since they mark a region rather than an exact
 * shape). Fits the whole panel into the square at zoom 1 (letterboxed on the shorter
 * axis), then lets the user scroll-zoom/drag-pan in for detail — same "scroll to
 * zoom, drag to pan" convention as the main page canvas. */
export function PanelCropPreview({ imageUrl, panel, size = 220 }: Props) {
  const { t } = useTranslation();
  const image = useHtmlImage(imageUrl);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const bounds = polygonBounds(panel.points);
  const w = Math.max(1, bounds.maxX - bounds.minX);
  const h = Math.max(1, bounds.maxY - bounds.minY);
  const baseScale = Math.min(size / w, size / h);

  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const dragRef = useRef<{ startX: number; startY: number; panX: number; panY: number } | null>(null);

  // A different panel/bubble is a fresh view — don't carry over a zoomed-in state
  // from whatever was previously being inspected.
  useEffect(() => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }, [panel.id]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !image) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const scale = baseScale * zoom;
    ctx.clearRect(0, 0, size, size);
    ctx.save();
    ctx.translate(size / 2 + pan.x, size / 2 + pan.y);
    ctx.scale(scale, scale);
    ctx.translate(-w / 2, -h / 2);
    ctx.drawImage(image, bounds.minX, bounds.minY, w, h, 0, 0, w, h);
    ctx.restore();
  }, [image, bounds.minX, bounds.minY, w, h, baseScale, zoom, pan, size]);

  function handleWheel(e: React.WheelEvent<HTMLCanvasElement>) {
    e.preventDefault();
    setZoom((z) => {
      const next = e.deltaY > 0 ? z / ZOOM_STEP : z * ZOOM_STEP;
      return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, next));
    });
  }

  function handlePointerDown(e: React.PointerEvent<HTMLCanvasElement>) {
    if (zoom <= MIN_ZOOM) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = { startX: e.clientX, startY: e.clientY, panX: pan.x, panY: pan.y };
  }

  function handlePointerMove(e: React.PointerEvent<HTMLCanvasElement>) {
    const drag = dragRef.current;
    if (!drag) return;
    setPan({ x: drag.panX + (e.clientX - drag.startX), y: drag.panY + (e.clientY - drag.startY) });
  }

  function handlePointerUp() {
    dragRef.current = null;
  }

  if (!image) return <p className="hint">{t("common.loading")}</p>;

  return (
    <div>
      <canvas
        ref={canvasRef}
        width={size}
        height={size}
        onWheel={handleWheel}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerUp}
        style={{
          display: "block",
          width: size,
          height: size,
          borderRadius: 4,
          border: "1px solid var(--border)",
          cursor: zoom > MIN_ZOOM ? "grab" : "default",
          touchAction: "none",
        }}
      />
      <p className="hint" style={{ margin: "4px 0 0" }}>
        {t("editor.translatorContextPanel.panelCropHint")}
      </p>
    </div>
  );
}
