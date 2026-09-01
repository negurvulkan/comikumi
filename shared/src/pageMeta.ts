import { z } from "zod";

/**
 * A volume's page tagging (type + chapter) — an independent per-volume JSON document,
 * same "sibling of the <book><letteringSuffix> folder" pattern as pageOrder.ts/script.ts/
 * comments.ts. Kept separate from PageOrderDocument (rather than folded into it) since
 * this document's "chapters" list has its own lifecycle (add/rename/delete independent
 * of page reordering) and both documents are already optional, additive bookkeeping —
 * merging them would just make every page-order-only read/write also have to carry
 * chapter data it doesn't care about.
 *
 * Chapter *order* is deliberately not stored here: it's derived from the volume's
 * existing page order (first page referencing a chapterId, in page-order sequence),
 * so there's exactly one place ("the page list") that can ever disagree about ordering.
 */

export const PAGE_TYPES = ["cover", "chapterInterstitial", "story"] as const;
export const PageTypeSchema = z.enum(PAGE_TYPES);
export type PageType = z.infer<typeof PageTypeSchema>;

export const ChapterSchema = z.object({
  id: z.string(),
  name: z.string().trim().min(1).max(200),
});
export type Chapter = z.infer<typeof ChapterSchema>;

/** Missing `type` is treated as "story" everywhere this is read — see
 * client/src/routes/pageNumbering.ts and CbzMetadataModal.tsx's default mapping — so a
 * volume with no tagging done yet behaves exactly like "every page is a story page". */
export const PageMetaEntrySchema = z.object({
  type: PageTypeSchema.optional(),
  chapterId: z.string().optional(),
});
export type PageMetaEntry = z.infer<typeof PageMetaEntrySchema>;

export const PageMetaDocumentSchema = z.object({
  chapters: z.array(ChapterSchema).default([]),
  pages: z.record(z.string(), PageMetaEntrySchema).default({}),
});
export type PageMetaDocument = z.infer<typeof PageMetaDocumentSchema>;

export const EMPTY_PAGE_META_DOCUMENT: PageMetaDocument = { chapters: [], pages: {} };

export interface ResolvedChapter {
  chapter: Chapter;
  /** Every page id whose PageMetaEntry has chapterId === chapter.id, in `pageOrder`
   * sequence — membership, not a contiguous-run concept. A chapter's pages can be
   * scattered across the volume (deliberately allowed, not validated against — see
   * client/src/routes/PageGrid.tsx's chapter-section headers, which surface a split
   * chapter visually instead of preventing it). */
  pageIds: string[];
}

/** Chapters in volume order — position is the first page (in `pageOrder`) that
 * references it, never stored separately (see this file's own doc comment on why
 * chapter order is deliberately derived). Shared by export (client/src/export/
 * pageSelection.ts), the volume report, and the QA checker, so all three agree on
 * both chapter order and membership. A chapter with no assigned pages doesn't appear
 * here at all (nothing to export/report) — client/src/editor/ChapterManager.tsx still
 * lists every chapter from `meta.chapters` regardless, for management purposes. */
export function resolveChapters(pageOrder: string[], meta: PageMetaDocument): ResolvedChapter[] {
  const pageIdsByChapterId = new Map<string, string[]>();
  for (const pageId of pageOrder) {
    const chapterId = meta.pages[pageId]?.chapterId;
    if (!chapterId) continue;
    if (!pageIdsByChapterId.has(chapterId)) pageIdsByChapterId.set(chapterId, []);
    pageIdsByChapterId.get(chapterId)!.push(pageId);
  }
  const result: ResolvedChapter[] = [];
  for (const [chapterId, pageIds] of pageIdsByChapterId) {
    const chapter = meta.chapters.find((c) => c.id === chapterId);
    if (chapter) result.push({ chapter, pageIds });
  }
  return result;
}
