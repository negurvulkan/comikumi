import { beforeAll, describe, expect, it } from "vitest";
import type { Express } from "express";
import { setupTestEnv, authedAgent, type TestEnv } from "../test-utils/fixtures.js";

let app: Express;
let env: TestEnv;
let api: ReturnType<typeof authedAgent>;

beforeAll(async () => {
  env = await setupTestEnv();
  const { createApp } = await import("../app.js");
  app = createApp();
  api = authedAgent(app, env.token);
});

const TINY_SVG = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><circle cx="5" cy="5" r="4"/></svg>');

describe("bubble-svgs folder support (same createAssetRouter factory as images)", () => {
  it("lists a folder-scoped upload only within that folder, not at root", async () => {
    const upload = await api.post("/api/bubble-svgs").field("folder", "speech").attach("svg", TINY_SVG, "round.svg");
    expect(upload.status).toBe(200);
    expect(upload.body).toMatchObject({ ok: true, fileName: "round.svg", folder: "speech" });

    const nested = await api.get("/api/bubble-svgs?folder=speech");
    expect(nested.body.files.map((f: { fileName: string }) => f.fileName)).toContain("round.svg");

    const root = await api.get("/api/bubble-svgs");
    expect(root.body.subfolders).toContain("speech");
    expect(root.body.files.map((f: { fileName: string }) => f.fileName)).not.toContain("round.svg");
  });
});
