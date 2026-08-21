import { Router } from "express";
import { scanVolumes } from "../lib/projectScanner.js";
import { readLanguages } from "../lib/projectStore.js";
import { asyncHandler } from "../lib/asyncHandler.js";

export const volumesRouter = Router();

volumesRouter.get(
  "/",
  asyncHandler(async (_req, res) => {
    const [volumes, languages] = await Promise.all([scanVolumes(), readLanguages()]);
    res.json(
      volumes.map((v) => ({
        id: v.id,
        bookFolderName: v.bookFolderName,
        existingLanguageFolders: v.existingLanguageFolders,
        languages,
      }))
    );
  })
);
