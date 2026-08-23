import fs from "node:fs/promises";
import path from "node:path";

/** Sits directly under scanRoot (sibling of every volume folder) so it survives on the
 * same disk/network share as the scanned pages themselves — a manual restore is just
 * moving a file back out, no separate backup location to remember. */
export const TRASH_DIR_NAME = "_trash";

/**
 * Moves a file into scanRoot's trash folder instead of permanently deleting it —
 * preserves its original filename (prefixed with a deletion timestamp for readability
 * and to disambiguate repeated deletions of same-named files) inside a subfolder that
 * mirrors the file's original location relative to scanRoot, so a system administrator
 * can restore it by moving it back to that same relative path and stripping the
 * timestamp prefix. Returns the new absolute path.
 */
export async function moveToTrash(absolutePath: string, scanRoot: string): Promise<string> {
  const relDir = path.relative(scanRoot, path.dirname(absolutePath));
  const trashSubdir = path.join(scanRoot, TRASH_DIR_NAME, relDir);
  await fs.mkdir(trashSubdir, { recursive: true });
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const trashPath = path.join(trashSubdir, `${timestamp}__${path.basename(absolutePath)}`);
  await fs.rename(absolutePath, trashPath);
  // Reset mtime to the moment of deletion (fs.rename keeps the original file's mtime,
  // which could be years old) — purgeExpiredTrash() below counts retention from this.
  const now = new Date();
  await fs.utimes(trashPath, now, now);
  return trashPath;
}

async function walkFiles(dir: string, results: string[]): Promise<void> {
  let entries: import("node:fs").Dirent[];
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) await walkFiles(full, results);
    else if (entry.isFile()) results.push(full);
  }
}

/** Removes every trashed file older than `retentionDays` (based on the deletion-time
 * mtime moveToTrash() sets), then prunes any subdirectory left empty by that — call
 * periodically (see index.ts) so trashed files eventually free disk space without ever
 * being destructive at the moment of the user's original delete action. Returns how
 * many files were purged. */
export async function purgeExpiredTrash(scanRoot: string, retentionDays: number): Promise<number> {
  const trashDir = path.join(scanRoot, TRASH_DIR_NAME);
  const files: string[] = [];
  await walkFiles(trashDir, files);
  const cutoffMs = Date.now() - retentionDays * 24 * 60 * 60 * 1000;

  let purged = 0;
  const touchedDirs = new Set<string>();
  for (const file of files) {
    const stat = await fs.stat(file).catch(() => null);
    if (stat && stat.mtimeMs < cutoffMs) {
      await fs.unlink(file).catch(() => {});
      touchedDirs.add(path.dirname(file));
      purged++;
    }
  }
  // Prune now-empty directories, deepest first, so a chain of nested empty folders
  // collapses in one pass instead of leaving intermediate empty dirs behind.
  for (const dir of Array.from(touchedDirs).sort((a, b) => b.length - a.length)) {
    await fs.rmdir(dir).catch(() => {});
  }
  return purged;
}
