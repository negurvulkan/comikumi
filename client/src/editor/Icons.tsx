/** Small hand-authored inline SVG icons for the tool strip / menu bar — kept as plain
 * components (no icon library dependency) so the bundle stays as lean as the rest of
 * the project. All use `currentColor` so they inherit the surrounding button's color. */

const common = {
  width: 20,
  height: 20,
  viewBox: "0 0 20 20",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.4,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

export function BubbleToolIcon() {
  return (
    <svg {...common}>
      <ellipse cx="10" cy="8" rx="7" ry="5" />
      <path d="M7 12.5 L5.5 16 L9.5 12.8" />
    </svg>
  );
}

export function RectToolIcon() {
  return (
    <svg {...common}>
      <rect x="3" y="3" width="14" height="10" rx="2" />
      <path d="M6.5 13 L5 16.5 L9.5 13.2" />
    </svg>
  );
}

export function QuadToolIcon() {
  return (
    <svg {...common}>
      <path d="M10 2.5 L17.5 7.5 L14 17 L4 14 Z" />
    </svg>
  );
}

/** A jagged sound-effect burst — the Effect (SFX/onomatopoeia) bubble tool, deliberately
 * distinct from the three plain-shape icons above (see LayersPanel.tsx's isEffect flag). */
export function EffectToolIcon() {
  return (
    <svg width={20} height={20} viewBox="0 0 20 20" fill="currentColor" stroke="none">
      <path d="M10 1.5 L12 7 L18 7.5 L13 11 L14.5 17.5 L10 13.8 L5.5 17.5 L7 11 L2 7.5 L8 7 Z" />
    </svg>
  );
}

export function ImageToolIcon() {
  return (
    <svg {...common}>
      <rect x="2.5" y="3.5" width="15" height="13" rx="2" />
      <circle cx="7" cy="8" r="1.6" />
      <path d="M3 15 L8 10.5 L11.5 13.5 L14 11 L17.5 15" />
    </svg>
  );
}

export function CurvedTextToolIcon() {
  return (
    <svg {...common}>
      <path d="M3 14 C 3 5, 17 5, 17 14" />
      <circle cx="4.5" cy="12.2" r="0.9" fill="currentColor" stroke="none" />
      <circle cx="8" cy="7.3" r="0.9" fill="currentColor" stroke="none" />
      <circle cx="12" cy="6.2" r="0.9" fill="currentColor" stroke="none" />
      <circle cx="15.5" cy="12.2" r="0.9" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function PanelToolIcon() {
  return (
    <svg {...common}>
      <rect x="2.5" y="2.5" width="15" height="15" rx="1.5" />
      <path d="M2.5 10.5 H17.5 M9.5 2.5 V10.5" />
    </svg>
  );
}

export function PanelGridToolIcon() {
  return (
    <svg {...common}>
      <rect x="2.5" y="2.5" width="15" height="15" rx="1.5" />
      <path d="M2.5 8 H17.5 M2.5 13 H17.5 M9.5 2.5 V17.5" />
    </svg>
  );
}

export function GlobeToolIcon() {
  return (
    <svg {...common}>
      <circle cx="10" cy="10" r="7.2" />
      <ellipse cx="10" cy="10" rx="3" ry="7.2" />
      <path d="M2.8 10 H17.2 M3.7 6 H16.3 M3.7 14 H16.3" />
    </svg>
  );
}

export function ContextToolIcon() {
  return (
    <svg width={20} height={20} viewBox="0 0 20 20" fill="currentColor" stroke="none">
      <rect x="3" y="3.5" width="14" height="3.5" rx="1" opacity="0.4" />
      <rect x="3" y="8.25" width="14" height="3.5" rx="1" />
      <rect x="3" y="13" width="14" height="3.5" rx="1" opacity="0.4" />
    </svg>
  );
}

export function ScriptToolIcon() {
  return (
    <svg {...common}>
      <path d="M5 2.5 H13 L15.5 5 V17.5 H5 Z" />
      <path d="M13 2.5 V5 H15.5" />
      <path d="M7 9 H13 M7 12 H13 M7 15 H10.5" />
    </svg>
  );
}

/** A single closed book, spine to the left — used for "number of volumes" stats. */
export function BookIcon() {
  return (
    <svg {...common}>
      <path d="M3.5 3.5 C 6 2.5, 8.5 2.5, 10 3.5 C 11.5 2.5, 14 2.5, 16.5 3.5 V 15.5 C 14 14.5, 11.5 14.5, 10 15.5 C 8.5 14.5, 6 14.5, 3.5 15.5 Z" />
      <path d="M10 3.5 V 15.5" />
    </svg>
  );
}

/** A single dog-eared page with text lines — used for "number of pages" stats. */
export function PageIcon() {
  return (
    <svg {...common}>
      <path d="M5 2.5 H12 L15.5 6 V17.5 H5 Z" />
      <path d="M12 2.5 V6 H15.5" />
      <path d="M7 9.5 H13 M7 12.5 H13 M7 15.5 H10.5" />
    </svg>
  );
}

export function CommentPinToolIcon() {
  return (
    <svg {...common}>
      <path d="M10 17.5 C 10 17.5, 15.5 11.7, 15.5 8 C 15.5 4.6, 13 2.5, 10 2.5 C 7 2.5, 4.5 4.6, 4.5 8 C 4.5 11.7, 10 17.5, 10 17.5 Z" />
      <circle cx="10" cy="8" r="1.8" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function CommentBoxToolIcon() {
  return (
    <svg {...common} strokeDasharray="3 2">
      <rect x="3" y="4" width="14" height="12" rx="1.5" />
    </svg>
  );
}

export function CommentFreehandToolIcon() {
  return (
    <svg {...common}>
      <path d="M3 14 C 5 6, 9 4, 11 9 C 12.5 12.5, 15 6, 17 12" />
    </svg>
  );
}

export function CommentsPanelToolIcon() {
  return (
    <svg {...common}>
      <path d="M3 4 H17 V13 H8.5 L5 16.5 V13 H3 Z" />
      <path d="M6.5 7.5 H13.5 M6.5 10 H11" />
    </svg>
  );
}

/** Two side-by-side rectangles — "spread" (double-page) view toggle in
 * ReaderToolStrip.tsx. */
export function SpreadViewIcon() {
  return (
    <svg {...common}>
      <rect x="2" y="4" width="7" height="12" rx="1" />
      <rect x="11" y="4" width="7" height="12" rx="1" />
    </svg>
  );
}

/** Two overlapping/staggered rectangles — "compare arbitrary pages" picker trigger in
 * ReaderToolStrip.tsx, deliberately distinct from SpreadViewIcon's aligned pair so the
 * two aren't visually confusable at a glance. */
export function ComparePagesIcon() {
  return (
    <svg {...common}>
      <rect x="2" y="6" width="10" height="11" rx="1" />
      <rect x="8" y="2" width="10" height="11" rx="1" fill="var(--bg-elevated, #1a1b22)" />
    </svg>
  );
}

export function ChevronLeftIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12.5 4 L6.5 10 L12.5 16" />
    </svg>
  );
}

export function ChevronRightIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M7.5 4 L13.5 10 L7.5 16" />
    </svg>
  );
}

/** Reader-only icons — a book with a magnifier (open-to-read entry point on
 * PageGrid.tsx's page cards) and a target-crosshair (zoom-to-panel affordance in
 * ReaderPanelStrip.tsx). */
export function ReadIcon() {
  return (
    <svg {...common}>
      <path d="M3.5 3.5 C 6 2.5, 8.5 2.5, 10 3.5 C 11.5 2.5, 14 2.5, 16.5 3.5 V 15.5 C 14 14.5, 11.5 14.5, 10 15.5 C 8.5 14.5, 6 14.5, 3.5 15.5 Z" />
      <path d="M10 3.5 V 15.5" />
    </svg>
  );
}

export function FocusTargetIcon() {
  return (
    <svg {...common}>
      <circle cx="10" cy="10" r="6.5" />
      <circle cx="10" cy="10" r="1.4" fill="currentColor" stroke="none" />
      <path d="M10 1.5 V4.5 M10 15.5 V18.5 M1.5 10 H4.5 M15.5 10 H18.5" />
    </svg>
  );
}

export function ChevronDownIcon() {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 3.5 L5 6.5 L8 3.5" />
    </svg>
  );
}

/** Six-dot grip — the draggable handle on a PageGrid.tsx card, kept small and separate
 * from the rest of the card so dragging doesn't fight the card's own click-to-open. */
export function DragHandleIcon() {
  return (
    <svg width={14} height={14} viewBox="0 0 14 14" fill="currentColor" stroke="none">
      <circle cx="4" cy="3" r="1.3" />
      <circle cx="10" cy="3" r="1.3" />
      <circle cx="4" cy="7" r="1.3" />
      <circle cx="10" cy="7" r="1.3" />
      <circle cx="4" cy="11" r="1.3" />
      <circle cx="10" cy="11" r="1.3" />
    </svg>
  );
}

/** A dashed rectangle (detected region) with a small sparkle at its corner — the
 * Auto-Bubbles/OCR tool: run text detection on the current page and review the
 * proposed bubble boxes before inserting them (see ocr/useAutoBubblesRun.ts). */
export function AutoBubblesToolIcon() {
  return (
    <svg width={20} height={20} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.4">
      <rect x="3" y="5" width="10" height="10" rx="1.5" strokeDasharray="2.5 2" />
      <path d="M15.5 3 C15.8 4.5 16.5 5.2 18 5.5 C16.5 5.8 15.8 6.5 15.5 8 C15.2 6.5 14.5 5.8 13 5.5 C14.5 5.2 15.2 4.5 15.5 3 Z" fill="currentColor" stroke="none" />
    </svg>
  );
}

/** Three stacked/offset rectangles — the Layers/Panel navigator toggle (grouped
 * object list with per-panel lock cascades, see LayersPanel.tsx). */
export function LayersToolIcon() {
  return (
    <svg {...common}>
      <rect x="5.5" y="2.5" width="12" height="8" rx="1.5" />
      <rect x="2.5" y="6" width="12" height="8" rx="1.5" fill="var(--bg-elevated, #1a1b22)" />
      <path d="M6.5 11 V16.5 H16" />
    </svg>
  );
}

/** A four-point sparkle — used for the AI-assistant panel toggle. */
export function AIAssistantIcon() {
  return (
    <svg width={20} height={20} viewBox="0 0 20 20" fill="currentColor" stroke="none">
      <path d="M10 2 C10.6 5.4 11.8 6.6 15.2 7.2 C11.8 7.8 10.6 9 10 12.4 C9.4 9 8.2 7.8 4.8 7.2 C8.2 6.6 9.4 5.4 10 2 Z" />
      <path d="M15.5 12 C15.85 13.7 16.3 14.15 18 14.5 C16.3 14.85 15.85 15.3 15.5 17 C15.15 15.3 14.7 14.85 13 14.5 C14.7 14.15 15.15 13.7 15.5 12 Z" opacity="0.7" />
    </svg>
  );
}
