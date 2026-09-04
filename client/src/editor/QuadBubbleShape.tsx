import { useEffect, useMemo, useRef, useState } from "react";
import { Circle, Group, Image as KonvaImage, Line } from "react-konva";
import Konva from "konva";
import type { Bubble, Point } from "../../../shared/src/layoutSchema";
import { resolveBubbleStyle } from "../../../shared/src/layoutSchema";
import type { LetteringPreset } from "../../../shared/src/presets";
import { renderPerspectiveText } from "../../../shared/src/rendering/perspective";
import { LockToggleHandle } from "./LockToggleHandle";

interface Props {
  bubble: Bubble;
  scale: number;
  /** Current interactive Stage zoom — see BubbleShape.tsx's Props doc comment. */
  zoom: number;
  activeLanguage: string;
  presets: LetteringPreset[];
  selected: boolean;
  onSelect: (additive: boolean) => void;
  onChange: (patch: Partial<Bubble>) => void;
  /** Native screen coordinates (clientX/clientY) of a right-click on this bubble — used to position a ContextMenu (PageCanvas.tsx), independent of canvas zoom/pan. */
  onContextMenu?: (clientX: number, clientY: number) => void;
  /** See BubbleShape.tsx's Props doc comment. */
  onCornerContextMenu?: (clientX: number, clientY: number, cornerIndex: number) => void;
  /** See BubbleShape.tsx's Props doc comment. */
  readOnly?: boolean;
}

/**
 * Free-form perspective quad (e.g. a door sign seen at an angle): four
 * independently draggable corners, text warped with a true projective
 * transform to fit — not just rotated/skewed. See export/perspective.ts.
 */
export function QuadBubbleShape({
  bubble,
  scale,
  zoom,
  activeLanguage,
  presets,
  selected,
  onSelect,
  onChange,
  onContextMenu,
  onCornerContextMenu,
  readOnly,
}: Props) {
  const handleScale = 1 / zoom;
  const corners = bubble.corners ?? [];
  const displayCorners = useMemo(() => corners.map((p) => ({ x: p.x * scale, y: p.y * scale })), [corners, scale]);

  // Corner-handle drag updates this immediately so the outline tracks the
  // cursor smoothly; the (expensive, per-pixel) perspective text re-warp only
  // recomputes once the drag settles (on the committed `displayCorners` prop).
  const [liveCorners, setLiveCorners] = useState(displayCorners);
  const lineRef = useRef<Konva.Line>(null);
  useEffect(() => setLiveCorners(displayCorners), [displayCorners]);

  const text = bubble.text[activeLanguage] ?? "";
  const style = useMemo(() => resolveBubbleStyle(bubble, activeLanguage, presets), [bubble, activeLanguage, presets]);
  const baseFontSize = style.fontSize * scale;

  const warped = useMemo(() => {
    if (!text || displayCorners.length !== 4) return null;
    return renderPerspectiveText(displayCorners, {
      text,
      fontFamily: style.fontFamily,
      fontSize: baseFontSize,
      lineHeight: style.lineHeight,
      align: style.align,
      color: style.color,
      outline: style.textOutline,
      gradient: style.textGradient,
      screentone: style.textScreentone,
      glow: style.textGlow,
      dropShadow: style.textDropShadow,
      direction: style.direction,
    });
  }, [text, displayCorners, style, baseFontSize]);

  if (displayCorners.length !== 4) return null;
  const stroke = selected ? "#6c8cff" : undefined;
  const fill = selected ? "rgba(255,255,255,0.55)" : undefined;
  // See BubbleShape.tsx's Props doc comment — role-based readOnly vs. the bubble's own
  // `locked` field both disable geometry, but only readOnly hides the lock toggle itself.
  const geometryDisabled = readOnly || bubble.locked;
  const boundsMaxX = Math.max(...displayCorners.map((p) => p.x));
  const boundsMinY = Math.min(...displayCorners.map((p) => p.y));

  function handleLineDragEnd(e: Konva.KonvaEventObject<DragEvent>) {
    const node = e.target;
    const dx = node.x() / scale;
    const dy = node.y() / scale;
    node.position({ x: 0, y: 0 });
    onChange({ corners: corners.map((c) => ({ x: c.x + dx, y: c.y + dy })) });
  }

  function handleCornerDragMove(index: number, e: Konva.KonvaEventObject<DragEvent>) {
    const next = liveCorners.map((c, i) => (i === index ? { x: e.target.x(), y: e.target.y() } : c));
    setLiveCorners(next);
    lineRef.current?.points(next.flatMap((p) => [p.x, p.y]));
    lineRef.current?.getLayer()?.batchDraw();
  }

  function handleCornerDragEnd(index: number, e: Konva.KonvaEventObject<DragEvent>) {
    const next: Point[] = corners.map((c, i) =>
      i === index ? { x: e.target.x() / scale, y: e.target.y() / scale } : c
    );
    onChange({ corners: next });
  }

  return (
    <Group name="bubble">
      <Line
        ref={lineRef}
        points={liveCorners.flatMap((p) => [p.x, p.y])}
        closed
        stroke={stroke}
        strokeWidth={2}
        fill={fill}
        draggable={!geometryDisabled}
        onClick={(e) => onSelect(e.evt.shiftKey)}
        onTap={() => onSelect(false)}
        onContextMenu={(e) => {
          e.evt.preventDefault();
          onSelect(false);
          onContextMenu?.(e.evt.clientX, e.evt.clientY);
        }}
        onDragEnd={handleLineDragEnd}
      />
      {warped && <KonvaImage image={warped.canvas} x={warped.x} y={warped.y} listening={false} />}
      {selected &&
        !geometryDisabled &&
        displayCorners.map((p, i) => (
          <Circle
            key={i}
            x={p.x}
            y={p.y}
            radius={6 * handleScale}
            fill="#6c8cff"
            stroke="#12131a"
            strokeWidth={handleScale}
            draggable
            onDragMove={(e) => handleCornerDragMove(i, e)}
            onDragEnd={(e) => handleCornerDragEnd(i, e)}
            onContextMenu={(e) => {
              e.evt.preventDefault();
              onCornerContextMenu?.(e.evt.clientX, e.evt.clientY, i);
            }}
          />
        ))}
      {selected && !readOnly && (
        <LockToggleHandle
          x={boundsMaxX + 14 * handleScale}
          y={boundsMinY - 14 * handleScale}
          scale={handleScale}
          locked={!!bubble.locked}
          onToggle={() => onChange({ locked: bubble.locked ? undefined : true })}
        />
      )}
    </Group>
  );
}
