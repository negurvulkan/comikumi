import { z } from "zod";
import type { PageMetaDocument } from "../../../../shared/src/pageMeta";
import { extractJsonFence } from "./actionUtils";

export const SUGGEST_CHAPTERS_ACTION = "suggest_chapters" as const;

export const SuggestChaptersSchema = z.object({
  action: z.literal(SUGGEST_CHAPTERS_ACTION),
  chapters: z.array(z.object({ name: z.string().trim().min(1).max(200), fromPage: z.string(), toPage: z.string(), note: z.string() })),
});
export type SuggestChaptersAction = z.infer<typeof SuggestChaptersSchema>;

/** Volume-level action — no bubble/page-image access, purely structural signals (page
 * names/order and whatever chapter tagging already exists), same "text-only, cheap"
 * scoping as suggestPageTypesAction.ts. Sending 100+ page thumbnails to a vision model
 * for this would be both expensive and unnecessary — chapter breaks are usually visible
 * in the page NAMING already (volume scans are typically named/ordered by the
 * scanlator's own chapter folders), and any wrong guess is reviewed before it touches
 * pageMeta anyway. */
export function buildSuggestChaptersPrompt(pageNames: string[], meta: PageMetaDocument): string {
  if (pageNames.length === 0) return "";
  const lines: string[] = [
    "Wenn der Nutzer dich bittet, eine Kapiteleinteilung für diesen Band vorzuschlagen, antworte AUSSCHLIESSLICH mit genau einem ```json-Codeblock in diesem Format (kein Text davor oder danach):",
    "```json",
    '{"action":"suggest_chapters","chapters":[{"name":"<Kapitelname>","fromPage":"<erste Seite>","toPage":"<letzte Seite>","note":"<kurze Begründung>"}]}',
    "```",
    "`fromPage`/`toPage` müssen exakte Seitennamen aus der Liste unten sein (fromPage kommt in der Reihenfolge nicht nach toPage) — jedes Kapitel deckt einen zusammenhängenden Bereich ab. Nutze Muster im Seitennamen (z.B. Kapitelnummern/-titel) als Hinweis. Bei jeder anderen Frage antworte ganz normal, ohne JSON.",
    "",
    "Seiten dieses Bands in Reihenfolge:",
    ...pageNames.map((p) => `- ${p}`),
  ];
  if (meta.chapters.length > 0) {
    lines.push("", "Bereits vorhandene Kapitel (nicht erneut vorschlagen):");
    for (const c of meta.chapters) lines.push(`- ${c.name}`);
  }
  return lines.join("\n");
}

export function parseSuggestChaptersAction(rawText: string, pageNames: string[]): SuggestChaptersAction | null {
  const json = extractJsonFence(rawText);
  if (!json) return null;
  const parsed = SuggestChaptersSchema.safeParse(json);
  if (!parsed.success) return null;
  const indexOf = new Map(pageNames.map((p, i) => [p, i]));
  const chapters = parsed.data.chapters.filter((c) => {
    const from = indexOf.get(c.fromPage);
    const to = indexOf.get(c.toPage);
    return from !== undefined && to !== undefined && from <= to;
  });
  if (chapters.length === 0) return null;
  return { ...parsed.data, chapters };
}
