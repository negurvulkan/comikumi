interface Props {
  dragging: boolean;
  onPointerDown: (e: React.PointerEvent) => void;
  onPointerMove: (e: React.PointerEvent) => void;
  onPointerUp: (e: React.PointerEvent) => void;
}

/** Narrow, typical drag-to-resize grip along a sidebar's left edge — see
 * useResizableSidebarWidth.ts for the actual width logic this only visualizes/drives.
 * Render as the first child of a `.text-sidebar` (which is `position: relative`). */
export function SidebarResizeHandle({ dragging, onPointerDown, onPointerMove, onPointerUp }: Props) {
  return (
    <div
      className={`sidebar-resize-handle${dragging ? " active" : ""}`}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      <div className="sidebar-resize-handle-grip" />
    </div>
  );
}
