import { Router } from "express";
import fs from "node:fs/promises";
import path from "node:path";
import { ScriptDocumentSchema } from "../../../shared/src/script.js";
import { findVolume } from "../lib/projectScanner.js";
import { scriptFileName } from "../lib/paths.js";
import { readSettings } from "../lib/projectStore.js";
import { asyncHandler } from "../lib/asyncHandler.js";
import { requireProjectRole } from "../lib/auth.js";

export const scriptRouter = Router();

async function scriptFileFor(volumeId: string) {
  const volume = await findVolume(volumeId);
  if (!volume) return undefined;
  const settings = await readSettings();
  return { volume, file: path.join(volume.parentDir, scriptFileName(volume.bookFolderName, settings.scriptSuffix)) };
}

scriptRouter.get(
  "/:id/script",
  asyncHandler(async (req, res) => {
    const resolved = await scriptFileFor(req.params.id);
    if (!resolved) {
      res.status(404).json({ error: "volume_not_found" });
      return;
    }
    try {
      const raw = await fs.readFile(resolved.file, "utf-8");
      res.json(ScriptDocumentSchema.parse(JSON.parse(raw)));
    } catch {
      // No script saved yet -> an empty document, same "fall back to empty"
      // behavior as GET .../layout.
      res.json(ScriptDocumentSchema.parse({ pages: [] }));
    }
  })
);

scriptRouter.put(
  "/:id/script",
  requireProjectRole("letterer"),
  asyncHandler(async (req, res) => {
    const resolved = await scriptFileFor(req.params.id);
    if (!resolved) {
      res.status(404).json({ error: "volume_not_found" });
      return;
    }
    const parsed = ScriptDocumentSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "invalid_script", details: parsed.error.flatten() });
      return;
    }
    await fs.mkdir(path.dirname(resolved.file), { recursive: true });
    await fs.writeFile(resolved.file, JSON.stringify(parsed.data, null, 2), "utf-8");
    res.json({ ok: true });
  })
);
