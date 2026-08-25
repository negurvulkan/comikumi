import { Circle, Line } from "react-konva";
import Konva from "konva";
import type { Comment } from "../../../shared/src/comments";

interface Props {
  comment: Comment;
  scale: number;
  selected: boolean;
  /** Native screen coordinates of the click, so PageCanvas.tsx can position the
   * CommentThread popover the same way it positions ContextMenu — independent of
   * canvas zoom/pan. */
  onSelect: (clientX: number, clientY: number) => void;
}

const OPEN_COLOR = "#ff5a5a";
const RESOLVED_COLOR = "#4caf7d";

/** Renders one comment's canvas marker — a pin, a dashed box, or a freehand stroke,
 * matching whichever CommentTarget kind it was created with (see shared/src/comments.ts).
 * A "page"-kind comment (no geometry) renders nothing here — it only shows up in
 * CommentsPanel's list, same as a comment with no spot to point at. Unlike Panel/Bubble
 * shapes, a marker is NOT draggable/reshapeable — a comment's target is fixed at
 * creation; clicking it only opens/selects its thread (see CommentThread.tsx). */
export function CommentMarkerShape({ comment, scale, selected, onSelect }: Props) {
  const color = comment.resolved ? RESOLVED_COLOR : OPEN_COLOR;
  const opacity = comment.resolved ? 0.55 : 1;

  function handleClick(e: Konva.KonvaEventObject<MouseEvent | TouchEvent>) {
    e.cancelBubble = true;
    const evt = e.evt as MouseEvent;
    onSelect(evt.clientX ?? 0, evt.clientY ?? 0);
  }

  if (comment.target.kind === "pin") {
    const { x, y } = comment.target.point;
    return (
      <Circle
        x={x * scale}
        y={y * scale}
        radius={selected ? 9 : 7}
        fill={color}
        stroke="#12131a"
        strokeWidth={1.5}
        opacity={opacity}
        onClick={handleClick}
        onTap={handleClick}
      />
    );
  }

  if (comment.target.kind === "box") {
    return (
      <Line
        points={comment.target.points.flatMap((p) => [p.x * scale, p.y * scale])}
        closed
        stroke={color}
        strokeWidth={selected ? 3 : 2}
        dash={[6, 4]}
        hitStrokeWidth={12}
        opacity={opacity}
        onClick={handleClick}
        onTap={handleClick}
      />
    );
  }

  if (comment.target.kind === "freehand") {
    const stroke = comment.target.strokes[0] ?? [];
    return (
      <Line
        points={stroke.flatMap((p) => [p.x * scale, p.y * scale])}
        stroke={comment.target.color}
        strokeWidth={(selected ? comment.target.strokeWidthPx + 1 : comment.target.strokeWidthPx) * scale}
        lineCap="round"
        lineJoin="round"
        tension={0.4}
        hitStrokeWidth={14}
        opacity={opacity}
        onClick={handleClick}
        onTap={handleClick}
      />
    );
  }

  // "page" kind — no spot on the page to mark, only visible in CommentsPanel's list.
  return null;
}
