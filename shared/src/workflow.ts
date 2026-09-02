import { z } from "zod";

/**
 * A volume's per-page production status — an independent per-volume JSON document,
 * same "sibling of the <book><letteringSuffix> folder" pattern as pageOrder.ts/
 * pageMeta.ts/comments.ts. Tracks where each page stands in the pipeline (cleaning,
 * then translation/lettering/QC per language) plus who's currently on it, so a team
 * can see "Page 12: Cleaning done, Lettering DE in progress — Hanjo, QC DE pending"
 * at a glance instead of inferring status from chat/comments.
 *
 * Cleaning is page-level (the reconstructed artwork is shared by every language, see
 * useCleanedBackground in layoutSchema.ts), so it lives outside `languages`. Everything
 * else genuinely differs per language (a page can be translated into German long before
 * Korean lettering even starts), so those three phases are keyed by language code.
 *
 * Missing status = "pending" everywhere this is read (same "absence is a defined
 * default state" convention as PageMetaEntrySchema in pageMeta.ts) — a freshly added
 * page or language needs no explicit initialization.
 */

export const WORKFLOW_STATUSES = ["pending", "in_progress", "review_requested", "changes_requested", "approved"] as const;
export const WorkflowStatusSchema = z.enum(WORKFLOW_STATUSES);
export type WorkflowStatus = z.infer<typeof WorkflowStatusSchema>;

export const WORKFLOW_LANGUAGE_PHASES = ["translation", "lettering", "qc"] as const;
export type WorkflowLanguagePhase = (typeof WORKFLOW_LANGUAGE_PHASES)[number];

export const WorkflowEntrySchema = z.object({
  status: WorkflowStatusSchema.default("pending"),
  /** A UserAccount.id, same convention as comments.ts's authorId — resolved to a
   * username client-side via the assignable-members endpoint, never denormalized
   * server-side. Absent means unassigned, not "assigned to no one" as a status. */
  assigneeUserId: z.string().optional(),
});
export type WorkflowEntry = z.infer<typeof WorkflowEntrySchema>;

const LanguageWorkflowSchema = z.object({
  translation: WorkflowEntrySchema.optional(),
  lettering: WorkflowEntrySchema.optional(),
  qc: WorkflowEntrySchema.optional(),
});

export const PageWorkflowSchema = z.object({
  cleaning: WorkflowEntrySchema.optional(),
  languages: z.record(z.string(), LanguageWorkflowSchema).default({}),
});
export type PageWorkflow = z.infer<typeof PageWorkflowSchema>;

export const WorkflowDocumentSchema = z.object({
  /** Keyed by page id (filename), same convention as PageMetaDocument.pages. */
  pages: z.record(z.string(), PageWorkflowSchema).default({}),
});
export type WorkflowDocument = z.infer<typeof WorkflowDocumentSchema>;

export const EMPTY_WORKFLOW_DOCUMENT: WorkflowDocument = { pages: {} };

/** Reads a single phase's entry for a page, applying the "missing = pending" default —
 * the one place this convention is encoded, so callers never repeat the `?? "pending"`
 * fallback by hand. `phase` is `"cleaning"` (page-level) or a language code paired with
 * one of WORKFLOW_LANGUAGE_PHASES. */
export function getWorkflowEntry(page: PageWorkflow | undefined, phase: "cleaning"): WorkflowEntry;
export function getWorkflowEntry(page: PageWorkflow | undefined, phase: WorkflowLanguagePhase, languageCode: string): WorkflowEntry;
export function getWorkflowEntry(page: PageWorkflow | undefined, phase: "cleaning" | WorkflowLanguagePhase, languageCode?: string): WorkflowEntry {
  const fallback: WorkflowEntry = { status: "pending" };
  if (phase === "cleaning") return page?.cleaning ?? fallback;
  return page?.languages[languageCode!]?.[phase] ?? fallback;
}
