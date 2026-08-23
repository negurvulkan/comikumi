import type { PageSummary } from "../api/client";

/** Picks the next sequential page name following the volume's existing `page_NN`
 * naming convention — finds the highest numeric suffix among current pages and
 * increments it, keeping the same zero-padded digit width. Falls back to "page_01"
 * when the volume has no pages yet, or none of them follow the pattern (a volume is
 * free to use arbitrary scanned file names — this is just a sensible default for
 * newly created blank pages, not an enforced convention). */
export function nextPageName(pages: PageSummary[]): string {
  let best: { num: number; width: number } | null = null;
  for (const p of pages) {
    const match = /^page_(\d+)$/.exec(p.page);
    if (!match) continue;
    const num = parseInt(match[1], 10);
    if (!best || num > best.num) best = { num, width: match[1].length };
  }
  if (!best) return "page_01";
  const nextNum = String(best.num + 1).padStart(best.width, "0");
  return `page_${nextNum}`;
}
