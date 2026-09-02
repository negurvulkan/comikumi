import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { v4 as uuid } from "uuid";
import { Modal } from "./Modal";
import type { CleanBox } from "../ocr/useCleanPageRun";

interface EditableBox extends CleanBox {
  id: string;
}

interface Props {
  imageUrl: string;
  imageWidth: number;
  imageHeight: number;
  initialBoxes: CleanBox[];
  onConfirm: (boxes: CleanBox[]) => void;
  onCancel: () => void;
}

/** Minimum size (in DISPLAY pixels, not image pixels) for a click-drag to count as
 * "drew a new box" rather than an accidental click — avoids littering the mask with
 * zero-size boxes from a slightly-jittery click. */
const MIN_DRAW_SIZE = 6;

type DragState =
  | { mode: "create"; id: string; anchorX: number; anchorY: number }
  | { mode: "move"; id: string; pointerStartX: number; pointerStartY: number; boxStartX: number; boxStartY: number }
  | { mode: "resize"; id: string; pointerStartX: number; pointerStartY: number; widthStart: number; heightStart: number };

/** Manual mask-correction step before Cleaning/Inpainting actually runs — shown
 * between detection (useCleanPageRun.ts's start()) and the server reconstruction
 * (confirmMask()). Auto-Bubbles' detector only marks the TEXT it found, not
 * necessarily the whole bubble (outline, tail) — this lets the user extend, add, move,
 * resize, or delete regions before anything server-side runs, directly addressing
 * "the detected box didn't cover the whole bubble, so a fragment survived cleaning"
 * rather than trying to fix that by re-tuning detection. Plain absolutely-positioned
 * overlay divs on top of a scaled-down `<img>`, not a canvas/Konva — simpler to get
 * right for this one-off, rectangle-only editing need than pulling in the main
 * editor's canvas stack. */
export function CleanPageMaskEditor({ imageUrl, imageWidth, imageHeight, initialBoxes, onConfirm, onCancel }: Props) {
  const { t } = useTranslation();
  const [boxes, setBoxes] = useState<EditableBox[]>(() => initialBoxes.map((b) => ({ id: uuid(), ...b })));
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const dragRef = useRef<DragState | null>(null);
  const stageRef = useRef<HTMLDivElement>(null);

  // Fits the page image into a fixed display width regardless of its real resolution
  // (manga scans are typically much larger than any reasonable modal) — all pointer
  // math below converts between this display scale and real image pixels.
  const DISPLAY_WIDTH = 640;
  const scale = Math.min(1, DISPLAY_WIDTH / imageWidth);
  const displayWidth = imageWidth * scale;
  const displayHeight = imageHeight * scale;

  function clampBox(box: CleanBox): CleanBox {
    const width = Math.max(4, Math.min(box.width, imageWidth));
    const height = Math.max(4, Math.min(box.height, imageHeight));
    const x = Math.max(0, Math.min(box.x, imageWidth - width));
    const y = Math.max(0, Math.min(box.y, imageHeight - height));
    return { x, y, width, height };
  }

  function updateBox(id: string, patch: Partial<CleanBox>) {
    setBoxes((prev) => prev.map((b) => (b.id === id ? { ...b, ...clampBox({ ...b, ...patch }) } : b)));
  }

  function deleteBox(id: string) {
    setBoxes((prev) => prev.filter((b) => b.id !== id));
    setSelectedId((prev) => (prev === id ? null : prev));
  }

  function stagePointFromEvent(e: React.PointerEvent): { x: number; y: number } {
    const rect = stageRef.current!.getBoundingClientRect();
    return { x: (e.clientX - rect.left) / scale, y: (e.clientY - rect.top) / scale };
  }

  /** Starts drawing a brand-new box — only fires from the background stage itself,
   * never when the pointerdown originated on an existing box (those call
   * stopPropagation, see below). */
  function handleStagePointerDown(e: React.PointerEvent<HTMLDivElement>) {
    if (e.button !== 0) return;
    const point = stagePointFromEvent(e);
    const id = uuid();
    setSelectedId(id);
    setBoxes((prev) => [...prev, { id, x: point.x, y: point.y, width: 0, height: 0 }]);
    dragRef.current = { mode: "create", id, anchorX: point.x, anchorY: point.y };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }

  function handleBoxPointerDown(e: React.PointerEvent<HTMLDivElement>, box: EditableBox) {
    e.stopPropagation();
    if (e.button !== 0) return;
    setSelectedId(box.id);
    dragRef.current = { mode: "move", id: box.id, pointerStartX: e.clientX, pointerStartY: e.clientY, boxStartX: box.x, boxStartY: box.y };
    e.currentTarget.setPointerCapture(e.pointerId);
  }

  function handleResizeHandlePointerDown(e: React.PointerEvent<HTMLDivElement>, box: EditableBox) {
    e.stopPropagation();
    if (e.button !== 0) return;
    setSelectedId(box.id);
    dragRef.current = { mode: "resize", id: box.id, pointerStartX: e.clientX, pointerStartY: e.clientY, widthStart: box.width, heightStart: box.height };
    e.currentTarget.setPointerCapture(e.pointerId);
  }

  function handlePointerMove(e: React.PointerEvent) {
    const drag = dragRef.current;
    if (!drag) return;
    if (drag.mode === "create") {
      const point = stagePointFromEvent(e);
      const x = Math.min(drag.anchorX, point.x);
      const y = Math.min(drag.anchorY, point.y);
      const width = Math.abs(point.x - drag.anchorX);
      const height = Math.abs(point.y - drag.anchorY);
      setBoxes((prev) => prev.map((b) => (b.id === drag.id ? { ...b, x, y, width, height } : b)));
    } else if (drag.mode === "move") {
      const dx = (e.clientX - drag.pointerStartX) / scale;
      const dy = (e.clientY - drag.pointerStartY) / scale;
      updateBox(drag.id, { x: drag.boxStartX + dx, y: drag.boxStartY + dy });
    } else if (drag.mode === "resize") {
      const dx = (e.clientX - drag.pointerStartX) / scale;
      const dy = (e.clientY - drag.pointerStartY) / scale;
      updateBox(drag.id, { width: drag.widthStart + dx, height: drag.heightStart + dy });
    }
  }

  function handlePointerUp() {
    const drag = dragRef.current;
    if (drag?.mode === "create") {
      const box = boxes.find((b) => b.id === drag.id);
      if (box && box.width * scale < MIN_DRAW_SIZE && box.height * scale < MIN_DRAW_SIZE) {
        // Too small to have been an intentional drag — treat as a stray click and
        // discard rather than leaving a near-invisible sliver box behind.
        deleteBox(drag.id);
      }
    }
    dragRef.current = null;
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if ((e.key === "Delete" || e.key === "Backspace") && selectedId) {
      e.preventDefault();
      deleteBox(selectedId);
    }
  }

  return (
    <Modal onClose={onCancel}>
      <div className="inspector" style={{ maxWidth: displayWidth + 40 }}>
        <p style={{ margin: 0, fontWeight: 600 }}>{t("editor.cleanPage.maskEditorTitle")}</p>
        <p className="hint" style={{ margin: 0 }}>{t("editor.cleanPage.maskEditorHint")}</p>
        <div
          ref={stageRef}
          onPointerDown={handleStagePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onKeyDown={handleKeyDown}
          tabIndex={0}
          style={{ position: "relative", width: displayWidth, height: displayHeight, marginTop: 8, touchAction: "none", outline: "none" }}
        >
          <img src={imageUrl} alt="" draggable={false} style={{ width: displayWidth, height: displayHeight, display: "block", userSelect: "none" }} />
          {boxes.map((box) => (
            <div
              key={box.id}
              onPointerDown={(e) => handleBoxPointerDown(e, box)}
              style={{
                position: "absolute",
                left: box.x * scale,
                top: box.y * scale,
                width: box.width * scale,
                height: box.height * scale,
                border: `2px solid ${selectedId === box.id ? "#6c8cff" : "#ff6c6c"}`,
                background: "rgba(255, 108, 108, 0.2)",
                cursor: "move",
              }}
            >
              <button
                type="button"
                onPointerDown={(e) => e.stopPropagation()}
                onClick={() => deleteBox(box.id)}
                title={t("editor.cleanPage.deleteBox")}
                style={{ position: "absolute", top: -12, right: -12, width: 20, height: 20, padding: 0, lineHeight: "18px", borderRadius: "50%" }}
              >
                ×
              </button>
              <div
                onPointerDown={(e) => handleResizeHandlePointerDown(e, box)}
                style={{ position: "absolute", right: -5, bottom: -5, width: 10, height: 10, background: "#6c8cff", cursor: "nwse-resize" }}
              />
            </div>
          ))}
        </div>
        <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
          <button type="button" className="primary" onClick={() => onConfirm(boxes.map(({ id: _id, ...b }) => b))}>
            {t("editor.cleanPage.maskEditorContinue", { count: boxes.length })}
          </button>
          <button type="button" onClick={onCancel}>
            {t("common.cancel")}
          </button>
        </div>
      </div>
    </Modal>
  );
}
