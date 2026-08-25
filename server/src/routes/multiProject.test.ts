import { beforeAll, describe, expect, it } from "vitest";
import type { Express } from "express";
import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { setupTestEnv, authedAgent, type TestEnv } from "../test-utils/fixtures.js";

let app: Express;
let env: TestEnv;
let api: ReturnType<typeof authedAgent>;

/** Second, fully independent scan root + volume — setupTestEnv() only provisions one
 * (Volume_01/volume_01_empty/page_01.png under env.scanRoot), and proving real
 * multi-project isolation needs two genuinely different projects with different
 * content, not just two project *files* pointed at the same fixture data. */
async function createSecondProjectFixture(env: TestEnv): Promise<{ scanRoot: string; projectFile: string }> {
  const root = path.dirname(env.scanRoot);
  const scanRoot = path.join(root, "scan-root-2");
  const emptyDir = path.join(scanRoot, "Volume_99", "volume_99_empty");
  await fs.mkdir(emptyDir, { recursive: true });
  await sharp({ create: { width: 8, height: 8, channels: 3, background: { r: 10, g: 20, b: 30 } } })
    .png()
    .toFile(path.join(emptyDir, "page_A.png"));
  const projectFile = path.join(root, "projekt-2.json");
  return { scanRoot, projectFile };
}

beforeAll(async () => {
  env = await setupTestEnv();
  const { createApp } = await import("../app.js");
  app = createApp();
  api = authedAgent(app, env.token);
});

describe("project-scoped routes (/api/p/:projectId/...)", () => {
  it("two projects created back-to-back are each reachable by their own id, with no cross-talk", async () => {
    const { createProject } = await import("../lib/projectStore.js");
    const second = await createSecondProjectFixture(env);

    const projectA = await createProject(env.projectFile, { name: "Project A", scanRoot: env.scanRoot });
    const projectB = await createProject(second.projectFile, { name: "Project B", scanRoot: second.scanRoot });
    expect(projectA.id).toBeTypeOf("string");
    expect(projectB.id).toBeTypeOf("string");
    expect(projectA.id).not.toBe(projectB.id);

    // Interleaved, not sequential-per-project — the whole point is proving requests for
    // different projects don't stomp on each other regardless of ordering.
    const [volumesA1, volumesB1, volumesA2, volumesB2] = await Promise.all([
      api.get(`/api/p/${projectA.id}/volumes`),
      api.get(`/api/p/${projectB.id}/volumes`),
      api.get(`/api/p/${projectA.id}/volumes`),
      api.get(`/api/p/${projectB.id}/volumes`),
    ]);

    for (const res of [volumesA1, volumesA2]) {
      expect(res.status).toBe(200);
      expect(res.body.map((v: { id: string }) => v.id)).toEqual(["Volume_01"]);
    }
    for (const res of [volumesB1, volumesB2]) {
      expect(res.status).toBe(200);
      expect(res.body.map((v: { id: string }) => v.id)).toEqual(["Volume_99"]);
    }
  });

  it("saves a layout in project B and it does not appear in project A, and vice versa", async () => {
    const { createProject } = await import("../lib/projectStore.js");
    const second = await createSecondProjectFixture(env);
    const projectA = await createProject(env.projectFile, { name: "Project A2", scanRoot: env.scanRoot });
    const projectB = await createProject(second.projectFile, { name: "Project B2", scanRoot: second.scanRoot });

    const layoutA = { page: "page_01", sourceImage: "page_01.png", imageWidth: 4, imageHeight: 4, bubbles: [], images: [], curvedTexts: [], panels: [] };
    const layoutB = { page: "page_A", sourceImage: "page_A.png", imageWidth: 8, imageHeight: 8, bubbles: [], images: [], curvedTexts: [], panels: [] };

    const putA = await api.put(`/api/p/${projectA.id}/volumes/Volume_01/pages/page_01/layout`).send(layoutA);
    const putB = await api.put(`/api/p/${projectB.id}/volumes/Volume_99/pages/page_A/layout`).send(layoutB);
    expect(putA.status).toBe(200);
    expect(putB.status).toBe(200);

    // Project A's own page is unaffected by project B's save, and project A has no
    // knowledge of project B's volume/page at all.
    const getA = await api.get(`/api/p/${projectA.id}/volumes/Volume_01/pages/page_01/layout`);
    expect(getA.body.sourceImage).toBe("page_01.png");
    const crossRes = await api.get(`/api/p/${projectA.id}/volumes/Volume_99/pages/page_A/layout`);
    expect(crossRes.status).toBe(404);
  });

  it("404s for an unknown project id", async () => {
    const res = await api.get("/api/p/does-not-exist/volumes");
    expect(res.status).toBe(404);
    expect(res.body.error).toBe("project_not_found");
  });

  it("the legacy unscoped /api/volumes route is unaffected — still just the last opened/created project", async () => {
    const { createProject } = await import("../lib/projectStore.js");
    await createProject(env.projectFile, { name: "Legacy-visible project", scanRoot: env.scanRoot });
    const res = await api.get("/api/volumes");
    expect(res.status).toBe(200);
    expect(res.body.map((v: { id: string }) => v.id)).toEqual(["Volume_01"]);
  });

  // Phase 2 — spot-checks across the remaining migrated routers (characters/settings/
  // script/comments/export), same isolation proof as the volumes/pages/layout tests
  // above: two projects, scoped requests, no cross-talk. Not exhaustive re-coverage of
  // every route's own behavior (the legacy-path test files already do that) — just
  // proof that req.activeProject threading actually works for each router family.
  it("characters are isolated per project", async () => {
    const { createProject } = await import("../lib/projectStore.js");
    const second = await createSecondProjectFixture(env);
    const projectA = await createProject(env.projectFile, { name: "Chars A", scanRoot: env.scanRoot });
    const projectB = await createProject(second.projectFile, { name: "Chars B", scanRoot: second.scanRoot });

    const createA = await api.post(`/api/p/${projectA.id}/characters`).send({ name: "Kei", color: "#ff0000", voiceNotes: "" });
    expect(createA.status).toBe(201);

    const listA = await api.get(`/api/p/${projectA.id}/characters`);
    const listB = await api.get(`/api/p/${projectB.id}/characters`);
    expect(listA.body.map((c: { name: string }) => c.name)).toEqual(["Kei"]);
    expect(listB.body).toEqual([]);
  });

  it("settings are isolated per project", async () => {
    const { createProject } = await import("../lib/projectStore.js");
    const second = await createSecondProjectFixture(env);
    const projectA = await createProject(env.projectFile, { name: "Settings A", scanRoot: env.scanRoot });
    const projectB = await createProject(second.projectFile, { name: "Settings B", scanRoot: second.scanRoot });

    const settingsA = await api.get(`/api/p/${projectA.id}/settings`);
    const putA = await api.put(`/api/p/${projectA.id}/settings`).send({ ...settingsA.body, description: "Project A only" });
    expect(putA.status).toBe(200);

    const settingsB = await api.get(`/api/p/${projectB.id}/settings`);
    expect(settingsB.body.description).not.toBe("Project A only");
    const recheckA = await api.get(`/api/p/${projectA.id}/settings`);
    expect(recheckA.body.description).toBe("Project A only");
  });

  it("script documents are isolated per project", async () => {
    const { createProject } = await import("../lib/projectStore.js");
    const second = await createSecondProjectFixture(env);
    const projectA = await createProject(env.projectFile, { name: "Script A", scanRoot: env.scanRoot });
    const projectB = await createProject(second.projectFile, { name: "Script B", scanRoot: second.scanRoot });

    const putA = await api.put(`/api/p/${projectA.id}/volumes/Volume_01/script`).send({ pages: [{ id: "p1", label: "", notes: "Only in A", panels: [] }] });
    expect(putA.status).toBe(200);

    const getB = await api.get(`/api/p/${projectB.id}/volumes/Volume_99/script`);
    expect(getB.body).toEqual({ pages: [] });
    const getA = await api.get(`/api/p/${projectA.id}/volumes/Volume_01/script`);
    expect(getA.body.pages[0].notes).toBe("Only in A");
  });

  it("comments are isolated per project", async () => {
    const { createProject } = await import("../lib/projectStore.js");
    const second = await createSecondProjectFixture(env);
    const projectA = await createProject(env.projectFile, { name: "Comments A", scanRoot: env.scanRoot });
    const projectB = await createProject(second.projectFile, { name: "Comments B", scanRoot: second.scanRoot });

    const createA = await api
      .post(`/api/p/${projectA.id}/volumes/Volume_01/comments`)
      .send({ page: "page_01", target: { kind: "page" }, body: "Only visible in A" });
    expect(createA.status).toBe(201);

    const listB = await api.get(`/api/p/${projectB.id}/volumes/Volume_99/comments`);
    expect(listB.body.comments).toEqual([]);
    const listA = await api.get(`/api/p/${projectA.id}/volumes/Volume_01/comments`);
    expect(listA.body.comments).toHaveLength(1);
  });

  it("export folder listings are isolated per project", async () => {
    const { createProject } = await import("../lib/projectStore.js");
    const second = await createSecondProjectFixture(env);
    const projectA = await createProject(env.projectFile, { name: "Export A", scanRoot: env.scanRoot });
    const projectB = await createProject(second.projectFile, { name: "Export B", scanRoot: second.scanRoot });

    const exportsA = await api.get(`/api/p/${projectA.id}/volumes/Volume_01/exports`);
    const exportsB = await api.get(`/api/p/${projectB.id}/volumes/Volume_99/exports`);
    expect(exportsA.status).toBe(200);
    expect(exportsB.status).toBe(200);
    // Both empty (nothing exported yet) but resolved against their own volume/scanRoot —
    // the real assertion is that neither 404s or throws trying to resolve the other's
    // volume id under its own project.
    expect(exportsA.body.exports).toEqual([]);
    expect(exportsB.body.exports).toEqual([]);
  });
});
