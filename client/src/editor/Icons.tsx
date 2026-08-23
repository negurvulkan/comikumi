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

export function ChevronDownIcon() {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 3.5 L5 6.5 L8 3.5" />
    </svg>
  );
}
