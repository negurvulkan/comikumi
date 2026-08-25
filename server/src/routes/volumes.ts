import { Router } from "express";
import fs from "node:fs/promises";
import path from "node:path";
import { scanVolumes, listPages, type VolumeInfo } from "../lib/projectScanner.js";
import { readLanguages, readSettings } from "../lib/projectStore.js";
import { letteringFolderName } from "../lib/paths.js";
import { PageLayoutSchema } from "../../../shared/src/layoutSchema.js";
import type { LanguageDef } from "../../../shared/src/languages.js";
import { asyncHandler } from "../lib/asyncHandler.js";

export const volumesRouter = Router();

/** Reads every saved lettering JSON of a volume (same directory-listing approach as
 * layout.ts's /:id/reports) and tallies panel/bubble counts — used to show per-volume
 * and (summed client-side) whole-project statistics on the volume overview, without a
 * separate endpoint duplicating this file-reading logic. Corrupt/foreign JSON is
 * silently skipped, same tolerance as /:id/reports. */
async function statsFor(
  volume: VolumeInfo,
  letteringSuffix: string,
  languages: LanguageDef[]
): Promise<{
  pageCount: number;
  panelCount: number;
  bubbleCount: number;
  bubbleCountByLanguage: Record<string, number>;
  firstPage: string | null;
}> {
  const pages = await listPages(volume);
  const dir = path.join(volume.parentDir, letteringFolderName(volume.bookFolderName, letteringSuffix));
  let files: string[] = [];
  try {
    files = (await fs.readdir(dir)).filter((f) => f.endsWith(".json"));
  } catch {
    files = [];
  }

  let panelCount = 0;
  let bubbleCount = 0;
  const bubbleCountByLanguage: Record<string, number> = Object.fromEntries(languages.map((l) => [l.code, 0]));
  for (const file of files) {
    try {
      const raw = await fs.readFile(path.join(dir, file), "utf-8");
      const layout = PageLayoutSchema.parse(JSON.parse(raw));
      panelCount += layout.panels.length;
      bubbleCount += layout.bubbles.length;
      for (const bubble of layout.bubbles) {
        for (const lang of languages) {
          if ((bubble.text[lang.code] ?? "").trim()) {
            bubbleCountByLanguage[lang.code] = (bubbleCountByLanguage[lang.code] ?? 0) + 1;
          }
        }
      }
    } catch {
      // Corrupt/foreign JSON in the folder — skip it, same as /:id/reports.
    }
  }

  return { pageCount: pages.length, panelCount, bubbleCount, bubbleCountByLanguage, firstPage: pages[0]?.page ?? null };
}

volumesRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const ctx = req.activeProject;
    const [volumes, languages, settings] = await Promise.all([scanVolumes(ctx), readLanguages(ctx), readSettings(ctx)]);
    const results = await Promise.all(
      volumes.map(async (v) => ({
        id: v.id,
        bookFolderName: v.bookFolderName,
        existingLanguageFolders: v.existingLanguageFolders,
        languages,
        ...(await statsFor(v, settings.letteringSuffix, languages)),
      }))
    );
    res.json(results);
  })
);
