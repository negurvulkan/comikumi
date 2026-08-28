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
