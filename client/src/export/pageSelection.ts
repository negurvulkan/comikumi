import type { PageSummary } from "../api/client";

export type PageSelectionMode = "current" | "all" | "even" | "odd" | "range" | "custom" | "chapter";

export interface PageSelection {
  mode: PageSelectionMode;
  rangeFrom?: number;
  rangeTo?: number;
  /** e.g. "1,3,5,10-14" */
  custom?: string;
  /** For mode "chapter" — precomputed by the caller (ExportPanel.tsx) via
   * shared/src/pageMeta.ts's resolveChapters(), since this module stays chapter-
   * unaware otherwise (same "just an id set" pattern as `custom` above, minus the
   * number-parsing). */
  chapterPageIds?: Set<string>;
}

/** Thrown by parseCustomSelection on invalid syntax — code is a stable key translatable
 * via the client's `pageSelectionErrors.*` i18n namespace (see ExportPanel.tsx), params
 * carries any interpolation value (the offending fragment). */
export class PageSelectionError extends Error {
  code: string;
  params?: Record<string, string>;

  constructor(code: string, params?: Record<string, string>) {
    super(code);
    this.code = code;
    this.params = params;
  }
}

/** Extracts the last run of digits in a page id (e.g. "page_03" -> 3) — the number the user sees on the page thumbnail/filename, not its position in the list. */
function pageNumber(page: string): number | null {
  const matches = page.match(/\d+/g);
  if (!matches || matches.length === 0) return null;
  return parseInt(matches[matches.length - 1], 10);
}

/**
 * Parses a comma-separated list of page numbers and ranges (e.g. "1,3,5,10-14")
 * into a set of individual page numbers. Throws with a human-readable message on
 * invalid syntax so the UI can surface it directly.
 */
export function parseCustomSelection(input: string): Set<number> {
  const trimmed = input.trim();
  if (!trimmed) throw new PageSelectionError("empty_selection");
  const result = new Set<number>();
  const parts = trimmed.split(",").map((p) => p.trim()).filter((p) => p.length > 0);
  if (parts.length === 0) throw new PageSelectionError("empty_selection");
  for (const part of parts) {
    const rangeMatch = part.match(/^(\d+)\s*-\s*(\d+)$/);
    if (rangeMatch) {
      const from = parseInt(rangeMatch[1], 10);
      const to = parseInt(rangeMatch[2], 10);
      if (from > to) throw new PageSelectionError("invalid_range", { part });
      for (let n = from; n <= to; n++) result.add(n);
      continue;
    }
    if (/^\d+$/.test(part)) {
      result.add(parseInt(part, 10));
      continue;
    }
    throw new PageSelectionError("invalid_expression", { part });
  }
  return result;
}

/** Applies a PageSelection to the full page list, preserving the list's original order. */
export function selectPages(pages: PageSummary[], selection: PageSelection, currentPage: string): PageSummary[] {
  switch (selection.mode) {
    case "current":
      return pages.filter((p) => p.page === currentPage);
    case "all":
      return pages;
    case "even":
      return pages.filter((p) => {
        const n = pageNumber(p.page);
        return n !== null && n % 2 === 0;
      });
    case "odd":
      return pages.filter((p) => {
        const n = pageNumber(p.page);
        return n !== null && n % 2 !== 0;
      });
    case "range": {
      const from = selection.rangeFrom ?? 1;
      const to = selection.rangeTo ?? Number.POSITIVE_INFINITY;
      return pages.filter((p) => {
        const n = pageNumber(p.page);
        return n !== null && n >= from && n <= to;
      });
    }
    case "custom": {
      const numbers = parseCustomSelection(selection.custom ?? "");
      return pages.filter((p) => {
        const n = pageNumber(p.page);
        return n !== null && numbers.has(n);
      });
    }
    case "chapter":
      return pages.filter((p) => selection.chapterPageIds?.has(p.page));
    default:
      return [];
  }
}
