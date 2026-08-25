import { Router } from "express";
import fs from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import {
  getCurrentProjectInfo,
  listRecentProjects,
  listArchivedProjects,
  openProject,
  createProject,
  removeRecentProject,
  archiveProject,
  unarchiveProject,
  deleteProjectFile,
  peekProjectMembers,
  readMembers,
  writeMembers,
  readMembersByPath,
  writeMembersByPath,
} from "../lib/projectStore.js";
import { countVolumesUnder, invalidateVolumesCache } from "../lib/projectScanner.js";
import { asyncHandler } from "../lib/asyncHandler.js";
import { requireSystemAdmin, requireProjectRole, requireAuth } from "../lib/auth.js";
import { findUserByUsername, listUsers } from "../lib/authStore.js";
import { getRecentlyActive } from "../lib/activityTracker.js";
import { LanguageListSchema } from "../../../shared/src/languages.js";
import { ProjectRoleSchema } from "../../../shared/src/users.js";

/** How recently someone must have made an authenticated request to count as "still
 * active" for the project-switch warning below. */
const PROJECT_SWITCH_ACTIVITY_WINDOW_MS = 5 * 60_000;

/** Shared by /new and /open — 409s with the list of other users seen within the last
 * PROJECT_SWITCH_ACTIVITY_WINDOW_MS unless the caller passed `force`, so switching the
 * server's single active project (see projectStore.ts's `active` singleton doc comment)
 * warns instead of silently pulling it out from under whoever's still working in it. */
function blockedBySwitchGuard(req: import("express").Request, force: boolean | undefined): { activeUsers: { username: string; secondsAgo: number }[] } | null {
  if (force) return null;
  const activeUsers = getRecentlyActive(req.user!.sub, PROJECT_SWITCH_ACTIVITY_WINDOW_MS);
  return activeUsers.length > 0 ? { activeUsers } : null;
}

export const projectRouter = Router();

projectRouter.get(
  "/current",
  asyncHandler(async (req, res) => {
    const info = await getCurrentProjectInfo();
    if (!info) {
      res.json(null);
      return;
    }
    let myRole: string = "none";
    if (req.user?.isSystemAdmin) {
      myRole = "system-admin";
    } else {
      const members = await readMembers();
      myRole = members.find((m) => m.userId === req.user?.sub)?.role ?? "none";
    }
    res.json({ ...info, myRole });
  })
);

projectRouter.get(
  "/recent",
  asyncHandler(async (_req, res) => {
    res.json(await listRecentProjects());
  })
);

projectRouter.get(
  "/archived",
  asyncHandler(async (_req, res) => {
    res.json(await listArchivedProjects());
  })
);

const COVER_MIME_BY_EXT: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".bmp": "image/bmp",
};

/** Serves an arbitrary local image file by absolute path — the project-switcher cards'
 * cover images live wherever the user picked them via FileBrowserModal (settings.
 * coverImagePath), not in a managed asset folder, so there's no fixed base directory to
 * serve from the way the fonts/images/bubble-svgs asset routers do. Same trust model as
 * /api/browse (this tool already reads arbitrary local paths for a single local user) —
 * restricted to known image extensions rather than any file. */
projectRouter.get(
  "/cover",
  asyncHandler(async (req, res) => {
    const rawPath = typeof req.query.path === "string" ? req.query.path : "";
    const mime = COVER_MIME_BY_EXT[path.extname(rawPath).toLowerCase()];
    if (!rawPath || !mime) {
      res.status(400).json({ error: "invalid_request" });
      return;
    }
    try {
      await fs.access(rawPath);
    } catch {
      res.status(404).json({ error: "cover_not_found" });
      return;
    }
    res.type(mime);
    res.sendFile(path.resolve(rawPath));
  })
);

const FilePathBodySchema = z.object({ filePath: z.string().min(1) });

/** Shared guard for the three list-mutating/destructive routes below — none of them
 * may target the currently open project (it would leave the app pointing at a project
 * no longer reachable from the switcher, or in deleteProjectFile's case, delete the
 * file a running session still has open). The client also disables these actions for
 * the active project's card; this is the defense-in-depth backstop. */
async function rejectIfActiveProject(filePath: string): Promise<boolean> {
  const current = await getCurrentProjectInfo();
  return current?.filePath === filePath;
}

projectRouter.post(
  "/recent/remove",
  requireSystemAdmin,
  asyncHandler(async (req, res) => {
    const parsed = FilePathBodySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "invalid_request", details: parsed.error.flatten() });
      return;
    }
    if (await rejectIfActiveProject(parsed.data.filePath)) {
      res.status(400).json({ error: "cannot_modify_active_project" });
      return;
    }
    await removeRecentProject(parsed.data.filePath);
    res.json({ ok: true });
  })
);

projectRouter.post(
  "/archive",
  requireSystemAdmin,
  asyncHandler(async (req, res) => {
    const parsed = FilePathBodySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "invalid_request", details: parsed.error.flatten() });
      return;
    }
    if (await rejectIfActiveProject(parsed.data.filePath)) {
      res.status(400).json({ error: "cannot_modify_active_project" });
      return;
    }
    await archiveProject(parsed.data.filePath);
    res.json({ ok: true });
  })
);

projectRouter.post(
  "/unarchive",
  requireSystemAdmin,
  asyncHandler(async (req, res) => {
    const parsed = FilePathBodySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "invalid_request", details: parsed.error.flatten() });
      return;
    }
    await unarchiveProject(parsed.data.filePath);
    res.json({ ok: true });
  })
);

projectRouter.post(
  "/delete-file",
  requireSystemAdmin,
  asyncHandler(async (req, res) => {
    const parsed = FilePathBodySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "invalid_request", details: parsed.error.flatten() });
      return;
    }
    if (await rejectIfActiveProject(parsed.data.filePath)) {
      res.status(400).json({ error: "cannot_modify_active_project" });
      return;
    }
    try {
      await deleteProjectFile(parsed.data.filePath);
      res.json({ ok: true });
    } catch (err) {
      res.status(400).json({ error: "project_delete_failed", params: { reason: (err as Error).message } });
    }
  })
);

const OpenProjectSchema = z.object({ filePath: z.string().min(1), force: z.boolean().optional() });

/** Unlike the other project-switcher mutations, opening isn't system-admin-only: any
 * authenticated user may open a project they're a member of (checked against the
 * target file's OWN members list, via peekProjectMembers — read without activating
 * it first, so a non-member never even briefly becomes "the active project"). System
 * admins bypass the check, same as requireProjectRole() elsewhere. */
projectRouter.post(
  "/open",
  asyncHandler(async (req, res) => {
    const parsed = OpenProjectSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "invalid_request", details: parsed.error.flatten() });
      return;
    }
    if (!req.user!.isSystemAdmin) {
      const members = await peekProjectMembers(parsed.data.filePath);
      const isMember = members?.some((m) => m.userId === req.user!.sub) ?? false;
      if (!isMember) {
        res.status(403).json({ error: "forbidden" });
        return;
      }
    }
    const current = await getCurrentProjectInfo();
    if (current?.filePath !== parsed.data.filePath) {
      const blocked = blockedBySwitchGuard(req, parsed.data.force);
      if (blocked) {
        res.status(409).json({ error: "project_switch_blocked", ...blocked });
        return;
      }
    }
    try {
      const data = await openProject(parsed.data.filePath);
      res.json({ filePath: parsed.data.filePath, ...data });
    } catch (err) {
      res.status(400).json({ error: "project_open_failed", params: { reason: (err as Error).message } });
    }
  })
);

const NewProjectSchema = z.object({
  filePath: z.string().min(1),
  name: z.string().min(1),
  scanRoot: z.string().min(1),
  createScanRootIfMissing: z.boolean().optional(),
  emptySuffix: z.string().min(1).optional(),
  letteringSuffix: z.string().min(1).optional(),
  scriptSuffix: z.string().min(1).optional(),
  exportFolderTemplate: z.string().min(1).optional(),
  languages: LanguageListSchema.optional(),
  readingDirection: z.enum(["ltr", "rtl"]).optional(),
  force: z.boolean().optional(),
});

projectRouter.post(
  "/new",
  requireSystemAdmin,
  asyncHandler(async (req, res) => {
    const parsed = NewProjectSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "invalid_request", details: parsed.error.flatten() });
      return;
    }
    // Creating a project always activates it, so this always switches away from
    // whatever's currently open (if anything) — same guard as /open.
    const blocked = blockedBySwitchGuard(req, parsed.data.force);
    if (blocked) {
      res.status(409).json({ error: "project_switch_blocked", ...blocked });
      return;
    }
    try {
      const { filePath, force: _force, ...init } = parsed.data;
      const data = await createProject(filePath, init);
      res.status(201).json({ filePath, ...data });
    } catch (err) {
      res.status(400).json({ error: "project_create_failed", params: { reason: (err as Error).message } });
    }
  })
);

const ScanRootStatusQuerySchema = z.object({ scanRoot: z.string().min(1), emptySuffix: z.string().min(1) });

/** Read-only check used by the new-project wizard before any project exists — does the
 * scan root exist, and how many "<book><emptySuffix>" volumes does it already contain?
 * Not-found is a normal, expected state here (not an error). */
projectRouter.get(
  "/scan-root-status",
  requireSystemAdmin,
  asyncHandler(async (req, res) => {
    const parsed = ScanRootStatusQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ error: "invalid_request", details: parsed.error.flatten() });
      return;
    }
    const { scanRoot, emptySuffix } = parsed.data;
    let exists = true;
    try {
      await fs.access(scanRoot);
    } catch {
      exists = false;
    }
    const volumeCount = exists ? await countVolumesUnder(scanRoot, emptySuffix) : 0;
    res.json({ exists, volumeCount });
  })
);

const CreateScanRootSchema = z.object({ scanRoot: z.string().min(1) });

projectRouter.post(
  "/scan-root",
  requireSystemAdmin,
  asyncHandler(async (req, res) => {
    const parsed = CreateScanRootSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "invalid_request", details: parsed.error.flatten() });
      return;
    }
    try {
      await fs.mkdir(parsed.data.scanRoot, { recursive: true });
      res.status(201).json({ created: true });
    } catch (err) {
      res.status(400).json({ error: "folder_create_failed", params: { reason: (err as Error).message } });
    }
  })
);

const CreateVolumeFoldersSchema = z.object({
  scanRoot: z.string().min(1),
  emptySuffix: z.string().min(1),
  bookName: z.string().min(1),
  languageFolderSuffixes: z.array(z.string().min(1)).default([]),
});

/** Creates "<scanRoot>/<bookName>/<bookName><emptySuffix>" plus one
 * "<scanRoot>/<bookName>/<bookName>_<suffix>" per requested language — nested one level
 * under a "<bookName>" folder rather than directly in scanRoot, because
 * projectScanner.ts derives a volume's id from its *parent* folder's path relative to
 * scanRoot (see VolumeInfo.id/relId in scanVolumes()): a volume folder placed directly
 * in scanRoot would get an empty id (parentDir === scanRoot), which 404s the moment
 * anyone opens it. This mirrors the nesting every real project already uses (e.g.
 * "Volume_01/volume_01_empty"). Paths are built server-side (path.join) rather than
 * trusting client-assembled paths, so this can't be pointed at an arbitrary location and
 * stays correct across platform path-separator conventions. */
projectRouter.post(
  "/volume-folders",
  requireSystemAdmin,
  asyncHandler(async (req, res) => {
    const parsed = CreateVolumeFoldersSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "invalid_request", details: parsed.error.flatten() });
      return;
    }
    const { scanRoot, emptySuffix, bookName, languageFolderSuffixes } = parsed.data;
    try {
      const bookDir = path.join(scanRoot, bookName);
      const targets = [
        path.join(bookDir, `${bookName}${emptySuffix}`),
        ...languageFolderSuffixes.map((suffix) => path.join(bookDir, `${bookName}_${suffix}`)),
      ];
      for (const dir of targets) {
        await fs.mkdir(dir, { recursive: true });
      }
      invalidateVolumesCache();
      res.status(201).json({ createdPaths: targets });
    } catch (err) {
      res.status(400).json({ error: "folder_create_failed", params: { reason: (err as Error).message } });
    }
  })
);

/** Members of the project — resolved to username for display.
 * Supports optional query parameter filePath (defaults to active project if omitted).
 * Access is restricted to System Admins or Project Admins of the specified project. */
projectRouter.get(
  "/members",
  asyncHandler(async (req, res) => {
    let filePath = req.query.filePath as string | undefined;
    if (!filePath) {
      const current = await getCurrentProjectInfo();
      if (!current) {
        res.status(400).json({ error: "no_active_project" });
        return;
      }
      filePath = current.filePath;
    }
    // Authorization check: system admin or project admin of this project file
    if (!req.user!.isSystemAdmin) {
      const members = await peekProjectMembers(filePath);
      const membership = members?.find((m) => m.userId === req.user!.sub);
      if (!membership || membership.role !== "admin") {
        res.status(403).json({ error: "forbidden" });
        return;
      }
    }
    try {
      const [members, users] = await Promise.all([readMembersByPath(filePath), listUsers()]);
      const usersById = new Map(users.map((u) => [u.id, u]));
      res.json(
        members.map((m) => ({
          userId: m.userId,
          role: m.role,
          username: usersById.get(m.userId)?.username ?? null,
        }))
      );
    } catch (err) {
      res.status(400).json({ error: "project_read_failed", params: { reason: (err as Error).message } });
    }
  })
);

const AddMemberSchema = z.object({
  username: z.string().trim().min(1),
  role: ProjectRoleSchema,
  filePath: z.string().optional(),
});

projectRouter.post(
  "/members",
  asyncHandler(async (req, res) => {
    const parsed = AddMemberSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "invalid_request", details: parsed.error.flatten() });
      return;
    }
    let filePath = parsed.data.filePath;
    if (!filePath) {
      const current = await getCurrentProjectInfo();
      if (!current) {
        res.status(400).json({ error: "no_active_project" });
        return;
      }
      filePath = current.filePath;
    }
    // Authorization check
    if (!req.user!.isSystemAdmin) {
      const members = await peekProjectMembers(filePath);
      const membership = members?.find((m) => m.userId === req.user!.sub);
      if (!membership || membership.role !== "admin") {
        res.status(403).json({ error: "forbidden" });
        return;
      }
    }
    const user = await findUserByUsername(parsed.data.username);
    if (!user) {
      res.status(404).json({ error: "user_not_found" });
      return;
    }
    try {
      const members = await readMembersByPath(filePath);
      const next = [...members.filter((m) => m.userId !== user.id), { userId: user.id, role: parsed.data.role }];
      await writeMembersByPath(filePath, next);
      res.status(201).json({ ok: true });
    } catch (err) {
      res.status(400).json({ error: "project_write_failed", params: { reason: (err as Error).message } });
    }
  })
);

projectRouter.delete(
  "/members/:userId",
  asyncHandler(async (req, res) => {
    let filePath = req.query.filePath as string | undefined;
    if (!filePath) {
      const current = await getCurrentProjectInfo();
      if (!current) {
        res.status(400).json({ error: "no_active_project" });
        return;
      }
      filePath = current.filePath;
    }
    // Authorization check
    if (!req.user!.isSystemAdmin) {
      const members = await peekProjectMembers(filePath);
      const membership = members?.find((m) => m.userId === req.user!.sub);
      if (!membership || membership.role !== "admin") {
        res.status(403).json({ error: "forbidden" });
        return;
      }
    }
    try {
      const members = await readMembersByPath(filePath);
      const next = members.filter((m) => m.userId !== req.params.userId);
      await writeMembersByPath(filePath, next);
      res.json({ ok: true });
    } catch (err) {
      res.status(400).json({ error: "project_write_failed", params: { reason: (err as Error).message } });
    }
  })
);

/** List of projects for admin page.
 * System Admins see all projects; Project Admins see only their own projects. */
projectRouter.get(
  "/list",
  asyncHandler(async (req, res) => {
    const [recent, archived] = await Promise.all([listRecentProjects(), listArchivedProjects()]);
    const all = [
      ...recent.map((p) => ({ ...p, isArchived: false })),
      ...archived.map((p) => ({ ...p, isArchived: true })),
    ];
    const results: any[] = [];
    for (const p of all) {
      const members = await peekProjectMembers(p.filePath);
      const isProjectAdmin = members?.some((m) => m.userId === req.user!.sub && m.role === "admin") ?? false;
      const isAdmin = req.user!.isSystemAdmin || isProjectAdmin;

      results.push({
        filePath: p.filePath,
        name: p.name ?? path.basename(p.filePath, ".json"),
        coverImagePath: p.coverImagePath,
        isAdmin,
        isArchived: p.isArchived,
      });
    }
    const filtered = req.user!.isSystemAdmin ? results : results.filter((p) => p.isAdmin);
    res.json(filtered);
  })
);

