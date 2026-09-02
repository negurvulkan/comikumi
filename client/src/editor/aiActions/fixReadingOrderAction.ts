import { z } from "zod";
import type { Bubble, Panel } from "../../../../shared/src/layoutSchema";
import { getPageReadingOrder, groupBubblesByPanel, type ReadingDirection } from "../reportUtils";
import { extractJsonFence } from "./actionUtils";

export const FIX_READING_ORDER_ACTION = "fix_reading_order" as const;

export const FixReadingOrderSchema = z.object({
  action: z.literal(FIX_READING_ORDER_ACTION),
  order: z.array(z.string()),
  note: z.string(),
});
export type FixReadingOrderAction = z.infer<typeof FixReadingOrderSchema>;

export interface ReadingOrderTarget {
  bubbleId: string;
  text: string;
}

/** The page's current reading order (see reportUtils.ts's getPageReadingOrder) as a flat
 * list, with each bubble's own-language snippet — only offered once there are at least
 * two bubbles to possibly reorder. */
export function findReadingOrderTargets(bubbles: Bubble[], panels: Panel[], activeLanguage: string, readingDirection: ReadingDirection): ReadingOrderTarget[] {
  if (bubbles.length < 2) return [];
  return getPageReadingOrder(bubbles, panels, activeLanguage, readingDirection).map((b) => ({
    bubbleId: b.id,
    text: (b.text[activeLanguage] ?? Object.values(b.text).find((t) => t.trim()) ?? "").trim(),
  }));
}

export function buildFixReadingOrderPrompt(targets: ReadingOrderTarget[]): string {
  if (targets.length === 0) return "";
  const lines: string[] = [
    "Wenn der Nutzer dich bittet, die Lesereihenfolge auf dieser Seite zu prüfen/korrigieren, antworte AUSSCHLIESSLICH mit genau einem ```json-Codeblock in diesem Format (kein Text davor oder danach):",
    "```json",
    '{"action":"fix_reading_order","order":["<bubbleId in neuer Reihenfolge>", "..."],"note":"<kurze Begründung>"}',
    "```",
    "`order` muss GENAU die unten gelisteten bubbleId-Werte enthalten, jeden genau einmal, nur in einer ggf. korrigierten Reihenfolge. Wenn die aktuelle Reihenfolge bereits sinnvoll ist, gib sie unverändert zurück. Bei jeder anderen Frage antworte ganz normal, ohne JSON.",
    "",
    "Aktuelle Lesereihenfolge auf dieser Seite:",
  ];
  targets.forEach((target, i) => lines.push(`${i + 1}. bubbleId=${target.bubbleId} | Text: "${target.text}"`));
  return lines.join("\n");
}

export function parseFixReadingOrderAction(rawText: string, validTargets: ReadingOrderTarget[]): FixReadingOrderAction | null {
  const json = extractJsonFence(rawText);
  if (!json) return null;
  const parsed = FixReadingOrderSchema.safeParse(json);
  if (!parsed.success) return null;
  const validIds = new Set(validTargets.map((t) => t.bubbleId));
  // Must be a permutation of exactly the valid ids — a partial or hallucinated-id list
  // can't be safely turned into dense per-group override numbers (see
  // applyReadingOrder() in the review panel), so reject rather than guess.
  const orderIds = new Set(parsed.data.order);
  if (orderIds.size !== validIds.size || parsed.data.order.some((id) => !validIds.has(id))) return null;
  return parsed.data;
}

/** Turns a full-page proposed order into readingOrderOverride patches — same
 * dense-renumber-the-whole-group approach as reportUtils.ts's moveBubbleInReadingOrder,
 * just applied to every group at once instead of a single up/down move. Cross-group
 * membership (which panel a bubble belongs to) is untouched — only the ranking WITHIN
 * each existing group changes, derived from where its members fall in the proposed
 * order relative to each other. */
export function readingOrderPatches(bubbles: Bubble[], panels: Panel[], activeLanguage: string, readingDirection: ReadingDirection, order: string[]): { bubbleId: string; readingOrderOverride: number }[] {
  const rankInProposal = new Map(order.map((id, i) => [id, i]));
  const groups = groupBubblesByPanel(bubbles, panels, activeLanguage, readingDirection);
  const patches: { bubbleId: string; readingOrderOverride: number }[] = [];
  for (const group of groups) {
    const reordered = [...group.bubbles].sort((a, b) => (rankInProposal.get(a.id) ?? 0) - (rankInProposal.get(b.id) ?? 0));
    reordered.forEach((b, idx) => patches.push({ bubbleId: b.id, readingOrderOverride: idx }));
  }
  return patches;
}
