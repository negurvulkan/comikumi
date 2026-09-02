import { z } from "zod";
import { PAGE_TYPES, PageTypeSchema, type PageMetaDocument } from "../../../../shared/src/pageMeta";
import { extractJsonFence } from "./actionUtils";

export const SUGGEST_PAGE_TYPES_ACTION = "suggest_page_types" as const;

export const SuggestPageTypesSchema = z.object({
  action: z.literal(SUGGEST_PAGE_TYPES_ACTION),
  patches: z.array(z.object({ page: z.string(), type: PageTypeSchema, note: z.string() })),
});
export type SuggestPageTypesAction = z.infer<typeof SuggestPageTypesSchema>;

export interface PageTypeCandidate {
  page: string;
  index: number;
  currentType: (typeof PAGE_TYPES)[number];
}

/** Only pages still at the default "story" tag (see PageMetaEntrySchema's doc comment —
 * missing `type` reads as "story") are worth proposing a change for; an already-tagged
 * page was presumably tagged on purpose. Text-only signals (name + position), same
 * scoping rationale as suggestChaptersAction.ts — the prompt is explicit that this is a
 * low-confidence guess to be reviewed, not a confident classification, since there's no
 * page image in play here to actually look at. */
export function findPageTypeCandidates(pageNames: string[], meta: PageMetaDocument): PageTypeCandidate[] {
  return pageNames
    .map((page, index) => ({ page, index, currentType: meta.pages[page]?.type ?? ("story" as const) }))
    .filter((c) => c.currentType === "story");
}

export function buildSuggestPageTypesPrompt(candidates: PageTypeCandidate[], totalPages: number): string {
  if (candidates.length === 0) return "";
  const lines: string[] = [
    "Wenn der Nutzer dich bittet, Seitentypen (Cover/Kapitel-Zwischenseite/Story) vorzuschlagen, antworte AUSSCHLIESSLICH mit genau einem ```json-Codeblock in diesem Format (kein Text davor oder danach):",
    "```json",
    '{"action":"suggest_page_types","patches":[{"page":"<Seitenname>","type":"cover|chapterInterstitial|story","note":"<kurze Begründung>"}]}',
    "```",
    `Das ist eine UNSICHERE Vermutung allein aus Seitenname und Position (Band hat ${totalPages} Seiten insgesamt, du siehst keine Bilder) — schlage nur "cover" oder "chapterInterstitial" vor, wenn Name/Position wirklich dafür sprechen (z.B. erste Seite, oder ein Name wie "cover"/"titel"); lass unsichere Seiten einfach weg statt zu raten. Bei jeder anderen Frage antworte ganz normal, ohne JSON.`,
    "",
    'Seiten, die noch als "story" (Standard) getaggt sind, in Reihenfolge:',
  ];
  for (const c of candidates) lines.push(`- Position ${c.index + 1}/${totalPages}: ${c.page}`);
  return lines.join("\n");
}

export function parseSuggestPageTypesAction(rawText: string, candidatePages: string[]): SuggestPageTypesAction | null {
  const json = extractJsonFence(rawText);
  if (!json) return null;
  const parsed = SuggestPageTypesSchema.safeParse(json);
  if (!parsed.success) return null;
  const validPages = new Set(candidatePages);
  const patches = parsed.data.patches.filter((p) => validPages.has(p.page) && p.type !== "story");
  if (patches.length === 0) return null;
  return { ...parsed.data, patches };
}
