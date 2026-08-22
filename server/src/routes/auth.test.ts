import { beforeAll, describe, expect, it } from "vitest";
import type { Express } from "express";
import request from "supertest";
import { setupTestEnv, type TestEnv } from "../test-utils/fixtures.js";

let app: Express;
let env: TestEnv;

beforeAll(async () => {
  env = await setupTestEnv();
  const { createApp } = await import("../app.js");
  app = createApp();
});

describe("GET /api/auth/setup-status", () => {
  it("reports hasAnyUsers: true — setupTestEnv() already created a system-admin test account", async () => {
    const res = await request(app).get("/api/auth/setup-status");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ hasAnyUsers: true });
  });
});

describe("POST /api/auth/setup", () => {
  it("refuses to run again once an account already exists", async () => {
    const res = await request(app).post("/api/auth/setup").send({ username: "second-admin", password: "pw" });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("setup_already_completed");
  });
});

describe("POST /api/auth/login", () => {
  it("rejects a wrong password", async () => {
    const res = await request(app).post("/api/auth/login").send({ username: "test-admin", password: "wrong" });
    expect(res.status).toBe(401);
    expect(res.body.error).toBe("invalid_credentials");
  });

  it("rejects an unknown username", async () => {
    const res = await request(app).post("/api/auth/login").send({ username: "nobody", password: "pw" });
    expect(res.status).toBe(401);
    expect(res.body.error).toBe("invalid_credentials");
  });

  it("succeeds with the correct credentials and returns a usable token", async () => {
    const res = await request(app).post("/api/auth/login").send({ username: "test-admin", password: "test-password" });
    expect(res.status).toBe(200);
    expect(typeof res.body.token).toBe("string");
    expect(res.body.user).toMatchObject({ username: "test-admin", isSystemAdmin: true });
    expect(res.body.user).not.toHaveProperty("passwordHash");
  });
});

describe("GET /api/auth/me", () => {
  it("401s without a token", async () => {
    const res = await request(app).get("/api/auth/me");
    expect(res.status).toBe(401);
    expect(res.body.error).toBe("unauthorized");
  });

  it("401s with a garbage token", async () => {
    const res = await request(app).get("/api/auth/me").set("Authorization", "Bearer not-a-real-token");
    expect(res.status).toBe(401);
  });

  it("returns the current user with a valid token", async () => {
    const res = await request(app).get("/api/auth/me").set("Authorization", `Bearer ${env.token}`);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ username: "test-admin", isSystemAdmin: true });
  });
});

describe("Users management (requireSystemAdmin)", () => {
  it("rejects creating a user without a token", async () => {
    const res = await request(app).post("/api/auth/users").send({ username: "x", password: "pw" });
    expect(res.status).toBe(401);
  });

  it("a non-system-admin user cannot create other accounts", async () => {
    const created = await request(app)
      .post("/api/auth/users")
      .set("Authorization", `Bearer ${env.token}`)
      .send({ username: "plain-user", password: "pw", isSystemAdmin: false });
    expect(created.status).toBe(201);

    const loginRes = await request(app).post("/api/auth/login").send({ username: "plain-user", password: "pw" });
    const plainToken = loginRes.body.token as string;

    const res = await request(app)
      .post("/api/auth/users")
      .set("Authorization", `Bearer ${plainToken}`)
      .send({ username: "should-fail", password: "pw" });
    expect(res.status).toBe(403);
    expect(res.body.error).toBe("forbidden");
  });

  it("a system admin can create, list, and delete a user", async () => {
    const create = await request(app)
      .post("/api/auth/users")
      .set("Authorization", `Bearer ${env.token}`)
      .send({ username: "temp-user", password: "pw" });
    expect(create.status).toBe(201);
    const userId = create.body.id as string;

    const list = await request(app).get("/api/auth/users").set("Authorization", `Bearer ${env.token}`);
    expect(list.body.some((u: { id: string }) => u.id === userId)).toBe(true);

    const del = await request(app).delete(`/api/auth/users/${userId}`).set("Authorization", `Bearer ${env.token}`);
    expect(del.status).toBe(200);
    expect(del.body.some((u: { id: string }) => u.id === userId)).toBe(false);
  });

  it("rejects deleting your own account", async () => {
    const meRes = await request(app).get("/api/auth/me").set("Authorization", `Bearer ${env.token}`);
    const res = await request(app).delete(`/api/auth/users/${meRes.body.id}`).set("Authorization", `Bearer ${env.token}`);
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("cannot_delete_own_account");
  });
});
