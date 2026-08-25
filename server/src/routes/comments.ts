import { Router } from "express";
import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { CommentDocumentSchema, CommentTargetSchema, type CommentDocument } from "../../../shared/src/comments.js";
import { ProjectRoleSchema, type ProjectRole } from "../../../shared/src/users.js";
import { findVolume } from "../lib/projectScanner.js";
import { commentsFileName } from "../lib/paths.js";
import { readSettings, readMembers } from "../lib/projectStore.js";
import { listUsers } from "../lib/authStore.js";
import { asyncHandler } from "../lib/asyncHandler.js";
import { resolveCallerProjectRole } from "../lib/auth.js";
import { sendMail, commentDeepLink } from "../lib/mailer.js";

export const commentsRouter = Router();

/**
 * Every route here runs behind app.ts's router-wide `requireAuth, requireViewer` mount
 * for "/api/volumes" — no additional per-route role check is layered on top (unlike
 * layout.ts's translator-vs-letterer split): any project member, viewer and up, may
 * read AND write comments. That's deliberate — "reviewer" isn't a new project role,
 * it's just what the existing lowest rung ("viewer": can see every page) already means
 * once commenting is allowed at that same level. The one exception is DELETE, gated
 * inline below to the comment's own author or a project admin.
 */

async function commentsFileFor(volumeId: string) {
  const volume = await findVolume(volumeId);
  if (!volume) return undefined;
  const settings = await readSettings();
  return { volume, file: path.join(volume.parentDir, commentsFileName(volume.bookFolderName, settings.commentsSuffix)) };
}

async function readCommentsDocument(file: string): Promise<CommentDocument> {
  try {
    const raw = await fs.readFile(file, "utf-8");
    return CommentDocumentSchema.parse(JSON.parse(raw));
  } catch {
    return CommentDocumentSchema.parse({ comments: [] });
  }
}

async function writeCommentsDocument(file: string, doc: CommentDocument): Promise<void> {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, JSON.stringify(doc, null, 2), "utf-8");
}

const MentionFieldsSchema = z.object({
  mentionedUserIds: z.array(z.string()).default([]),
  mentionedRoles: z.array(ProjectRoleSchema).default([]),
});

const CreateCommentInputSchema = MentionFieldsSchema.extend({
  page: z.string().min(1),
  target: CommentTargetSchema,
  body: z.string().min(1),
});

const CreateReplyInputSchema = MentionFieldsSchema.extend({
  body: z.string().min(1),
});

const PatchCommentInputSchema = z.object({
  resolved: z.boolean(),
});

/** Emails everyone @-mentioned on a new comment/reply — individual accounts directly,
 * plus every CURRENT project member holding a mentioned role (resolved at send time,
 * not stored as a snapshot, so a later role change or membership change is always
 * reflected). Silently skips anyone with no email set (see UserAccount.email's doc
 * comment) — mention still works in-app either way, this is purely the notification.
 * Never awaited by its caller's response (see the two POST handlers below) — a slow or
 * failing mail send must never delay/break the comment write, which has already
 * succeeded by the time this runs. */
async function notifyMentions(opts: {
  volumeId: string;
  page: string;
  commentId: string;
  authorId: string;
  mentionedUserIds: string[];
  mentionedRoles: ProjectRole[];
  body: string;
}): Promise<void> {
  const { volumeId, page, commentId, authorId, mentionedUserIds, mentionedRoles, body } = opts;
  if (mentionedUserIds.length === 0 && mentionedRoles.length === 0) return;

  const [members, users] = await Promise.all([readMembers(), listUsers()]);
  const usersById = new Map(users.map((u) => [u.id, u]));

  const targetIds = new Set(mentionedUserIds);
  for (const member of members) {
    if (mentionedRoles.includes(member.role)) targetIds.add(member.userId);
  }
  targetIds.delete(authorId); // never notify yourself for your own mention

  const authorName = usersById.get(authorId)?.username ?? authorId;
  const link = commentDeepLink(volumeId, page, commentId);
  const preview = body.length > 280 ? `${body.slice(0, 280)}…` : body;

  await Promise.all(
    [...targetIds].map((userId) => {
      const email = usersById.get(userId)?.email;
      if (!email) return Promise.resolve();
      return sendMail({
        to: email,
        subject: `${authorName} mentioned you in a review comment`,
        text: `${authorName} mentioned you in a comment on page "${page}":\n\n${preview}${link ? `\n\n${link}` : ""}`,
      });
    })
  );
}

commentsRouter.get(
  "/:id/comments",
  asyncHandler(async (req, res) => {
    const resolved = await commentsFileFor(req.params.id);
    if (!resolved) {
      res.status(404).json({ error: "volume_not_found" });
      return;
    }
    const doc = await readCommentsDocument(resolved.file);
    const page = typeof req.query.page === "string" ? req.query.page : undefined;
    res.json(page ? { comments: doc.comments.filter((c) => c.page === page) } : doc);
  })
);

/** Just enough to build an @-mention picker ({userId, username}, no roles) — deliberately
 * NOT the same as GET /api/project/members, which is admin-only (it exposes the full
 * member/role list for project management). Any commenter needs to see who they can
 * mention, so this is open to the same "viewer and up" baseline as the rest of this
 * router instead of widening the sensitive admin endpoint. */
commentsRouter.get(
  "/:id/comments/mentionable-members",
  asyncHandler(async (req, res) => {
    const volume = await findVolume(req.params.id);
    if (!volume) {
      res.status(404).json({ error: "volume_not_found" });
      return;
    }
    const [members, users] = await Promise.all([readMembers(), listUsers()]);
    const usersById = new Map(users.map((u) => [u.id, u]));
    res.json(
      members
        .map((m) => ({ userId: m.userId, username: usersById.get(m.userId)?.username ?? null }))
        .filter((m): m is { userId: string; username: string } => m.username !== null)
    );
  })
);

commentsRouter.post(
  "/:id/comments",
  asyncHandler(async (req, res) => {
    const resolved = await commentsFileFor(req.params.id);
    if (!resolved) {
      res.status(404).json({ error: "volume_not_found" });
      return;
    }
    const parsed = CreateCommentInputSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "invalid_comment", details: parsed.error.flatten() });
      return;
    }
    const doc = await readCommentsDocument(resolved.file);
    const comment = {
      id: randomUUID(),
      authorId: req.user!.sub,
      createdAt: new Date().toISOString(),
      replies: [],
      ...parsed.data,
    };
    const next = { comments: [...doc.comments, comment] };
    await writeCommentsDocument(resolved.file, next);
    res.status(201).json(comment);
    notifyMentions({
      volumeId: req.params.id,
      page: comment.page,
      commentId: comment.id,
      authorId: comment.authorId,
      mentionedUserIds: comment.mentionedUserIds,
      mentionedRoles: comment.mentionedRoles,
      body: comment.body,
    }).catch((err) => console.error("[comments] notifyMentions failed:", err));
  })
);

commentsRouter.post(
  "/:id/comments/:commentId/replies",
  asyncHandler(async (req, res) => {
    const resolved = await commentsFileFor(req.params.id);
    if (!resolved) {
      res.status(404).json({ error: "volume_not_found" });
      return;
    }
    const parsed = CreateReplyInputSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "invalid_reply", details: parsed.error.flatten() });
      return;
    }
    const doc = await readCommentsDocument(resolved.file);
    const idx = doc.comments.findIndex((c) => c.id === req.params.commentId);
    if (idx === -1) {
      res.status(404).json({ error: "comment_not_found" });
      return;
    }
    const reply = { id: randomUUID(), authorId: req.user!.sub, createdAt: new Date().toISOString(), ...parsed.data };
    const comments = [...doc.comments];
    comments[idx] = { ...comments[idx], replies: [...comments[idx].replies, reply] };
    await writeCommentsDocument(resolved.file, { comments });
    res.status(201).json(comments[idx]);
    notifyMentions({
      volumeId: req.params.id,
      page: comments[idx].page,
      commentId: comments[idx].id,
      authorId: reply.authorId,
      mentionedUserIds: reply.mentionedUserIds,
      mentionedRoles: reply.mentionedRoles,
      body: reply.body,
    }).catch((err) => console.error("[comments] notifyMentions failed:", err));
  })
);

commentsRouter.patch(
  "/:id/comments/:commentId",
  asyncHandler(async (req, res) => {
    const resolved = await commentsFileFor(req.params.id);
    if (!resolved) {
      res.status(404).json({ error: "volume_not_found" });
      return;
    }
    const parsed = PatchCommentInputSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "invalid_comment_patch", details: parsed.error.flatten() });
      return;
    }
    const doc = await readCommentsDocument(resolved.file);
    const idx = doc.comments.findIndex((c) => c.id === req.params.commentId);
    if (idx === -1) {
      res.status(404).json({ error: "comment_not_found" });
      return;
    }
    const comments = [...doc.comments];
    comments[idx] = { ...comments[idx], resolved: parsed.data.resolved || undefined };
    await writeCommentsDocument(resolved.file, { comments });
    res.json(comments[idx]);
  })
);

commentsRouter.delete(
  "/:id/comments/:commentId",
  asyncHandler(async (req, res) => {
    const resolved = await commentsFileFor(req.params.id);
    if (!resolved) {
      res.status(404).json({ error: "volume_not_found" });
      return;
    }
    const doc = await readCommentsDocument(resolved.file);
    const comment = doc.comments.find((c) => c.id === req.params.commentId);
    if (!comment) {
      res.status(404).json({ error: "comment_not_found" });
      return;
    }
    if (comment.authorId !== req.user!.sub) {
      const role = await resolveCallerProjectRole(req);
      if (role !== "admin") {
        res.status(403).json({ error: "forbidden" });
        return;
      }
    }
    const comments = doc.comments.filter((c) => c.id !== req.params.commentId);
    await writeCommentsDocument(resolved.file, { comments });
    res.json({ ok: true });
  })
);
