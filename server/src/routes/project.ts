import { Router } from "express";
import { z } from "zod";
import { getCurrentProjectInfo, listRecentProjects, openProject, createProject } from "../lib/projectStore.js";
import { asyncHandler } from "../lib/asyncHandler.js";

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
      const data = await createProject(parsed.data.filePath, { name: parsed.data.name, scanRoot: parsed.data.scanRoot });
      res.status(201).json({ filePath: parsed.data.filePath, ...data });
    } catch (err) {
      res.status(400).json({ error: "project_create_failed", params: { reason: (err as Error).message } });
    }
  })
);
