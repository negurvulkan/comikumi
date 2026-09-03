import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Modal } from "./Modal";
import type { CleanBox } from "../ocr/useCleanPageRun";

interface Props {
  imageUrl: string;
  imageWidth: number;
  imageHeight: number;
  initialBoxes: CleanBox[];
  onConfirm: (maskDataUrl: string) => void;
  onCancel: () => void;
}

type Tool = "rect" | "freehand" | "polygon" | "brush-add" | "brush-remove";

/** Minimum size (DISPLAY px) for a click-drag to count as "drew something" rather than
 * an accidental click — avoids littering the mask with invisible slivers/dots from a
 * jittery click. Also used as the minimum bounding-box diagonal for a freehand shape. */
const MIN_DRAW_SIZE = 6;
/** How close (DISPLAY px) a polygon click needs to land to the first vertex to count
 * as "close the shape" instead of "add another vertex". */
const POLYGON_CLOSE_DISTANCE = 10;
/** Solid paint color for every "add to mask" tool — its RGB value is never actually
 * read (see the ALPHA-channel doc comment below), only its opacity. Matches the same
 * red this editor has always used for the mask overlay. */
const MASK_PAINT_COLOR = "#ff6c6c";
const MAX_UNDO_STEPS = 30;

/** Manual mask-correction step before Cleaning/Inpainting actually runs — shown
 * between detection (useCleanPageRun.ts's start()) and the server reconstruction
 * (confirmMask()). Auto-Bubbles' detector only marks the TEXT it found, not
 * necessarily the whole bubble (outline, tail) — this lets the user paint over/around
 * the detected regions with five tools (rectangle, freehand lasso, polygon, and a
 * brush that adds to or subtracts from the mask) before anything server-side runs.
 *
 * Unlike the earlier rectangle-only version, the mask is a real raster (an HTML
 * canvas), not a list of shape objects — once a brush stroke is involved there's no
 * compact vector form that still covers every tool uniformly, so every tool paints
 * onto the SAME canvas instead of manipulating separate editable objects. Two stacked
 * canvases: `maskCanvasRef` holds the actual committed mask (what gets sent to the
 * server), `draftCanvasRef` sits on top and only ever shows the CURRENTLY-being-drawn
 * shape (rectangle/freehand outline/polygon-in-progress) — cleared and redrawn on
 * every pointer move, committed into the mask canvas only once the shape is finished.
 * Brush strokes paint directly onto the mask canvas in real time (there's nothing to
 * preview — a stroke IS its own final result, same as any raster paint program).
 *
 * The mask canvas is painted with fully OPAQUE color for "add" and
 * `globalCompositeOperation: "destination-out"` for "remove" — so the canvas's own
 * ALPHA channel (not a color channel) is the real 0/1 mask signal: painted = opaque,
 * erased/untouched = transparent. That's what the server decodes too (see
 * server/src/lib/inpainting.ts / routes/pages.ts) — alpha survives compositing
 * (including brush erasing, which cuts a literal hole) more predictably than trying to
 * keep a color channel meaningful under composite operations. CSS `opacity` on the
 * canvas ELEMENT (not its pixel data) is what gives the visible red-tint-over-the-page
 * look, so the underlying pixel data stays a clean binary mask regardless of how
 * visually subtle or bold the overlay looks. */
export function CleanPageMaskEditor({ imageUrl, imageWidth, imageHeight, initialBoxes, onConfirm, onCancel }: Props) {
  const { t } = useTranslation();
  const [tool, setTool] = useState<Tool>("rect");
  const [brushSize, setBrushSize] = useState(40);
  const [canUndo, setCanUndo] = useState(false);
  const [polygonPointCount, setPolygonPointCount] = useState(0);

  const maskCanvasRef = useRef<HTMLCanvasElement>(null);
  const draftCanvasRef = useRef<HTMLCanvasElement>(null);
  const undoStackRef = useRef<ImageData[]>([]);
  const rectAnchorRef = useRef<{ x: number; y: number } | null>(null);
  const freehandPointsRef = useRef<{ x: number; y: number }[]>([]);
  const polygonPointsRef = useRef<{ x: number; y: number }[]>([]);
  const brushStrokeRef = useRef<{ x: number; y: number } | null>(null);

  // Fits the page image into a fixed display width regardless of its real resolution
  // (manga scans are typically much larger than any reasonable modal) — the mask
  // canvas is sized to match 1:1 (canvas pixel buffer == CSS size), so every pointer
  // handler below works directly in canvas-local pixels with no extra scale math; the
  // scale factor only resurfaces once, when exporting the finished mask back up to
  // full image resolution (see confirm()).
  const DISPLAY_WIDTH = 640;
  const scale = Math.min(1, DISPLAY_WIDTH / imageWidth);
  const displayWidth = Math.round(imageWidth * scale);
  const displayHeight = Math.round(imageHeight * scale);

  function maskCtx() {
    return maskCanvasRef.current!.getContext("2d")!;
  }
  function draftCtx() {
    return draftCanvasRef.current!.getContext("2d")!;
  }

  // Seeds the mask canvas with the auto-detected regions once, on mount, then pushes
  // that seeded state as the undo floor — repeated Undo lands back on "just the
  // detected boxes", not a blank canvas (Clear is the explicit way to get that).
  useEffect(() => {
    const ctx = maskCtx();
    ctx.fillStyle = MASK_PAINT_COLOR;
    for (const box of initialBoxes) {
      ctx.fillRect(box.x * scale, box.y * scale, box.width * scale, box.height * scale);
    }
    pushUndoSnapshot();
    // Seeds exactly once — re-running on every re-render would keep re-adding the
    // detected boxes on top of whatever the user has since painted/erased.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function pushUndoSnapshot() {
    const snapshot = maskCtx().getImageData(0, 0, displayWidth, displayHeight);
    undoStackRef.current.push(snapshot);
    if (undoStackRef.current.length > MAX_UNDO_STEPS) undoStackRef.current.shift();
    setCanUndo(true);
  }

  function handleUndo() {
    const snapshot = undoStackRef.current.pop();
    if (!snapshot) return;
    maskCtx().putImageData(snapshot, 0, 0);
    setCanUndo(undoStackRef.current.length > 0);
  }

  function handleClear() {
    pushUndoSnapshot();
    maskCtx().clearRect(0, 0, displayWidth, displayHeight);
  }

  function clearDraft() {
    draftCtx().clearRect(0, 0, displayWidth, displayHeight);
  }

  function pointFromEvent(e: React.PointerEvent): { x: number; y: number } {
    const rect = draftCanvasRef.current!.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  function pathFor(points: { x: number; y: number }[]): Path2D {
    const path = new Path2D();
    if (points.length === 0) return path;
    path.moveTo(points[0].x, points[0].y);
    for (const p of points.slice(1)) path.lineTo(p.x, p.y);
    return path;
  }

  function commitPath(points: { x: number; y: number }[]) {
    pushUndoSnapshot();
    const ctx = maskCtx();
    ctx.globalCompositeOperation = "source-over";
    ctx.fillStyle = MASK_PAINT_COLOR;
    ctx.fill(pathFor(points));
  }

  function paintBrushSegment(from: { x: number; y: number }, to: { x: number; y: number }) {
    const ctx = maskCtx();
    ctx.globalCompositeOperation = tool === "brush-remove" ? "destination-out" : "source-over";
    ctx.fillStyle = MASK_PAINT_COLOR;
    ctx.strokeStyle = MASK_PAINT_COLOR;
    ctx.lineWidth = brushSize;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.beginPath();
    ctx.arc(from.x, from.y, brushSize / 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(from.x, from.y);
    ctx.lineTo(to.x, to.y);
    ctx.stroke();
    ctx.globalCompositeOperation = "source-over";
  }

  function drawDraftShape(points: { x: number; y: number }[], close: boolean) {
    clearDraft();
    if (points.length < 2) return;
    const ctx = draftCtx();
    ctx.strokeStyle = "#6c8cff";
    ctx.lineWidth = 2;
    ctx.fillStyle = "rgba(108, 140, 255, 0.25)";
    const path = pathFor(points);
    if (close) path.closePath();
    ctx.fill(path);
    ctx.stroke(path);
  }

  function handlePointerDown(e: React.PointerEvent<HTMLCanvasElement>) {
    if (e.button !== 0) return;
    const point = pointFromEvent(e);
    e.currentTarget.setPointerCapture(e.pointerId);

    if (tool === "rect") {
      rectAnchorRef.current = point;
    } else if (tool === "freehand") {
      freehandPointsRef.current = [point];
    } else if (tool === "polygon") {
      const points = polygonPointsRef.current;
      if (points.length >= 3) {
        const dx = point.x - points[0].x;
        const dy = point.y - points[0].y;
        if (Math.hypot(dx, dy) <= POLYGON_CLOSE_DISTANCE) {
          commitPath(points);
          polygonPointsRef.current = [];
          setPolygonPointCount(0);
          clearDraft();
          return;
        }
      }
      polygonPointsRef.current = [...points, point];
      setPolygonPointCount(polygonPointsRef.current.length);
      drawDraftShape(polygonPointsRef.current, false);
    } else {
      // brush-add / brush-remove
      pushUndoSnapshot();
      brushStrokeRef.current = point;
      paintBrushSegment(point, point);
    }
  }

  function handlePointerMove(e: React.PointerEvent<HTMLCanvasElement>) {
    const point = pointFromEvent(e);
    if (tool === "rect" && rectAnchorRef.current) {
      const anchor = rectAnchorRef.current;
      clearDraft();
      const ctx = draftCtx();
      const x = Math.min(anchor.x, point.x);
      const y = Math.min(anchor.y, point.y);
      const w = Math.abs(point.x - anchor.x);
      const h = Math.abs(point.y - anchor.y);
      ctx.strokeStyle = "#6c8cff";
      ctx.lineWidth = 2;
      ctx.fillStyle = "rgba(108, 140, 255, 0.25)";
      ctx.fillRect(x, y, w, h);
      ctx.strokeRect(x, y, w, h);
    } else if (tool === "freehand" && freehandPointsRef.current.length > 0) {
      freehandPointsRef.current.push(point);
      drawDraftShape(freehandPointsRef.current, false);
    } else if ((tool === "brush-add" || tool === "brush-remove") && brushStrokeRef.current) {
      paintBrushSegment(brushStrokeRef.current, point);
      brushStrokeRef.current = point;
    }
  }

  function handlePointerUp(e: React.PointerEvent<HTMLCanvasElement>) {
    const point = pointFromEvent(e);
    if (tool === "rect" && rectAnchorRef.current) {
      const anchor = rectAnchorRef.current;
      rectAnchorRef.current = null;
      clearDraft();
      const w = Math.abs(point.x - anchor.x);
      const h = Math.abs(point.y - anchor.y);
      if (w >= MIN_DRAW_SIZE || h >= MIN_DRAW_SIZE) {
        const x = Math.min(anchor.x, point.x);
        const y = Math.min(anchor.y, point.y);
        pushUndoSnapshot();
        const ctx = maskCtx();
        ctx.fillStyle = MASK_PAINT_COLOR;
        ctx.fillRect(x, y, w, h);
      }
    } else if (tool === "freehand") {
      const points = freehandPointsRef.current;
      freehandPointsRef.current = [];
      clearDraft();
      if (points.length >= 3) {
        const xs = points.map((p) => p.x);
        const ys = points.map((p) => p.y);
        const diagonal = Math.hypot(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys));
        if (diagonal >= MIN_DRAW_SIZE) commitPath(points);
      }
    } else if (tool === "brush-add" || tool === "brush-remove") {
      brushStrokeRef.current = null;
    }
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
      e.preventDefault();
      handleUndo();
    } else if (e.key === "Escape" && tool === "polygon" && polygonPointsRef.current.length > 0) {
      polygonPointsRef.current = [];
      setPolygonPointCount(0);
      clearDraft();
    }
  }

  function handleConfirm() {
    const exportCanvas = document.createElement("canvas");
    exportCanvas.width = imageWidth;
    exportCanvas.height = imageHeight;
    const ctx = exportCanvas.getContext("2d")!;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(maskCanvasRef.current!, 0, 0, imageWidth, imageHeight);
    onConfirm(exportCanvas.toDataURL("image/png"));
  }

  const cursor = tool === "brush-add" || tool === "brush-remove" ? "cell" : "crosshair";

  return (
    <Modal onClose={onCancel}>
      <div className="inspector" style={{ maxWidth: displayWidth + 40 }}>
        <p style={{ margin: 0, fontWeight: 600 }}>{t("editor.cleanPage.maskEditorTitle")}</p>
        <p className="hint" style={{ margin: 0 }}>{t("editor.cleanPage.maskEditorHint")}</p>

        <div style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap", alignItems: "center" }}>
          <button type="button" className={tool === "rect" ? "primary" : ""} onClick={() => setTool("rect")}>
            {t("editor.cleanPage.toolRect")}
          </button>
          <button type="button" className={tool === "freehand" ? "primary" : ""} onClick={() => setTool("freehand")}>
            {t("editor.cleanPage.toolFreehand")}
          </button>
          <button type="button" className={tool === "polygon" ? "primary" : ""} onClick={() => setTool("polygon")}>
            {t("editor.cleanPage.toolPolygon")}
          </button>
          <button type="button" className={tool === "brush-add" ? "primary" : ""} onClick={() => setTool("brush-add")}>
            {t("editor.cleanPage.toolBrushAdd")}
          </button>
          <button type="button" className={tool === "brush-remove" ? "primary" : ""} onClick={() => setTool("brush-remove")}>
            {t("editor.cleanPage.toolBrushRemove")}
          </button>
          {(tool === "brush-add" || tool === "brush-remove") && (
            <label style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 12 }}>
              {t("editor.cleanPage.brushSize")}
              <input type="range" min={10} max={150} value={brushSize} onChange={(e) => setBrushSize(Number(e.target.value))} />
            </label>
          )}
          <span style={{ flex: "1 1 auto" }} />
          <button type="button" onClick={handleUndo} disabled={!canUndo}>
            {t("editor.cleanPage.undo")}
          </button>
          <button type="button" onClick={handleClear}>
            {t("editor.cleanPage.clearMask")}
          </button>
        </div>
        {tool === "polygon" && polygonPointCount > 0 && (
          <p className="hint" style={{ margin: "4px 0 0" }}>{t("editor.cleanPage.polygonHint", { count: polygonPointCount })}</p>
        )}

        <div style={{ position: "relative", width: displayWidth, height: displayHeight, marginTop: 8 }}>
          <img src={imageUrl} alt="" draggable={false} style={{ width: displayWidth, height: displayHeight, display: "block", userSelect: "none" }} />
          <canvas
            ref={maskCanvasRef}
            width={displayWidth}
            height={displayHeight}
            style={{ position: "absolute", top: 0, left: 0, width: displayWidth, height: displayHeight, opacity: 0.45, pointerEvents: "none" }}
          />
          <canvas
            ref={draftCanvasRef}
            width={displayWidth}
            height={displayHeight}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onKeyDown={handleKeyDown}
            tabIndex={0}
            style={{ position: "absolute", top: 0, left: 0, width: displayWidth, height: displayHeight, touchAction: "none", cursor, outline: "none" }}
          />
        </div>

        <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
          <button type="button" className="primary" onClick={handleConfirm}>
            {t("editor.cleanPage.maskEditorContinue")}
          </button>
          <button type="button" onClick={onCancel}>
            {t("common.cancel")}
          </button>
        </div>
      </div>
    </Modal>
  );
}
