import { useEffect, useState } from "react";
import { Circle, Group, Line, Text } from "react-konva";
import Konva from "konva";
import type { Panel, Point } from "../../../shared/src/layoutSchema";
import { panelDisplayLabel, polygonBounds } from "../../../shared/src/layoutSchema";
import { closestPointOnSegment } from "./geometry";

interface Props {
  panel: Panel;
  index: number;
  scale: number;
  /** Current interactive Stage zoom — see BubbleShape.tsx's Props doc comment (vertex handle radii are divided by this so they stay a constant screen size). */
  zoom: number;
  selected: boolean;
  onSelect: (additive: boolean) => void;
  onChange: (patch: Partial<Panel>) => void;
  /** Native screen coordinates (clientX/clientY) of a right-click on the panel body (not a vertex) — used to position a ContextMenu (PageCanvas.tsx), independent of canvas zoom/pan. */
  onContextMenu?: (clientX: number, clientY: number) => void;
  /** Native screen coordinates of a right-click on one vertex handle, plus its index — PageCanvas.tsx
   * renders the "Punkt entfernen" ContextMenu (a plain HTML element, can't live inside the Konva tree). */
  onVertexContextMenu?: (clientX: number, clientY: number, vertexIndex: number) => void;
}

/** A drawn reference region marking one comic panel — editor-only annotation (dashed
 * outline + label), never rendered into the PNG export. A freeform polygon (not a
 * rectangle): the whole shape drags as one unit, each vertex is independently
 * draggable to reshape it, a double-click on an edge inserts a new vertex there, and a
 * right-click on a vertex offers to remove it (down to a minimum of 3 points). Mirrors
 * QuadBubbleShape.tsx's transform-free Line+Circle-corners pattern, generalized from a
 * fixed 4 corners to any N ≥ 3. */
export function PanelShape({ panel, index, scale, zoom, selected, onSelect, onChange, onContextMenu, onVertexContextMenu }: Props) {
  const handleScale = 1 / zoom;
  const displayPoints = panel.points.map((p) => ({ x: p.x * scale, y: p.y * scale }));
  const [livePoints, setLivePoints] = useState(displayPoints);
  useEffect(() => setLivePoints(displayPoints), [panel.points, scale]);

  const bounds = polygonBounds(panel.points);

  function handleLineDragEnd(e: Konva.KonvaEventObject<DragEvent>) {
    const node = e.target;
    const dx = node.x() / scale;
    const dy = node.y() / scale;
    node.position({ x: 0, y: 0 });
    onChange({ points: panel.points.map((p) => ({ x: p.x + dx, y: p.y + dy })) });
  }

  function handleVertexDragMove(i: number, e: Konva.KonvaEventObject<DragEvent>) {
    const next = livePoints.map((p, idx) => (idx === i ? { x: e.target.x(), y: e.target.y() } : p));
    setLivePoints(next);
  }

  function handleVertexDragEnd(i: number, e: Konva.KonvaEventObject<DragEvent>) {
    const next: Point[] = panel.points.map((p, idx) =>
      idx === i ? { x: e.target.x() / scale, y: e.target.y() / scale } : p
    );
    onChange({ points: next });
  }

  function handleLineDblClick(e: Konva.KonvaEventObject<MouseEvent>) {
    e.evt.preventDefault();
    const pos = e.target.getRelativePointerPosition();
    if (!pos) return;
    let bestEdge = 0;
    let bestDistSq = Infinity;
    for (let i = 0; i < displayPoints.length; i++) {
      const a = displayPoints[i];
      const b = displayPoints[(i + 1) % displayPoints.length];
      const { distSq } = closestPointOnSegment(pos, a, b);
      if (distSq < bestDistSq) {
        bestDistSq = distSq;
        bestEdge = i;
      }
    }
    const newPoint: Point = { x: pos.x / scale, y: pos.y / scale };
    const next = [...panel.points];
    next.splice(bestEdge + 1, 0, newPoint);
    onChange({ points: next });
  }

  return (
    <Group name="bubble">
      <Line
        points={livePoints.flatMap((p) => [p.x, p.y])}
        closed
        stroke={selected ? "#6c8cff" : panel.color}
        strokeWidth={selected ? 2.5 : 1.5}
        hitStrokeWidth={12}
        dash={[8, 6]}
        fill={selected ? "rgba(108,140,255,0.08)" : undefined}
        draggable
        onClick={(e) => onSelect(e.evt.shiftKey)}
        onTap={() => onSelect(false)}
        onDblClick={handleLineDblClick}
        onContextMenu={(e) => {
          e.evt.preventDefault();
          onSelect(false);
          onContextMenu?.(e.evt.clientX, e.evt.clientY);
        }}
        onDragEnd={handleLineDragEnd}
      />
      <Text
        text={panelDisplayLabel(panel, index)}
        x={bounds.minX * scale + 4}
        y={bounds.minY * scale + 4}
        fontSize={12}
        fill={panel.color}
        listening={false}
      />
      {selected &&
        livePoints.map((p, i) => (
          <Circle
            key={i}
            x={p.x}
            y={p.y}
            radius={6 * handleScale}
            fill="#6c8cff"
            stroke="#12131a"
            strokeWidth={handleScale}
            draggable
            onDragMove={(e) => handleVertexDragMove(i, e)}
            onDragEnd={(e) => handleVertexDragEnd(i, e)}
            onContextMenu={(e) => {
              e.evt.preventDefault();
              e.cancelBubble = true;
              onVertexContextMenu?.(e.evt.clientX, e.evt.clientY, i);
            }}
          />
        ))}
    </Group>
  );
}
