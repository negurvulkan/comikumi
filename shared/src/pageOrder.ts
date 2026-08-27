import { z } from "zod";

/**
 * A volume's page display order — an independent per-volume JSON document, same
 * "sibling of the <book><letteringSuffix> folder" pattern as script.ts/comments.ts.
 * Deliberately just a flat list of page names (no ids, no per-entry metadata): a page
 * has no natural identity beyond its filename stem (see server/src/lib/
 * projectScanner.ts's PageInfo), and the whole array is small enough that full-array
 * replacement (rather than patch-style updates) is the simplest correct model.
 *
 * Entries are tolerant of drift from disk by design — server/src/lib/
 * projectScanner.ts's listPages() silently drops any name no longer present on disk
 * (a deleted page), and appends any on-disk page missing from this array (freshly
 * uploaded, or the file predates this document ever being saved) rather than erroring.
 * This mirrors the "stale reference is harmless" convention already used for
 * Bubble.panelId/characterId/presetId elsewhere in this codebase.
 */
export const PageOrderDocumentSchema = z.object({
  order: z.array(z.string()),
});
export type PageOrderDocument = z.infer<typeof PageOrderDocumentSchema>;
