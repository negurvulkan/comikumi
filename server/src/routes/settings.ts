import { Router } from "express";
import fs from "node:fs/promises";
import { ProjectSettingsSchema } from "../../../shared/src/settings.js";
import { readSettings, writeSettings } from "../lib/projectStore.js";
import { asyncHandler } from "../lib/asyncHandler.js";
import { requireProjectRole } from "../lib/auth.js";

export const settingsRouter = Router();

async function pathExists(p: string): Promise<boolean> {
  try {
    const stat = await fs.stat(p);
    return stat.isDirectory();
  } catch {
    return false;
  }
}

settingsRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const settings = await readSettings(req.activeProject);
    res.json({
      ...settings,
      scanRootExists: await pathExists(settings.scanRoot),
      assetsDirExists: settings.assetsDir ? await pathExists(settings.assetsDir) : true,
      thumbnailsDirExists: settings.thumbnailsDir ? await pathExists(settings.thumbnailsDir) : true,
    });
  })
);

settingsRouter.put(
  "/",
  requireProjectRole("admin"),
  asyncHandler(async (req, res) => {
    const parsed = ProjectSettingsSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "invalid_settings", details: parsed.error.flatten() });
      return;
    }
    await writeSettings(parsed.data, req.activeProject);
    res.json({
      ...parsed.data,
      scanRootExists: await pathExists(parsed.data.scanRoot),
      assetsDirExists: parsed.data.assetsDir ? await pathExists(parsed.data.assetsDir) : true,
      thumbnailsDirExists: parsed.data.thumbnailsDir ? await pathExists(parsed.data.thumbnailsDir) : true,
    });
  })
);
