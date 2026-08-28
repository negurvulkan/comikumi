import type { PageSummary } from "../api/client";
import type { PageMetaDocument, PageType } from "../../../shared/src/pageMeta";

/** Pure helper mirroring pageOrdering.ts's style: derives per-page display info from
 * the already-fetched page list + page-meta document, nothing persisted. */

/** Missing tagging (`type` unset, or the page has no entry at all) is treated as
 * "story" everywhere — see shared/src/pageMeta.ts's PageMetaEntrySchema doc comment —
 * so an untagged volume behaves exactly like "every page is a story page". */
export function pageTypeOf(pageMeta: PageMetaDocument, page: string): PageType {
  return pageMeta.pages[page]?.type ?? "story";
}

export function chapterNameOf(pageMeta: PageMetaDocument, page: string): string | null {
  const chapterId = pageMeta.pages[page]?.chapterId;
  if (!chapterId) return null;
  return pageMeta.chapters.find((c) => c.id === chapterId)?.name ?? null;
}

/** The "actual" (printed) page number: a running count over story pages only, in
 * display order — covers and chapter-interstitials don't get a number. Returns a Map
 * keyed by page name; pages without a number (cover/interstitial) simply have no entry. */
export function computePageNumbers(pages: PageSummary[], pageMeta: PageMetaDocument): Map<string, number> {
  const numbers = new Map<string, number>();
  let next = 1;
  for (const p of pages) {
    if (pageTypeOf(pageMeta, p.page) === "story") {
      numbers.set(p.page, next);
      next += 1;
    }
  }
  return numbers;
}
