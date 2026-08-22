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
} from "../lib/projectStore.js";
import { countVolumesUnder } from "../lib/projectScanner.js";
import { asyncHandler } from "../lib/asyncHandler.js";
import { LanguageListSchema } from "../../../shared/src/languages.js";

export const projectRouter = Router();

projectRouter.get(
  "/current",
  asyncHandler(async (_req, res) => {
    res.json(await getCurrentProjectInfo());
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

const OpenProjectSchema = z.object({ filePath: z.string().min(1) });

projectRouter.post(
  "/open",
  asyncHandler(async (req, res) => {
    const parsed = OpenProjectSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "invalid_request", details: parsed.error.flatten() });
      return;
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
});

projectRouter.post(
  "/new",
  asyncHandler(async (req, res) => {
    const parsed = NewProjectSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "invalid_request", details: parsed.error.flatten() });
      return;
    }
    try {
      const { filePath, ...init } = parsed.data;
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
      res.status(201).json({ createdPaths: targets });
    } catch (err) {
      res.status(400).json({ error: "folder_create_failed", params: { reason: (err as Error).message } });
    }
  })
);
