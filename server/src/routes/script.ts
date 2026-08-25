import { Router } from "express";
import fs from "node:fs/promises";
import path from "node:path";
import { ScriptDocumentSchema } from "../../../shared/src/script.js";
import { findVolume } from "../lib/projectScanner.js";
import { scriptFileName } from "../lib/paths.js";
import { readSettings, type ActiveProject } from "../lib/projectStore.js";
import { asyncHandler } from "../lib/asyncHandler.js";
import { requireProjectRole } from "../lib/auth.js";
import { computeEtag, NEW_DOCUMENT_ETAG } from "../lib/etag.js";
import { withFileLock } from "../lib/fileLock.js";

export const scriptRouter = Router();

async function scriptFileFor(volumeId: string, ctx?: ActiveProject) {
  const volume = await findVolume(volumeId, ctx);
  if (!volume) return undefined;
  const settings = await readSettings(ctx);
  return { volume, file: path.join(volume.parentDir, scriptFileName(volume.bookFolderName, settings.scriptSuffix)) };
}

scriptRouter.get(
  "/:id/script",
  asyncHandler(async (req, res) => {
    const resolved = await scriptFileFor(req.params.id, req.activeProject);
    if (!resolved) {
      res.status(404).json({ error: "volume_not_found" });
      return;
    }
    try {
      const raw = await fs.readFile(resolved.file, "utf-8");
      res.setHeader("ETag", computeEtag(raw));
      res.json(ScriptDocumentSchema.parse(JSON.parse(raw)));
    } catch {
      // No script saved yet -> an empty document, same "fall back to empty"
      // behavior as GET .../layout.
      res.setHeader("ETag", NEW_DOCUMENT_ETAG);
      res.json(ScriptDocumentSchema.parse({ pages: [] }));
    }
  })
);

scriptRouter.put(
  "/:id/script",
  requireProjectRole("letterer"),
  asyncHandler(async (req, res) => {
    const resolved = await scriptFileFor(req.params.id, req.activeProject);
    if (!resolved) {
      res.status(404).json({ error: "volume_not_found" });
      return;
    }
    const parsed = ScriptDocumentSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "invalid_script", details: parsed.error.flatten() });
      return;
    }
    const ifMatch = req.header("If-Match");
    const { file } = resolved;

    await withFileLock(file, async () => {
      let currentRaw: string | null = null;
      try {
        currentRaw = await fs.readFile(file, "utf-8");
      } catch {
        // No existing saved script yet.
      }
      const currentEtag = currentRaw ? computeEtag(currentRaw) : NEW_DOCUMENT_ETAG;
      if (ifMatch && ifMatch !== currentEtag) {
        const currentScript = currentRaw ? ScriptDocumentSchema.parse(JSON.parse(currentRaw)) : null;
        res.status(409).json({ error: "script_conflict", currentScript });
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
