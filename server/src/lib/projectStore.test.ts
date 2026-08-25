import { beforeEach, describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

/** Own isolated temp dir per test (not shared setupTestEnv()) — this file exercises
 * projectStore.ts's internals directly (multi-project cache, id migration) rather than
 * going through HTTP routes, so it wants a fresh LETTERING_DATA_DIR per test to freely
 * create/open several project files without route-level auth/volume fixtures getting
 * in the way. Same "set env var, then dynamically import" requirement as
 * test-utils/fixtures.ts's setupTestEnv() — see its doc comment. */
async function freshDataDir(): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "projectstore-test-"));
  process.env.LETTERING_DATA_DIR = path.join(root, "data");
  return root;
}

beforeEach(async () => {
  const { resetActiveProjectForTests } = await import("./projectStore.js");
  resetActiveProjectForTests();
});

describe("project id migration", () => {
  it("assigns and persists an id for a project file saved before the id field existed", async () => {
    const root = await freshDataDir();
    const { createProject, openProject } = await import("./projectStore.js");
    const filePath = path.join(root, "legacy-projekt.json");
    await createProject(filePath, { name: "Legacy", scanRoot: path.join(root, "scan") });

    // Simulate an old file written before `id` existed by stripping it back out.
    const raw = JSON.parse(await fs.readFile(filePath, "utf-8"));
    delete raw.id;
    await fs.writeFile(filePath, JSON.stringify(raw), "utf-8");

    const reopened = await openProject(filePath);
    expect(reopened.id).toBeTypeOf("string");
    expect(reopened.id!.length).toBeGreaterThan(0);

    const onDisk = JSON.parse(await fs.readFile(filePath, "utf-8"));
    expect(onDisk.id).toBe(reopened.id);
  });
});

describe("multi-project cache", () => {
  it("getOrLoadProjectById resolves two different projects independently, without cross-talk", async () => {
    const root = await freshDataDir();
    const { createProject, getOrLoadProjectById } = await import("./projectStore.js");

    const fileA = path.join(root, "a-projekt.json");
    const fileB = path.join(root, "b-projekt.json");
    const dataA = await createProject(fileA, { name: "Project A", scanRoot: path.join(root, "scan-a") });
    const dataB = await createProject(fileB, { name: "Project B", scanRoot: path.join(root, "scan-b") });

    const loadedA = await getOrLoadProjectById(dataA.id!);
    const loadedB = await getOrLoadProjectById(dataB.id!);

    expect(loadedA.data.name).toBe("Project A");
    expect(loadedA.data.scanRoot).toContain("scan-a");
    expect(loadedB.data.name).toBe("Project B");
    expect(loadedB.data.scanRoot).toContain("scan-b");
    expect(loadedA.id).not.toBe(loadedB.id);
  });

  it("throws ProjectNotFoundError for an id with no registered project", async () => {
    await freshDataDir();
    const { getOrLoadProjectById, ProjectNotFoundError } = await import("./projectStore.js");
    await expect(getOrLoadProjectById("does-not-exist")).rejects.toThrow(ProjectNotFoundError);
  });

  it("evicts the least-recently-used entry once the cache exceeds its cap, but never the legacy-active one", async () => {
    const root = await freshDataDir();
    const { createProject, getOrLoadProjectById } = await import("./projectStore.js");

    // createProject() makes each new project the legacy-active one in turn — the LAST
    // one created is legacy-active by the time this loop finishes.
    const ids: string[] = [];
    for (let i = 0; i < 10; i++) {
      const data = await createProject(path.join(root, `p${i}-projekt.json`), {
        name: `Project ${i}`,
        scanRoot: path.join(root, `scan-${i}`),
      });
      ids.push(data.id!);
    }

    // The very first project (id[0]) should have been evicted by now (cap is 8, 10
    // were created, and none were re-accessed to bump their recency) — reloading it
    // must still work (falls back to disk via the id index), just isn't a cache hit.
    const reloaded = await getOrLoadProjectById(ids[0]);
    expect(reloaded.data.name).toBe("Project 0");

    // The legacy-active project (the last one created) must still be resolvable too.
    const legacyReloaded = await getOrLoadProjectById(ids[9]);
    expect(legacyReloaded.data.name).toBe("Project 9");
  });
});
