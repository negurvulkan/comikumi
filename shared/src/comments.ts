import { z } from "zod";
import { PointSchema } from "./layoutSchema.js";
import { ProjectRoleSchema } from "./users.js";

/**
 * Independent per-volume review/QC data model — reviewer feedback tied to a spot on a
 * page (or the page as a whole), deliberately separate from PageLayout/Panel/Bubble in
 * layoutSchema.ts: comments are workflow metadata about the page, not lettering
 * geometry, and mixing them into page.json would trip layout.ts's `isTextOnlyChange`
 * translator diff-guard and bloat every layout save. See shared/src/script.ts for the
 * same "independent per-volume JSON document" pattern this mirrors.
 */

/** Where on the page a comment is anchored — a single pin, a rectangular/polygon box
 * region (same convention as Panel.points), a freehand scribble (one continuous stroke
 * per comment for now — see CommentTargetSchema's "freehand" case), or no particular
 * spot at all ("page"), for general feedback about the page as a whole. */
export const CommentTargetSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("pin"), point: PointSchema }),
  z.object({ kind: z.literal("box"), points: z.array(PointSchema).min(3) }),
  z.object({
    kind: z.literal("freehand"),
    /** One continuous pointer-drag's worth of points, image-space px — a comment holds
     * exactly one stroke for now; circling/underlining/crossing-out in one motion covers
     * the common QC case without needing a full multi-stroke drawing tool. */
    strokes: z.array(z.array(PointSchema)).min(1),
    color: z.string(),
    strokeWidthPx: z.number().positive(),
  }),
  z.object({ kind: z.literal("page") }),
]);
export type CommentTarget = z.infer<typeof CommentTargetSchema>;

export const CommentReplySchema = z.object({
  id: z.string(),
  authorId: z.string(),
  body: z.string().min(1),
  /** ISO 8601 timestamp — set once server-side at creation, never edited. */
  createdAt: z.string(),
  mentionedUserIds: z.array(z.string()).default([]),
  mentionedRoles: z.array(ProjectRoleSchema).default([]),
});
export type CommentReply = z.infer<typeof CommentReplySchema>;

export const CommentSchema = z.object({
  id: z.string(),
  /** Which page this belongs to, e.g. "page_03" — lets a reviewer see every open
   * comment across the whole volume from one document instead of per-page files. */
  page: z.string().min(1),
  target: CommentTargetSchema,
  authorId: z.string(),
  body: z.string().min(1),
  createdAt: z.string(),
  /** See Bubble.locked's doc comment (layoutSchema.ts) for the same `.optional()`
   * instead of `.default(false)` reasoning — only ever written once actually resolved. */
  resolved: z.boolean().optional(),
  mentionedUserIds: z.array(z.string()).default([]),
  mentionedRoles: z.array(ProjectRoleSchema).default([]),
  replies: z.array(CommentReplySchema).default([]),
});
export type Comment = z.infer<typeof CommentSchema>;

export const CommentDocumentSchema = z.object({
  comments: z.array(CommentSchema).default([]),
});
export type CommentDocument = z.infer<typeof CommentDocumentSchema>;
