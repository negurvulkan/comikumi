import { Router } from "express";
import fs from "node:fs/promises";
import path from "node:path";
import multer from "multer";
import { findVolume } from "../lib/projectScanner.js";
import { languageFolderName } from "../lib/paths.js";
import { readSettings } from "../lib/projectStore.js";
import { asyncHandler } from "../lib/asyncHandler.js";

export const exportRouter = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });

exportRouter.post(
  "/:id/export",
  upload.single("png"),
  asyncHandler(async (req, res) => {
    const volume = await findVolume(req.params.id);
    if (!volume) {
      res.status(404).json({ error: "volume not found" });
      return;
    }
    const { folderSuffix, page } = req.body as { folderSuffix?: string; page?: string };
    if (!folderSuffix || !page || !req.file) {
      res.status(400).json({ error: "folderSuffix, page and png file are required" });
      return;
    }
    const settings = await readSettings();
    const dir = path.join(volume.parentDir, languageFolderName(volume.bookFolderName, folderSuffix, settings.exportFolderTemplate));
    await fs.mkdir(dir, { recursive: true });
    const file = path.join(dir, `${page}.png`);
    await fs.writeFile(file, req.file.buffer);
    res.json({ ok: true, path: path.relative(volume.parentDir, file) });
  })
);
