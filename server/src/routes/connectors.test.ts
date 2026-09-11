import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Express } from "express";
import request from "supertest";
import { setupTestEnv, authedAgent, type TestEnv } from "../test-utils/fixtures.js";

let app: Express;
let env: TestEnv;
let api: ReturnType<typeof authedAgent>;

const ORIGINAL_ENV = { ...process.env };

beforeAll(async () => {
  env = await setupTestEnv();
  const { createApp } = await import("../app.js");
  app = createApp();
  api = authedAgent(app, env.token);
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV, LETTERING_DATA_DIR: process.env.LETTERING_DATA_DIR };
});

describe("GET /api/connectors", () => {
  it("reports ai-manga as not configured when the env vars are unset", async () => {
    delete process.env.AI_MANGA_CLIENT_ID;
    delete process.env.AI_MANGA_REDIRECT_URI;
    const res = await api.get("/api/connectors");
    expect(res.status).toBe(200);
    expect(res.body).toContainEqual(expect.objectContaining({ id: "ai-manga", configured: false, connected: false }));
  });

  it("reports configured once the env vars are set", async () => {
    process.env.AI_MANGA_CLIENT_ID = "test-client";
    process.env.AI_MANGA_REDIRECT_URI = "http://localhost:3001/api/connectors/ai-manga/callback";
    const res = await api.get("/api/connectors");
    expect(res.body).toContainEqual(expect.objectContaining({ id: "ai-manga", configured: true }));
  });
});

describe("GET /api/connectors/:id/authorize", () => {
  it("404s for an unknown connector id", async () => {
    const res = await api.get("/api/connectors/does-not-exist/authorize");
    expect(res.status).toBe(404);
  });

  it("409s when ai-manga isn't configured", async () => {
    delete process.env.AI_MANGA_CLIENT_ID;
    const res = await api.get("/api/connectors/ai-manga/authorize");
    expect(res.status).toBe(409);
  });

  it("returns an AI MANGA authorize URL carrying PKCE + state once configured", async () => {
    process.env.AI_MANGA_CLIENT_ID = "test-client";
    process.env.AI_MANGA_REDIRECT_URI = "http://localhost:3001/api/connectors/ai-manga/callback";
    const res = await api.get("/api/connectors/ai-manga/authorize");
    expect(res.status).toBe(200);
    const url = new URL(res.body.url);
    expect(url.pathname).toBe("/connect/authorize");
    expect(url.searchParams.get("client_id")).toBe("test-client");
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    expect(url.searchParams.get("state")).toBeTruthy();
  });
});

describe("GET /api/connectors/:id/callback", () => {
  beforeEach(() => {
    process.env.AI_MANGA_CLIENT_ID = "test-client";
    process.env.AI_MANGA_REDIRECT_URI = "http://localhost:3001/api/connectors/ai-manga/callback";
  });

  it("rejects an unknown/expired state without needing auth at all (public route)", async () => {
    const res = await request(app).get("/api/connectors/ai-manga/callback?state=does-not-exist&code=abc");
    expect(res.status).toBe(400);
    expect(res.text).toMatch(/ungültig|abgelaufen/);
  });
});

describe("POST /api/connectors/:id/disconnect", () => {
  it("clears the connection (no-op if never connected)", async () => {
    const res = await api.post("/api/connectors/ai-manga/disconnect");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
  });
});
