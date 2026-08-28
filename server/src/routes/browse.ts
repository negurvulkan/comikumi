import { Router } from "express";
import fs from "node:fs/promises";
import path from "node:path";
import { asyncHandler } from "../lib/asyncHandler.js";

export const browseRouter = Router();

const IMAGE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".webp", ".gif", ".svg", ".bmp"]);

interface BrowseEntry {
  name: string;
  path: string;
  isDirectory: boolean;
}

/** No path given -> list drive letters on Windows (there's no filesystem root to
 * read otherwise); everywhere else, "/" is the only root. */
async function listRoots(): Promise<BrowseEntry[]> {
  if (process.platform !== "win32") {
    return [{ name: "/", path: "/", isDirectory: true }];
  }
  const roots: BrowseEntry[] = [];
  for (let code = "A".charCodeAt(0); code <= "Z".charCodeAt(0); code++) {
    const letter = String.fromCharCode(code);
    const drivePath = `${letter}:\\`;
    try {
      await fs.access(drivePath);
      roots.push({ name: drivePath, path: drivePath, isDirectory: true });
    } catch {
      // drive doesn't exist — skip
    }
  }
  return roots;
}

browseRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const rawPath = typeof req.query.path === "string" ? req.query.path : "";
    const filter =
      req.query.filter === "json"
        ? "json"
        : req.query.filter === "image"
          ? "image"
          : req.query.filter === "zip"
            ? "zip"
            : "directories";

    if (!rawPath) {
      res.json({ path: null, parent: null, entries: await listRoots() });
      return;
    }

    let dirEntries: import("node:fs").Dirent[];
    try {
      dirEntries = await fs.readdir(rawPath, { withFileTypes: true });
    } catch (err) {
      res.status(400).json({ error: "folder_read_failed", params: { reason: (err as Error).message } });
      return;
    }

    const entries: BrowseEntry[] = dirEntries
      .filter(
        (e) =>
          e.isDirectory() ||
          (filter === "json" && e.isFile() && e.name.toLowerCase().endsWith(".json")) ||
          (filter === "image" && e.isFile() && IMAGE_EXTENSIONS.has(path.extname(e.name).toLowerCase())) ||
          (filter === "zip" && e.isFile() && e.name.toLowerCase().endsWith(".zip"))
      )
      .map((e) => ({ name: e.name, path: path.join(rawPath, e.name), isDirectory: e.isDirectory() }))
      .sort((a, b) => Number(b.isDirectory) - Number(a.isDirectory) || a.name.localeCompare(b.name));

    const parentPath = path.dirname(rawPath);
    // path.dirname("C:\\") === "C:\\" — going up from a drive root should surface
    // the drive-letter list, not loop back to the same directory forever.
    const parent = parentPath === rawPath ? null : parentPath;

    res.json({ path: rawPath, parent, entries });
  })
);
