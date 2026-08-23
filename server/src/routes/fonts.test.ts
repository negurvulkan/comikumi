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

// Regression guard: fonts.ts doesn't set `foldersEnabled` on createAssetRouter(), so
// GET /api/fonts must keep returning a flat array (not the {folder,subfolders,files}
// shape images/bubble-svgs now use) — a shared-factory change to the folder feature
// must never leak into fonts' response shape or add folder routes there.
describe("GET /api/fonts stays flat (foldersEnabled not set)", () => {
  it("returns a plain array, and folder query params have no effect", async () => {
    const buf = Buffer.from("not a real font, just bytes for upload plumbing");
    await api.post("/api/fonts").attach("font", buf, "Test.otf");

    const res = await api.get("/api/fonts");
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.some((f: { fileName: string }) => f.fileName === "Test.otf")).toBe(true);

    const withFolderQuery = await api.get("/api/fonts?folder=whatever");
    expect(Array.isArray(withFolderQuery.body)).toBe(true);
  });

  it("has no /folders or /move routes", async () => {
    const folders = await api.post("/api/fonts/folders").send({ folder: "x" });
    expect(folders.status).toBe(404);
    const move = await api.post("/api/fonts/move").send({ fileName: "a", fromFolder: "", toFolder: "b" });
    expect(move.status).toBe(404);
  });
});
