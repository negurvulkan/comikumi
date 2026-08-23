import { useEffect, useState } from "react";
import { Circle, Group, Line, Text } from "react-konva";
import Konva from "konva";
import type { Panel, PanelCut, Point } from "../../../shared/src/layoutSchema";
import { panelDisplayLabel, polygonBounds, resolvePanelForLanguage } from "../../../shared/src/layoutSchema";
import { closestPointOnSegment } from "./geometry";
import { LockToggleHandle } from "./LockToggleHandle";

interface Props {
  panel: Panel;
  index: number;
  scale: number;
  /** Current interactive Stage zoom — see BubbleShape.tsx's Props doc comment (vertex handle radii are divided by this so they stay a constant screen size). */
  zoom: number;
  /** Which language's geometry/cut state to show and edit — see Panel.languageOverride's
   * doc comment. Writes go into the base fields unless an override already exists for
   * this language (see commitPanel below), same "opt in per language" pattern as
   * BubbleShape.tsx's formOverride handling. */
  activeLanguage: string;
  selected: boolean;
  onSelect: (additive: boolean) => void;
  onChange: (patch: Partial<Panel>) => void;
  /** Native screen coordinates (clientX/clientY) of a right-click on the panel body (not a vertex) — used to position a ContextMenu (PageCanvas.tsx), independent of canvas zoom/pan. */
  onContextMenu?: (clientX: number, clientY: number) => void;
  /** Native screen coordinates of a right-click on one vertex handle, plus its index — PageCanvas.tsx
   * renders the "Punkt entfernen" ContextMenu (a plain HTML element, can't live inside the Konva tree). */
  onVertexContextMenu?: (clientX: number, clientY: number, vertexIndex: number) => void;
  /** See BubbleShape.tsx's Props doc comment — a Panel has no translatable text field
   * at all, so this is fully locked for the "translator" role. */
  readOnly?: boolean;
}

/** A drawn reference region marking one comic panel — editor-only annotation (dashed
 * outline + label), never rendered into the PNG export. A freeform polygon (not a
 * rectangle): the whole shape drags as one unit, each vertex is independently
 * draggable to reshape it, a double-click on an edge inserts a new vertex there, and a
 * right-click on a vertex offers to remove it (down to a minimum of 3 points). Mirrors
 * QuadBubbleShape.tsx's transform-free Line+Circle-corners pattern, generalized from a
 * fixed 4 corners to any N ≥ 3. */
export function PanelShape({ panel, index, scale, zoom, activeLanguage, selected, onSelect, onChange, onContextMenu, onVertexContextMenu, readOnly }: Props) {
  const handleScale = 1 / zoom;
  // Resolved for the active language — the same panel can be a plain untouched marker in
  // one language and a moved/reshaped/cut one in another (see Panel.languageOverride).
  const resolved = resolvePanelForLanguage(panel, activeLanguage);
  const hasLanguageOverride = !!panel.languageOverride?.[activeLanguage];
  const displayPoints = resolved.points.map((p) => ({ x: p.x * scale, y: p.y * scale }));
  const [livePoints, setLivePoints] = useState(displayPoints);
  useEffect(() => setLivePoints(displayPoints), [resolved.points, scale]);

  const bounds = polygonBounds(resolved.points);
  // See BubbleShape.tsx's Props doc comment — role-based readOnly vs. the panel's own
  // `locked` field both disable geometry, but only readOnly hides the lock toggle itself.
  // `locked` is deliberately base-wide (not per-language), see its schema doc comment.
  const geometryDisabled = readOnly || panel.locked;

  // Writes into the active language's override if one already exists (merged with the
  // resolved current state so untouched fields survive), otherwise straight into the
  // base fields — same "opt in per language" pattern as BubbleShape.tsx's commitForm.
  function commitPanel(patch: Partial<{ points: Point[]; origin: Point; cut: PanelCut | undefined }>) {
    if (hasLanguageOverride) {
      onChange({ languageOverride: { ...panel.languageOverride, [activeLanguage]: { ...resolved, ...patch } } });
    } else {
      onChange(patch);
    }
  }

  function handleLineDragEnd(e: Konva.KonvaEventObject<DragEvent>) {
    const node = e.target;
    const dx = node.x() / scale;
    const dy = node.y() / scale;
    node.position({ x: 0, y: 0 });
    // A whole-panel drag is a rigid translate — origin must move by the same (dx, dy) as
    // points, or child bubbles (rendered in a Group anchored at the BASE origin) would
    // visually detach from the panel outline. A vertex-only reshape (handleVertexDragEnd
    // below) deliberately never touches origin — see PanelPointsSchema.origin's doc
    // comment. Note: child-bubble anchoring always uses the base origin regardless of a
    // language override (see Panel.languageOverride's doc comment) — only this panel's
    // own displayed content moves per-language.
    commitPanel({
      points: resolved.points.map((p) => ({ x: p.x + dx, y: p.y + dy })),
      origin: { x: resolved.origin.x + dx, y: resolved.origin.y + dy },
    });
  }

  function handleVertexDragMove(i: number, e: Konva.KonvaEventObject<DragEvent>) {
    const next = livePoints.map((p, idx) => (idx === i ? { x: e.target.x(), y: e.target.y() } : p));
    setLivePoints(next);
  }

  function handleVertexDragEnd(i: number, e: Konva.KonvaEventObject<DragEvent>) {
    const next: Point[] = resolved.points.map((p, idx) =>
      idx === i ? { x: e.target.x() / scale, y: e.target.y() / scale } : p
    );
    commitPanel({ points: next });
  }

  function handleLineDblClick(e: Konva.KonvaEventObject<MouseEvent>) {
    e.evt.preventDefault();
    if (geometryDisabled) return;
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
    const next = [...resolved.points];
    next.splice(bestEdge + 1, 0, newPoint);
    commitPanel({ points: next });
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
        draggable={!geometryDisabled}
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
        !geometryDisabled &&
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
      {selected && !readOnly && (
        <LockToggleHandle
          x={bounds.maxX * scale + 14 * handleScale}
          y={bounds.minY * scale - 14 * handleScale}
          scale={handleScale}
          locked={!!panel.locked}
          onToggle={() => onChange({ locked: panel.locked ? undefined : true })}
        />
      )}
    </Group>
  );
}
