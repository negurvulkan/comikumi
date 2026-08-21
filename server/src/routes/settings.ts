import { Router } from "express";
import fs from "node:fs/promises";
import { ProjectSettingsSchema } from "../../../shared/src/settings.js";
import { readSettings, writeSettings } from "../lib/projectStore.js";
import { asyncHandler } from "../lib/asyncHandler.js";

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
  asyncHandler(async (_req, res) => {
    const settings = await readSettings();
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
  asyncHandler(async (req, res) => {
    const parsed = ProjectSettingsSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "invalid settings", details: parsed.error.flatten() });
      return;
    }
    await writeSettings(parsed.data);
    res.json({
      ...parsed.data,
      scanRootExists: await pathExists(parsed.data.scanRoot),
      assetsDirExists: parsed.data.assetsDir ? await pathExists(parsed.data.assetsDir) : true,
      thumbnailsDirExists: parsed.data.thumbnailsDir ? await pathExists(parsed.data.thumbnailsDir) : true,
    });
  })
);
