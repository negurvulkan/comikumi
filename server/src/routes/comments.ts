import { Router } from "express";
import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { CommentDocumentSchema, CommentTargetSchema, type CommentDocument } from "../../../shared/src/comments.js";
import { ProjectRoleSchema, type ProjectRole } from "../../../shared/src/users.js";
import { findVolume } from "../lib/projectScanner.js";
import { commentsFileName } from "../lib/paths.js";
import { readSettings, readMembers, type ActiveProject } from "../lib/projectStore.js";
import { listUsers } from "../lib/authStore.js";
import { asyncHandler } from "../lib/asyncHandler.js";
import { resolveCallerProjectRole } from "../lib/auth.js";
import { sendMail, commentDeepLink } from "../lib/mailer.js";
import { withFileLock } from "../lib/fileLock.js";

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

async function commentsFileFor(volumeId: string, ctx?: ActiveProject) {
  const volume = await findVolume(volumeId, ctx);
  if (!volume) return undefined;
  const settings = await readSettings(ctx);
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

/** Serializes every comments-document read-modify-write against concurrent requests for
 * the same file (see fileLock.ts) — without this, two reviewers posting a comment at
 * the same moment would each read the same old array and one addition would silently
 * overwrite the other's. `mutate` does its own permission/not-found checks: on success
 * it returns `{ nextDoc, respond }` (the response deferred as a closure, since it needs
 * to reply with just the new comment/reply, not the whole document); on a rejected
 * mutation it sends its own error response immediately and returns `null` to skip the
 * write entirely. `respond` is called only AFTER `nextDoc` has actually been written to
 * disk — sending the response first (an earlier version of this function did that,
 * treating the write as fire-and-forget after replying) let a client's own immediate
 * follow-up read race the write, confirmed to actually happen under real load: a GET
 * sent right after a 201 occasionally observed the pre-write document, not the one the
 * 201 had just described. */
async function mutateCommentsDocument(
  file: string,
  mutate: (doc: CommentDocument) => Promise<{ nextDoc: CommentDocument; respond: () => void } | null>
): Promise<void> {
  await withFileLock(file, async () => {
    const doc = await readCommentsDocument(file);
    const result = await mutate(doc);
    if (!result) return;
    await writeCommentsDocument(file, result.nextDoc);
    result.respond();
  });
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
  ctx?: ActiveProject;
}): Promise<void> {
  const { volumeId, page, commentId, authorId, mentionedUserIds, mentionedRoles, body, ctx } = opts;
  if (mentionedUserIds.length === 0 && mentionedRoles.length === 0) return;

  const [members, users] = await Promise.all([readMembers(ctx), listUsers()]);
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
    const resolved = await commentsFileFor(req.params.id, req.activeProject);
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
    const volume = await findVolume(req.params.id, req.activeProject);
    if (!volume) {
      res.status(404).json({ error: "volume_not_found" });
      return;
    }
    const [members, users] = await Promise.all([readMembers(req.activeProject), listUsers()]);
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
    const resolved = await commentsFileFor(req.params.id, req.activeProject);
    if (!resolved) {
      res.status(404).json({ error: "volume_not_found" });
      return;
    }
    const parsed = CreateCommentInputSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "invalid_comment", details: parsed.error.flatten() });
      return;
    }
    await mutateCommentsDocument(resolved.file, async (doc) => {
      const comment = {
        id: randomUUID(),
        authorId: req.user!.sub,
        createdAt: new Date().toISOString(),
        replies: [],
        ...parsed.data,
      };
      return {
        nextDoc: { comments: [...doc.comments, comment] },
        respond: () => {
          res.status(201).json(comment);
          notifyMentions({
            volumeId: req.params.id,
            page: comment.page,
            commentId: comment.id,
            authorId: comment.authorId,
            mentionedUserIds: comment.mentionedUserIds,
            mentionedRoles: comment.mentionedRoles,
            body: comment.body,
            ctx: req.activeProject,
          }).catch((err) => console.error("[comments] notifyMentions failed:", err));
        },
      };
    });
  })
);

commentsRouter.post(
  "/:id/comments/:commentId/replies",
  asyncHandler(async (req, res) => {
    const resolved = await commentsFileFor(req.params.id, req.activeProject);
    if (!resolved) {
      res.status(404).json({ error: "volume_not_found" });
      return;
    }
    const parsed = CreateReplyInputSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "invalid_reply", details: parsed.error.flatten() });
      return;
    }
    await mutateCommentsDocument(resolved.file, async (doc) => {
      const idx = doc.comments.findIndex((c) => c.id === req.params.commentId);
      if (idx === -1) {
        res.status(404).json({ error: "comment_not_found" });
        return null;
      }
      const reply = { id: randomUUID(), authorId: req.user!.sub, createdAt: new Date().toISOString(), ...parsed.data };
      const comments = [...doc.comments];
      comments[idx] = { ...comments[idx], replies: [...comments[idx].replies, reply] };
      return {
        nextDoc: { comments },
        respond: () => {
          res.status(201).json(comments[idx]);
          notifyMentions({
            volumeId: req.params.id,
            page: comments[idx].page,
            commentId: comments[idx].id,
            authorId: reply.authorId,
            mentionedUserIds: reply.mentionedUserIds,
            mentionedRoles: reply.mentionedRoles,
            body: reply.body,
            ctx: req.activeProject,
          }).catch((err) => console.error("[comments] notifyMentions failed:", err));
        },
      };
    });
  })
);

commentsRouter.patch(
  "/:id/comments/:commentId",
  asyncHandler(async (req, res) => {
    const resolved = await commentsFileFor(req.params.id, req.activeProject);
    if (!resolved) {
      res.status(404).json({ error: "volume_not_found" });
      return;
    }
    const parsed = PatchCommentInputSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "invalid_comment_patch", details: parsed.error.flatten() });
      return;
    }
    await mutateCommentsDocument(resolved.file, async (doc) => {
      const idx = doc.comments.findIndex((c) => c.id === req.params.commentId);
      if (idx === -1) {
        res.status(404).json({ error: "comment_not_found" });
        return null;
      }
      const comments = [...doc.comments];
      comments[idx] = { ...comments[idx], resolved: parsed.data.resolved || undefined };
      return { nextDoc: { comments }, respond: () => res.json(comments[idx]) };
    });
  })
);

commentsRouter.delete(
  "/:id/comments/:commentId",
  asyncHandler(async (req, res) => {
    const resolved = await commentsFileFor(req.params.id, req.activeProject);
    if (!resolved) {
      res.status(404).json({ error: "volume_not_found" });
      return;
    }
    await mutateCommentsDocument(resolved.file, async (doc) => {
      const comment = doc.comments.find((c) => c.id === req.params.commentId);
      if (!comment) {
        res.status(404).json({ error: "comment_not_found" });
        return null;
      }
      if (comment.authorId !== req.user!.sub) {
        const role = await resolveCallerProjectRole(req);
        if (role !== "admin") {
          res.status(403).json({ error: "forbidden" });
          return null;
        }
      }
      const comments = doc.comments.filter((c) => c.id !== req.params.commentId);
      return { nextDoc: { comments }, respond: () => res.json({ ok: true }) };
    });
  })
);
