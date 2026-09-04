/** Named border-dash presets shown in the style dropdown (BubbleInspector.tsx's and
 * PresetManager.tsx's strokeDashPattern fields) — a small, useful subset, not a full
 * vector-tool preset library. "custom" isn't listed here since it's a computed fallback
 * (see matchDashPreset), not a pattern you select into. */
export const DASH_PRESETS: { id: "solid" | "dotted" | "dashed" | "dashDot" | "longDash"; pattern: number[] }[] = [
  { id: "solid", pattern: [] },
  { id: "dotted", pattern: [2, 2] },
  { id: "dashed", pattern: [8, 4] },
  { id: "dashDot", pattern: [8, 4, 2, 4] },
  { id: "longDash", pattern: [16, 6] },
];

function dashPatternsEqual(a: number[], b: number[]): boolean {
  return a.length === b.length && a.every((v, i) => v === b[i]);
}

/** The dropdown's displayed value is computed from the current pattern (matched against
 * DASH_PRESETS), never stored separately — so typing a pattern that happens to match a
 * preset shows that preset's name, and anything else falls back to "custom". */
export function matchDashPreset(pattern: number[]): string {
  return DASH_PRESETS.find((p) => dashPatternsEqual(p.pattern, pattern))?.id ?? "custom";
}

export function parseDashPattern(text: string): number[] {
  return text
    .split(/[\s,]+/)
    .map((s) => Number(s))
    .filter((n) => Number.isFinite(n) && n >= 0);
}

export function formatDashPattern(pattern: number[]): string {
  return pattern.join(" ");
}
