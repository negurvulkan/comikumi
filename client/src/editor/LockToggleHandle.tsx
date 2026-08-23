import { Circle, Group, Path } from "react-konva";
import Konva from "konva";

// A small padlock glyph in a 10x10 local coordinate space, centered on (5,5) so it can be
// scaled/offset the same way as any other handle. Two variants (shackle open/closed).
const LOCK_BODY = "M2 4.5 H8 V9 H2 Z";
// Closed: a full loop, both legs meeting the body top (y=4.5) — reads as "locked".
const LOCK_SHACKLE_CLOSED = "M3 4.5 V3 A2 2 0 0 1 7 3 V4.5";
// Open: the arc stops short of coming back down on the right — the shackle's right leg
// visibly doesn't reach the body, reading as "popped open"/unlocked at a glance.
const LOCK_SHACKLE_OPEN = "M3 4.5 V3 A2 2 0 0 1 7 3";

interface Props {
  /** Local position (already display-scaled) of the icon's center, relative to whatever
   * Group the shape itself renders in — same coordinate space as the shape's other handles. */
  x: number;
  y: number;
  /** Constant-screen-size factor — pass the same `handleScale` (1/zoom) used for corner/vertex
   * handles elsewhere, so the icon doesn't balloon at high zoom. */
  scale: number;
  locked: boolean;
  onToggle: () => void;
}

/**
 * Small clickable padlock badge shown next to a selected element (Bubble/Panel/Image/
 * CurvedText) to toggle its `locked` field — open padlock = unlocked, closed = locked.
 * Rendered directly as Konva nodes (not an HTML overlay) so it lives in the same
 * pan/zoom/rotation-aware coordinate space as everything else on the canvas, with no
 * separate position-sync logic needed.
 */
export function LockToggleHandle({ x, y, scale, locked, onToggle }: Props) {
  const color = locked ? "#ff6b6b" : "#6c8cff";
  function handle(e: Konva.KonvaEventObject<MouseEvent | TouchEvent>) {
    e.cancelBubble = true;
    onToggle();
  }
  return (
    <Group x={x} y={y} onClick={handle} onTap={handle} onMouseEnter={(e) => (e.target.getStage()!.container().style.cursor = "pointer")} onMouseLeave={(e) => (e.target.getStage()!.container().style.cursor = "default")}>
      <Circle radius={9 * scale} fill="#12131a" stroke={color} strokeWidth={1.5 * scale} />
      <Path
        data={LOCK_BODY}
        scale={{ x: scale, y: scale }}
        offsetX={5}
        offsetY={5}
        fill={color}
      />
      <Path
        data={locked ? LOCK_SHACKLE_CLOSED : LOCK_SHACKLE_OPEN}
        scale={{ x: scale, y: scale }}
        offsetX={5}
        offsetY={5}
        stroke={color}
        strokeWidth={1.1}
        fill="none"
      />
    </Group>
  );
}
