import fs from "node:fs/promises";
import path from "node:path";
import { readSettings } from "./projectStore.js";

export interface VolumeInfo {
  /** Stable id derived from the path relative to 04_Comic_Production, e.g. "Volume_01/volume_01" */
  id: string;
  /** Human readable name, e.g. "volume_01" */
  bookFolderName: string;
  /** Absolute path to the directory that contains "<book>_empty" and the language folders */
  parentDir: string;
  /** Absolute path to the "<book>_empty" folder */
  emptyDir: string;
  /** Language folder suffixes that already exist next to "_empty", e.g. ["german", "japanese"] */
  existingLanguageFolders: string[];
}

const IGNORED_DIR_NAMES = new Set(["node_modules", ".git"]);

async function findEmptyDirs(dir: string, depth: number, emptySuffix: string, results: string[]): Promise<void> {
  if (depth < 0) return;
  let entries: import("node:fs").Dirent[];
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (!entry.isDirectory() || IGNORED_DIR_NAMES.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.name.endsWith(emptySuffix)) {
      results.push(full);
    } else {
      await findEmptyDirs(full, depth - 1, emptySuffix, results);
    }
  }
}

/** Parameterized volume count for callers with no active project yet (the new-project
 * wizard) — same recursive search as scanVolumes(), just without the readSettings()
 * coupling. Returns 0 for a scanRoot that doesn't exist or can't be read, same silent
 * tolerance as findEmptyDirs() itself. */
export async function countVolumesUnder(scanRoot: string, emptySuffix: string): Promise<number> {
  const results: string[] = [];
  await findEmptyDirs(scanRoot, 5, emptySuffix, results);
  return results.length;
}

export async function scanVolumes(): Promise<VolumeInfo[]> {
  const settings = await readSettings();
  const emptyDirs: string[] = [];
  await findEmptyDirs(settings.scanRoot, 5, settings.emptySuffix, emptyDirs);

  const volumes: VolumeInfo[] = [];
  for (const emptyDir of emptyDirs) {
    const parentDir = path.dirname(emptyDir);
    const bookFolderName = path.basename(emptyDir).slice(0, -settings.emptySuffix.length);
    const relId = path.relative(settings.scanRoot, parentDir).split(path.sep).join("/");

    const siblingEntries = await fs.readdir(parentDir, { withFileTypes: true });
    const existingLanguageFolders = siblingEntries
      .filter(
        (e) =>
          e.isDirectory() &&
          e.name.startsWith(`${bookFolderName}_`) &&
          !e.name.endsWith(settings.emptySuffix) &&
          !e.name.endsWith(settings.letteringSuffix)
      )
      .map((e) => e.name.slice(bookFolderName.length + 1));

    volumes.push({
      id: relId,
      bookFolderName,
      parentDir,
      emptyDir,
      existingLanguageFolders,
    });
  }
  return volumes;
}

export async function findVolume(id: string): Promise<VolumeInfo | undefined> {
  const volumes = await scanVolumes();
  return volumes.find((v) => v.id === id);
}

export interface PageInfo {
  /** "page_01" (filename without extension) */
  page: string;
  fileName: string;
  absolutePath: string;
}

export async function listPages(volume: VolumeInfo): Promise<PageInfo[]> {
  let entries: import("node:fs").Dirent[];
  try {
    entries = await fs.readdir(volume.emptyDir, { withFileTypes: true });
  } catch {
    return [];
  }
  const imageExt = new Set([".png", ".jpg", ".jpeg", ".webp"]);
  return entries
    .filter((e) => e.isFile() && imageExt.has(path.extname(e.name).toLowerCase()))
    .map((e) => ({
      page: path.basename(e.name, path.extname(e.name)),
      fileName: e.name,
      absolutePath: path.join(volume.emptyDir, e.name),
    }))
    .sort((a, b) => a.page.localeCompare(b.page, undefined, { numeric: true }));
}
