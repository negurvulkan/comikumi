import { beforeAll, describe, expect, it } from "vitest";
import type { Express } from "express";
import { setupTestEnv, authedAgent, type TestEnv } from "./test-utils/fixtures.js";

let app: Express;
let env: TestEnv;
let api: ReturnType<typeof authedAgent>;

beforeAll(async () => {
  // Deliberately does NOT call createProject/openProject — this file tests the
  // "no active project" path, so setupTestEnv's fresh, empty temp data dir (no
  // app-state.json, no legacy settings/languages.json) must leave `active` null.
  // setupTestEnv() DOES create a system-admin test account (independent of any
  // project) — authenticate as that account so this test exercises the
  // no-active-project path itself, not an unrelated 401.
  env = await setupTestEnv();
  const { createApp } = await import("./app.js");
  app = createApp();
  api = authedAgent(app, env.token);
});

describe("global error middleware", () => {
  it("converts NoActiveProjectError into a 409 with a stable error code", async () => {
    const res = await api.get("/api/characters");
    expect(res.status).toBe(409);
    expect(res.body).toEqual({ error: "no_active_project" });
  });

  it("GET /api/health still responds ok with a null scanRoot when no project is open", async () => {
    const res = await api.get("/api/health");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true, scanRoot: null });
  });

  it("a 404 from an unknown route doesn't trip the error middleware into a 500", async () => {
    const res = await api.get("/api/does-not-exist");
    expect(res.status).toBe(404);
  });
});
