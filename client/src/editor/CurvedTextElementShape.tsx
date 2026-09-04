import { useEffect, useMemo, useRef, useState } from "react";
import { Circle, Group, Line, Shape } from "react-konva";
import Konva from "konva";
import type { CurvedTextElement, Point } from "../../../shared/src/layoutSchema";
import { resolveCurvedTextStyle } from "../../../shared/src/layoutSchema";
import type { LetteringPreset } from "../../../shared/src/presets";
import { drawCurvedText, fitCurvedText, sampleCurvePolyline } from "../../../shared/src/rendering/curvedText";
import { LockToggleHandle } from "./LockToggleHandle";

interface Props {
  element: CurvedTextElement;
  activeLanguage: string;
  scale: number;
  /** Current interactive Stage zoom — see BubbleShape.tsx's Props doc comment. */
  zoom: number;
  presets: LetteringPreset[];
  selected: boolean;
  onSelect: (additive: boolean) => void;
  onChange: (patch: Partial<CurvedTextElement>) => void;
  /** See BubbleShape.tsx's Props doc comment — unlike ImageElement, a CurvedTextElement
   * DOES have a translatable .text field (the server's translator diff guard allows
   * changing it), so selection stays enabled either way; only the path/corner drag
   * handles that reshape .points are disabled. */
  readOnly?: boolean;
}

// Reused purely for canvas text-metric measurement (never drawn) — same private pattern as BubbleShape.tsx.
let measureCtx: CanvasRenderingContext2D | null = null;
function getMeasureCtx(): CanvasRenderingContext2D {
  if (!measureCtx) {
    measureCtx = document.createElement("canvas").getContext("2d")!;
  }
  return measureCtx;
}

/**
 * Freestanding title/effect text following a cubic Bézier curve (see
 * export/curvedText.ts) — architecturally mirrors ImageElementShape.tsx: a
 * draggable path line for whole-element translation + 4 corner handles for
 * reshaping, all working directly in absolute image-space points (no
 * enclosing box/rotation the way Bubble has).
 */
export function CurvedTextElementShape({ element, activeLanguage, scale, zoom, presets, selected, onSelect, onChange, readOnly }: Props) {
  const handleScale = 1 / zoom;
  const points = element.points;
  const displayPoints = useMemo(() => points.map((p) => ({ x: p.x * scale, y: p.y * scale })), [points, scale]);

  // Same live-preview-while-dragging pattern as ImageElementShape/QuadBubbleShape:
  // the path line tracks the cursor immediately, the (cheap but non-trivial)
  // arc-length refit only recomputes once the drag settles on committed points.
  const [livePoints, setLivePoints] = useState(displayPoints);
  const lineRef = useRef<Konva.Line>(null);
  useEffect(() => setLivePoints(displayPoints), [displayPoints]);

  const text = element.text[activeLanguage] ?? "";
  const style = useMemo(() => resolveCurvedTextStyle(element, activeLanguage, presets), [element, activeLanguage, presets]);
  const baseFontSize = style.fontSize * scale;

  const fitted = useMemo(() => {
    if (!text.trim() || displayPoints.length !== 4) return null;
    return fitCurvedText(getMeasureCtx(), text, style.fontFamily, displayPoints, baseFontSize);
  }, [text, displayPoints, style.fontFamily, baseFontSize]);

  const previewPolyline = useMemo(() => sampleCurvePolyline(livePoints), [livePoints]);

  if (displayPoints.length !== 4) return null;
  // See BubbleShape.tsx's Props doc comment — role-based readOnly vs. the element's own
  // `locked` field both disable geometry, but only readOnly hides the lock toggle itself.
  const geometryDisabled = readOnly || element.locked;
  const boundsMaxX = Math.max(...displayPoints.map((p) => p.x));
  const boundsMinY = Math.min(...displayPoints.map((p) => p.y));

  function handleLineDragEnd(e: Konva.KonvaEventObject<DragEvent>) {
    const node = e.target;
    const dx = node.x() / scale;
    const dy = node.y() / scale;
    node.position({ x: 0, y: 0 });
    onChange({ points: points.map((p) => ({ x: p.x + dx, y: p.y + dy })) });
  }

  function handleCornerDragMove(index: number, e: Konva.KonvaEventObject<DragEvent>) {
    const next = livePoints.map((p, i) => (i === index ? { x: e.target.x(), y: e.target.y() } : p));
    setLivePoints(next);
    lineRef.current?.points(sampleCurvePolyline(next).flatMap((p) => [p.x, p.y]));
    lineRef.current?.getLayer()?.batchDraw();
  }

  function handleCornerDragEnd(index: number, e: Konva.KonvaEventObject<DragEvent>) {
    const next: Point[] = points.map((p, i) => (i === index ? { x: e.target.x() / scale, y: e.target.y() / scale } : p));
    onChange({ points: next });
  }

  return (
    <Group name="bubble">
      {fitted && (
        <Shape
          listening={false}
          sceneFunc={(ctx) => {
            drawCurvedText(
              ctx._context,
              text,
              displayPoints,
              fitted,
              style.fontFamily,
              style.align,
              { color: style.color, outline: style.textOutline, gradient: style.textGradient, glow: style.textGlow, dropShadow: style.textDropShadow },
              scale
            );
          }}
        />
      )}
      {/* Path guide — always at least faintly visible (unlike bubbles/images,
          there's no other body to grab once the curve is short/text is small),
          brighter when selected. */}
      <Line
        ref={lineRef}
        points={previewPolyline.flatMap((p) => [p.x, p.y])}
        stroke={selected ? "#6c8cff" : "rgba(255,255,255,0.25)"}
        strokeWidth={2}
        dash={[4, 4]}
        hitStrokeWidth={16}
        draggable={!geometryDisabled}
        onClick={(e) => onSelect(e.evt.shiftKey)}
        onTap={() => onSelect(false)}
        // Without cancelBubble, the mousedown/dragstart bubbles all the way
        // up past this non-draggable Group to the (draggable, for panning)
        // Stage, which then steals the drag — same class of bug as the
        // bubble tail handle earlier, just one more ancestor level up.
        onMouseDown={(e) => {
          e.cancelBubble = true;
        }}
        onDragStart={(e) => {
          e.cancelBubble = true;
        }}
        onDragMove={(e) => {
          e.cancelBubble = true;
        }}
        onDragEnd={(e) => {
          e.cancelBubble = true;
          handleLineDragEnd(e);
        }}
      />
      {selected &&
        !geometryDisabled &&
        displayPoints.map((p, i) => (
          <Circle
            key={i}
            x={p.x}
            y={p.y}
            radius={6 * handleScale}
            fill="#6c8cff"
            stroke="#12131a"
            strokeWidth={handleScale}
            draggable
            onMouseDown={(e) => {
              e.cancelBubble = true;
            }}
            onDragStart={(e) => {
              e.cancelBubble = true;
            }}
            onDragMove={(e) => {
              e.cancelBubble = true;
              handleCornerDragMove(i, e);
            }}
            onDragEnd={(e) => {
              e.cancelBubble = true;
              handleCornerDragEnd(i, e);
            }}
          />
        ))}
      {selected && !readOnly && (
        <LockToggleHandle
          x={boundsMaxX + 14 * handleScale}
          y={boundsMinY - 14 * handleScale}
          scale={handleScale}
          locked={!!element.locked}
          onToggle={() => onChange({ locked: element.locked ? undefined : true })}
        />
      )}
    </Group>
  );
}
