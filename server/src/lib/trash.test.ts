import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { moveToTrash, purgeExpiredTrash, TRASH_DIR_NAME } from "./trash.js";

let scanRoot: string;

beforeEach(async () => {
  scanRoot = await fs.mkdtemp(path.join(os.tmpdir(), "trash-test-"));
});

afterEach(async () => {
  await fs.rm(scanRoot, { recursive: true, force: true });
});

describe("moveToTrash", () => {
  it("moves the file into _trash, mirroring its original relative folder, keeping the filename", async () => {
    const emptyDir = path.join(scanRoot, "Volume_01", "volume_01_empty");
    await fs.mkdir(emptyDir, { recursive: true });
    const source = path.join(emptyDir, "page_01.png");
    await fs.writeFile(source, "fake-image-bytes");

    const trashPath = await moveToTrash(source, scanRoot);

    await expect(fs.access(source)).rejects.toThrow();
    expect(trashPath).toContain(path.join(TRASH_DIR_NAME, "Volume_01", "volume_01_empty"));
    expect(path.basename(trashPath)).toMatch(/^.+__page_01\.png$/);
    expect(await fs.readFile(trashPath, "utf-8")).toBe("fake-image-bytes");
  });
});

describe("purgeExpiredTrash", () => {
  it("removes only files older than the retention period, and prunes dirs left empty", async () => {
    const oldSubdir = path.join(scanRoot, TRASH_DIR_NAME, "Volume_01", "volume_01_empty");
    await fs.mkdir(oldSubdir, { recursive: true });
    const oldFile = path.join(oldSubdir, "2000-01-01T00-00-00-000Z__page_old.png");
    await fs.writeFile(oldFile, "old");
    const veryOld = new Date(Date.now() - 40 * 24 * 60 * 60 * 1000);
    await fs.utimes(oldFile, veryOld, veryOld);

    const recentSubdir = path.join(scanRoot, TRASH_DIR_NAME, "Volume_02", "volume_02_empty");
    await fs.mkdir(recentSubdir, { recursive: true });
    const recentFile = path.join(recentSubdir, "recent__page_new.png");
    await fs.writeFile(recentFile, "recent");

    const purged = await purgeExpiredTrash(scanRoot, 30);

    expect(purged).toBe(1);
    await expect(fs.access(oldFile)).rejects.toThrow();
    await expect(fs.access(oldSubdir)).rejects.toThrow(); // pruned, now empty
    await expect(fs.access(recentFile)).resolves.toBeUndefined();
  });

  it("returns 0 and doesn't throw when there's no _trash folder yet", async () => {
    const purged = await purgeExpiredTrash(scanRoot, 30);
    expect(purged).toBe(0);
  });
});
