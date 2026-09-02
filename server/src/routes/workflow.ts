import { Router } from "express";
import fs from "node:fs/promises";
import path from "node:path";
import { EMPTY_WORKFLOW_DOCUMENT, WorkflowDocumentSchema } from "../../../shared/src/workflow.js";
import { findVolume, workflowFilePathFor } from "../lib/projectScanner.js";
import { asyncHandler } from "../lib/asyncHandler.js";
import { requireProjectRole } from "../lib/auth.js";
import { readMembers } from "../lib/projectStore.js";
import { listUsers } from "../lib/authStore.js";
import { computeEtag, NEW_DOCUMENT_ETAG } from "../lib/etag.js";
import { withFileLock } from "../lib/fileLock.js";

export const workflowRouter = Router();

/** Read/write the volume's saved production-status document (cleaning/translation/
 * lettering/QC per page, per language, plus assignee) — same ETag/If-Match/
 * withFileLock/EMPTY-document-fallback pattern as pageMeta.ts's GET/PUT .../pages/meta. */
workflowRouter.get(
  "/:id/workflow",
  asyncHandler(async (req, res) => {
    const volume = await findVolume(req.params.id, req.activeProject);
    if (!volume) {
      res.status(404).json({ error: "volume_not_found" });
      return;
    }
    try {
      const raw = await fs.readFile(workflowFilePathFor(volume), "utf-8");
      res.setHeader("ETag", computeEtag(raw));
      res.json(WorkflowDocumentSchema.parse(JSON.parse(raw)));
    } catch {
      res.setHeader("ETag", NEW_DOCUMENT_ETAG);
      res.json(EMPTY_WORKFLOW_DOCUMENT);
    }
  })
);

// Status updates are lightweight coordination info a translator/letterer should be able
// to keep current for their own work, not a content change — gated at the lowest
// contributing role (translator) rather than pageMeta.ts's "letterer" bar, but still
// above plain viewer so a read-only member can't move the board around.
workflowRouter.put(
  "/:id/workflow",
  requireProjectRole("translator"),
  asyncHandler(async (req, res) => {
    const volume = await findVolume(req.params.id, req.activeProject);
    if (!volume) {
      res.status(404).json({ error: "volume_not_found" });
      return;
    }
    const parsed = WorkflowDocumentSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "invalid_workflow", details: parsed.error.flatten() });
      return;
    }
    const ifMatch = req.header("If-Match");
    const file = workflowFilePathFor(volume);

    await withFileLock(file, async () => {
      let currentRaw: string | null = null;
      try {
        currentRaw = await fs.readFile(file, "utf-8");
      } catch {
        // No workflow document saved yet.
      }
      const currentEtag = currentRaw ? computeEtag(currentRaw) : NEW_DOCUMENT_ETAG;
      if (ifMatch && ifMatch !== currentEtag) {
        const current = currentRaw ? WorkflowDocumentSchema.parse(JSON.parse(currentRaw)) : EMPTY_WORKFLOW_DOCUMENT;
        res.status(409).json({ error: "workflow_conflict", current });
        return;
      }

      await fs.mkdir(path.dirname(file), { recursive: true });
      const nextRaw = JSON.stringify(parsed.data, null, 2);
      await fs.writeFile(file, nextRaw, "utf-8");
      res.setHeader("ETag", computeEtag(nextRaw));
      res.json({ ok: true });
    });
  })
);

// Same shape/reasoning as comments.ts's GET .../comments/mentionable-members: viewer-
// level (below the admin-only GET /api/project/members), just {userId, username} pairs
// for the assignee picker — not the project's own volume, `req.params.id` only exists
// to keep this URL consistent with every other volume-scoped route.
workflowRouter.get(
  "/:id/workflow/assignable-members",
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
