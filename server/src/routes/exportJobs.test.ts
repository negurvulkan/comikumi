import { beforeAll, describe, expect, it } from "vitest";
import type { Express } from "express";
import fs from "node:fs/promises";
import path from "node:path";
import { setupTestEnv, authedAgent, type TestEnv } from "../test-utils/fixtures.js";

let app: Express;
let env: TestEnv;
let api: ReturnType<typeof authedAgent>;

beforeAll(async () => {
  env = await setupTestEnv();
  const { createApp } = await import("../app.js");
  const { createProject } = await import("../lib/projectStore.js");
  app = createApp();
  api = authedAgent(app, env.token);
  await createProject(env.projectFile, { name: "Test Project", scanRoot: env.scanRoot });
});

const VOLUME_ID = "Volume_01";

/** Waits until the job reaches a terminal state ("done"/"failed"), polling the same
 * GET route a real client would — the job store is in-memory and the job runs
 * genuinely async (setImmediate-style, not awaited by startExportJob), so this can't
 * just be awaited directly. */
async function waitForJob(jobId: string, timeoutMs = 5000): Promise<{ status: string; completed: number; total: number; results: unknown[] }> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const res = await api.get(`/api/volumes/${VOLUME_ID}/export-jobs/${jobId}`);
    if (res.body.status !== "running") return res.body;
    if (Date.now() > deadline) throw new Error("job did not finish in time");
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
}

describe("POST /:id/export-jobs", () => {
  // Order matters within this describe block: this runs BEFORE the "renders every
  // requested page" test below saves a layout for page_01, so page_01 genuinely has no
  // saved lettering JSON yet here — a real source page (listPages finds it, so it's
  // not "page_not_found"), just never edited/saved in the app.
  it("marks a page with no saved layout as skipped instead of failing the whole job", async () => {
    const startRes = await api.post(`/api/volumes/${VOLUME_ID}/export-jobs`).send({
      format: "psd",
      pages: ["page_01"],
      languageCode: "de",
      folderSuffix: "german",
    });
    const job = await waitForJob(startRes.body.jobId);
    expect(job.status).toBe("done");
    expect(job.results).toEqual([{ page: "page_01", status: "skipped", message: "no_saved_layout" }]);
  });

  it("404s an unknown page as a whole-job page_not_found result", async () => {
    const startRes = await api.post(`/api/volumes/${VOLUME_ID}/export-jobs`).send({
      format: "psd",
      pages: ["page_never_existed"],
      languageCode: "de",
      folderSuffix: "german",
    });
    const job = await waitForJob(startRes.body.jobId);
    expect(job.status).toBe("done");
    expect(job.results).toEqual([{ page: "page_never_existed", status: "skipped", message: "page_not_found" }]);
  });

  it("renders every requested page in the background and reports per-page results", async () => {
    const { createEmptyLayout } = await import("../../../shared/src/layoutSchema.js");
    const layout = createEmptyLayout("page_01", "page_01.png", 4, 4);
    await api.put(`/api/volumes/${VOLUME_ID}/pages/page_01/layout`).send(layout);

    const startRes = await api.post(`/api/volumes/${VOLUME_ID}/export-jobs`).send({
      format: "vector-pdf",
      pages: ["page_01"],
      languageCode: "de",
      folderSuffix: "german",
      pdfxVersion: "x4",
    });
    expect(startRes.status).toBe(200);
    expect(startRes.body.jobId).toBeTruthy();
    expect(startRes.body.total).toBe(1);

    const job = await waitForJob(startRes.body.jobId);
    expect(job.status).toBe("done");
    expect(job.completed).toBe(1);
    expect(job.results).toEqual([{ page: "page_01", status: "done" }]);

    const writtenPath = path.join(env.scanRoot, "Volume_01", "volume_01_german", "page_01.pdf");
    const written = await fs.readFile(writtenPath);
    expect(written.subarray(0, 5).toString("latin1")).toBe("%PDF-");
  });

  it("rejects a request missing required fields", async () => {
    const res = await api.post(`/api/volumes/${VOLUME_ID}/export-jobs`).send({ format: "vector-pdf" });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("export_job_fields_required");
  });

  it("404s for an unknown volume", async () => {
    const res = await api.post(`/api/volumes/does-not-exist/export-jobs`).send({
      format: "vector-pdf",
      pages: ["page_01"],
      languageCode: "de",
      folderSuffix: "german",
    });
    expect(res.status).toBe(404);
  });
});

describe("GET /:id/export-jobs/:jobId", () => {
  it("404s for an unknown job id", async () => {
    const res = await api.get(`/api/volumes/${VOLUME_ID}/export-jobs/does-not-exist`);
    expect(res.status).toBe(404);
    expect(res.body.error).toBe("export_job_not_found");
  });

  it("404s when the job id exists but belongs to a different volume", async () => {
    const startRes = await api.post(`/api/volumes/${VOLUME_ID}/export-jobs`).send({
      format: "vector-pdf",
      pages: ["page_01"],
      languageCode: "de",
      folderSuffix: "german",
    });
    await waitForJob(startRes.body.jobId);
    const res = await api.get(`/api/volumes/some-other-volume/export-jobs/${startRes.body.jobId}`);
    expect(res.status).toBe(404);
  });
});
