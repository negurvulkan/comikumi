import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import AdmZip from "adm-zip";
import { ZipArchive } from "archiver";
import { ProjectFileSchema, type ProjectFile } from "../../../shared/src/project.js";
import type { ActiveProject } from "./projectStore.js";

/** Bumped whenever the bundle layout (manifest shape / entry names) changes in a way
 * that would break importProjectPackage() on an older export — lets a future version
 * reject or migrate a package it can't read instead of silently misinterpreting it. */
const PACKAGE_FORMAT_VERSION = 1;

const MANIFEST_ENTRY_NAME = "manifest.json";
const SCAN_ENTRY_NAME = "scan";
const ASSETS_ENTRY_NAME = "assets";

/** What actually travels inside the zip alongside the scan/assets/cover folders — the
 * project's own data with every machine-specific absolute path stripped out, since
 * those are meaningless on whatever machine/folder the package gets unpacked into
 * (see shared/src/settings.ts's scanRoot/assetsDir/thumbnailsDir/coverImagePath). */
interface PackageManifest {
  formatVersion: number;
  project: ProjectFile;
  hasAssetsDir: boolean;
  /** Entry name of the cover image inside the zip (e.g. "cover.png"), or null if the
   * project had no coverImagePath configured, or it pointed at a file that no longer
   * exists on disk (skipped rather than failing the whole export). */
  coverImageFileName: string | null;
}

/** Packs the given project — its JSON data, the full scanRoot page-scan tree, its
 * optional assetsDir (project-specific fonts/images/bubble-svgs), and its optional
 * cover image — into a single self-contained zip at `destZipPath`, so it can be moved
 * to another machine or folder and reopened with importProjectPackage() without any
 * broken absolute-path references. Does not include thumbnailsDir (pure cache,
 * regenerated on demand) or the project's `_trash` folder under scanRoot. */
export async function exportProjectPackage(project: ActiveProject, destZipPath: string): Promise<void> {
  const { data } = project;
  const hasAssetsDir = !!data.assetsDir;

  let coverImageFileName: string | null = null;
  if (data.coverImagePath) {
    try {
      await fsp.access(data.coverImagePath);
      coverImageFileName = `cover${path.extname(data.coverImagePath)}`;
    } catch {
      coverImageFileName = null; // referenced cover file is already missing — skip it
    }
  }

  const manifest: PackageManifest = {
    formatVersion: PACKAGE_FORMAT_VERSION,
    project: { ...data, scanRoot: "", assetsDir: "", thumbnailsDir: "", coverImagePath: "" },
    hasAssetsDir,
    coverImageFileName,
  };

  await fsp.mkdir(path.dirname(destZipPath), { recursive: true });
  await new Promise<void>((resolve, reject) => {
    const output = fs.createWriteStream(destZipPath);
    const archive = new ZipArchive({ zlib: { level: 9 } });
    output.on("close", () => resolve());
    output.on("error", reject);
    archive.on("error", reject);
    archive.pipe(output);
    archive.append(JSON.stringify(manifest, null, 2), { name: MANIFEST_ENTRY_NAME });
    archive.directory(data.scanRoot, SCAN_ENTRY_NAME);
    if (hasAssetsDir) archive.directory(data.assetsDir, ASSETS_ENTRY_NAME);
    if (coverImageFileName) archive.file(data.coverImagePath, { name: coverImageFileName });
    void archive.finalize();
  });
}

/** Unpacks a package written by exportProjectPackage() into `destDir` and rewrites
 * scanRoot/assetsDir/coverImagePath to point at the newly-extracted folders — the
 * counterpart that makes an exported bundle actually portable. Assigns a fresh project
 * id (this is a new, independent project file on disk, distinct from wherever it was
 * exported from) and resets thumbnailsDir back to "not configured" (falls back to a
 * "thumbnails" folder next to the new project file, same as any freshly created
 * project). Refuses to unpack into a non-empty destDir, so an existing folder's
 * contents can never be silently overwritten. Returns the path to the written project
 * file — the caller is expected to open/activate it afterwards. */
export async function importProjectPackage(
  zipFilePath: string,
  destDir: string,
  opts: { createDestDirIfMissing?: boolean } = {}
): Promise<{ filePath: string }> {
  if (opts.createDestDirIfMissing) {
    await fsp.mkdir(destDir, { recursive: true });
  }
  let existing: string[];
  try {
    existing = await fsp.readdir(destDir);
  } catch {
    throw new Error(`Zielordner existiert nicht: ${destDir}`);
  }
  if (existing.length > 0) {
    throw new Error("Zielordner ist nicht leer — bitte einen leeren oder neuen Ordner wählen.");
  }

  const zip = new AdmZip(zipFilePath);
  zip.extractAllTo(destDir, false);

  const manifestPath = path.join(destDir, MANIFEST_ENTRY_NAME);
  let manifest: PackageManifest;
  try {
    manifest = JSON.parse(await fsp.readFile(manifestPath, "utf-8")) as PackageManifest;
  } catch {
    throw new Error("Ungültiges Projektpaket: manifest.json fehlt oder ist beschädigt.");
  }
  if (manifest.formatVersion > PACKAGE_FORMAT_VERSION) {
    throw new Error("Dieses Projektpaket wurde mit einer neueren Version erstellt und kann hier nicht importiert werden.");
  }

  const restored = ProjectFileSchema.parse({
    ...manifest.project,
    id: randomUUID(),
    scanRoot: path.join(destDir, SCAN_ENTRY_NAME),
    assetsDir: manifest.hasAssetsDir ? path.join(destDir, ASSETS_ENTRY_NAME) : "",
    thumbnailsDir: "",
    coverImagePath: manifest.coverImageFileName ? path.join(destDir, manifest.coverImageFileName) : "",
  });

  const filePath = path.join(destDir, "project.json");
  await fsp.writeFile(filePath, JSON.stringify(restored, null, 2), "utf-8");
  await fsp.rm(manifestPath, { force: true });
  return { filePath };
}
