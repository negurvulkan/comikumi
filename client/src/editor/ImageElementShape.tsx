import { useEffect, useMemo, useRef, useState } from "react";
import { Circle, Group, Image as KonvaImage, Line } from "react-konva";
import Konva from "konva";
import type { ImageElement, Point } from "../../../shared/src/layoutSchema";
import { imageFileForLanguage } from "../../../shared/src/layoutSchema";
import { warpImageIntoQuad } from "../export/perspective";
import { api } from "../api/client";
import { useHtmlImage } from "./useHtmlImage";

interface Props {
  element: ImageElement;
  activeLanguage: string;
  scale: number;
  /** Current interactive Stage zoom — see BubbleShape.tsx's Props doc comment. */
  zoom: number;
  selected: boolean;
  onSelect: (additive: boolean) => void;
  onChange: (patch: Partial<ImageElement>) => void;
}

/**
 * A placed raster image (poster/sign patch) — free scale/rotate/perspective
 * via the same four-corner quad + homography warp as a perspective text
 * bubble (see export/perspective.ts), just warping the uploaded bitmap
 * instead of rendered text. The actual file can differ per language (a
 * translated poster), falling back to whichever file is set for any
 * language so the element is never just blank.
 */
export function ImageElementShape({ element, activeLanguage, scale, zoom, selected, onSelect, onChange }: Props) {
  const handleScale = 1 / zoom;
  const fileName = imageFileForLanguage(element, activeLanguage);
  const imageUrl = fileName ? api.imagesFileUrl(fileName) : undefined;
  const sourceImage = useHtmlImage(imageUrl);
  const corners = element.corners;
  const displayCorners = useMemo(() => corners.map((p) => ({ x: p.x * scale, y: p.y * scale })), [corners, scale]);

  // Same pattern as QuadBubbleShape: the outline tracks the cursor live while
  // dragging a corner, but the (expensive, per-pixel) warp only recomputes
  // once the drag settles on the committed corners.
  const [liveCorners, setLiveCorners] = useState(displayCorners);
  const lineRef = useRef<Konva.Line>(null);
  useEffect(() => setLiveCorners(displayCorners), [displayCorners]);

  const warped = useMemo(() => {
    if (!sourceImage || displayCorners.length !== 4) return null;
    return warpImageIntoQuad(displayCorners, sourceImage, element.opacity);
  }, [sourceImage, displayCorners, element.opacity]);

  if (displayCorners.length !== 4) return null;
  const stroke = selected ? "#6c8cff" : undefined;

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
      {warped && <KonvaImage image={warped.canvas} x={warped.x} y={warped.y} listening={false} />}
      <Line
        ref={lineRef}
        points={liveCorners.flatMap((p) => [p.x, p.y])}
        closed
        stroke={stroke}
        strokeWidth={2}
        fill={selected ? "rgba(255,255,255,0.08)" : undefined}
        draggable
        onClick={(e) => onSelect(e.evt.shiftKey)}
        onTap={() => onSelect(false)}
        onDragEnd={handleLineDragEnd}
      />
      {selected &&
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
          />
        ))}
    </Group>
  );
}
