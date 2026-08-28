import fs from "node:fs/promises";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import type { Express } from "express";
import { setupTestEnv, authedAgent, type TestEnv } from "../test-utils/fixtures.js";

let app: Express;
let env: TestEnv;
let api: ReturnType<typeof authedAgent>;
let OCR_MODELS_DIR: string;

beforeAll(async () => {
  env = await setupTestEnv();
  const { createApp } = await import("../app.js");
  const paths = await import("../lib/paths.js");
  OCR_MODELS_DIR = paths.OCR_MODELS_DIR;
  app = createApp();
  api = authedAgent(app, env.token);
});

describe("GET /api/ocr-models/:fileName", () => {
  it("404s for a file that hasn't been manually placed there", async () => {
    const res = await api.get("/api/ocr-models/does-not-exist.onnx");
    expect(res.status).toBe(404);
    expect(res.body.error).toBe("model_not_found");
  });

  it("rejects a path-traversal attempt with 400, never touching the filesystem outside OCR_MODELS_DIR", async () => {
    const res = await api.get("/api/ocr-models/..%2F..%2Fpackage.json");
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("invalid_file_name");
  });

  it("serves a manually-placed file", async () => {
    await fs.mkdir(OCR_MODELS_DIR, { recursive: true });
    await fs.writeFile(path.join(OCR_MODELS_DIR, "fake-model.onnx"), "fake onnx bytes");

    const res = await api
      .get("/api/ocr-models/fake-model.onnx")
      .buffer(true)
      .parse((response, cb) => {
        const chunks: Buffer[] = [];
        response.on("data", (chunk: Buffer) => chunks.push(chunk));
        response.on("end", () => cb(null, Buffer.concat(chunks)));
      });
    expect(res.status).toBe(200);
    expect((res.body as Buffer).toString("utf-8")).toBe("fake onnx bytes");
  });

  it("responds to HEAD without a body, for modelLoader.ts's local-mirror availability probe", async () => {
    const { default: request } = await import("supertest");
    const res = await request(app).head("/api/ocr-models/fake-model.onnx").set("Authorization", `Bearer ${env.token}`);
    expect(res.status).toBe(200);
    expect(res.text).toBeFalsy();
  });

  it("requires authentication", async () => {
    const { default: request } = await import("supertest");
    const res = await request(app).get("/api/ocr-models/fake-model.onnx");
    expect(res.status).toBe(401);
  });
});
