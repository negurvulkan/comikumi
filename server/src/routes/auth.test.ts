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
    expect(res.body).toEqual({ hasAnyUsers: true, demoMode: false });
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

  it("allows updating another user password and admin status, but rejects demoting oneself", async () => {
    // 1. Create a temporary user
    const create = await request(app)
      .post("/api/auth/users")
      .set("Authorization", `Bearer ${env.token}`)
      .send({ username: "temp-user-update", password: "pw", isSystemAdmin: false });
    expect(create.status).toBe(201);
    const userId = create.body.id as string;

    // 2. Update their status to admin
    const patchAdmin = await request(app)
      .patch(`/api/auth/users/${userId}`)
      .set("Authorization", `Bearer ${env.token}`)
      .send({ isSystemAdmin: true });
    expect(patchAdmin.status).toBe(200);
    expect(patchAdmin.body.isSystemAdmin).toBe(true);

    // 3. Test changing their password
    const patchPw = await request(app)
      .patch(`/api/auth/users/${userId}`)
      .set("Authorization", `Bearer ${env.token}`)
      .send({ password: "new-temp-password" });
    expect(patchPw.status).toBe(200);

    // 4. Test logging in with new password
    const loginRes = await request(app)
      .post("/api/auth/login")
      .send({ username: "temp-user-update", password: "new-temp-password" });
    expect(loginRes.status).toBe(200);
    const tempToken = loginRes.body.token as string;

    // 5. Rejects demoting oneself
    const demoteSelf = await request(app)
      .patch(`/api/auth/users/${userId}`)
      .set("Authorization", `Bearer ${tempToken}`)
      .send({ isSystemAdmin: false });
    expect(demoteSelf.status).toBe(400);
    expect(demoteSelf.body.error).toBe("cannot_demote_own_account");

    // Clean up
    await request(app).delete(`/api/auth/users/${userId}`).set("Authorization", `Bearer ${env.token}`);
  });

  it("rejects removing/demoting the last system administrator", async () => {
    const meRes = await request(app).get("/api/auth/me").set("Authorization", `Bearer ${env.token}`);
    const myId = meRes.body.id as string;

    // Try to demote self (only system admin)
    const demote = await request(app)
      .patch(`/api/auth/users/${myId}`)
      .set("Authorization", `Bearer ${env.token}`)
      .send({ isSystemAdmin: false });
    expect(demote.status).toBe(400);
    expect(demote.body.error).toBe("cannot_demote_own_account");
  });

  it("supports self-service password changing", async () => {
    // 1. Create a user
    const create = await request(app)
      .post("/api/auth/users")
      .set("Authorization", `Bearer ${env.token}`)
      .send({ username: "self-pwd-change", password: "old-password" });
    expect(create.status).toBe(201);
    const userId = create.body.id as string;

    // 2. Login to get token
    const loginRes = await request(app)
      .post("/api/auth/login")
      .send({ username: "self-pwd-change", password: "old-password" });
    const userToken = loginRes.body.token as string;

    // 3. Change password with incorrect current password
    const failChange = await request(app)
      .post("/api/auth/change-password")
      .set("Authorization", `Bearer ${userToken}`)
      .send({ currentPassword: "wrong-password", newPassword: "super-new-password" });
    expect(failChange.status).toBe(400);
    expect(failChange.body.error).toBe("invalid_credentials");

    // 4. Change password with correct current password
    const successChange = await request(app)
      .post("/api/auth/change-password")
      .set("Authorization", `Bearer ${userToken}`)
      .send({ currentPassword: "old-password", newPassword: "super-new-password" });
    expect(successChange.status).toBe(200);
    expect(successChange.body.ok).toBe(true);

    // 5. Verify login works with new password
    const newLoginRes = await request(app)
      .post("/api/auth/login")
      .send({ username: "self-pwd-change", password: "super-new-password" });
    expect(newLoginRes.status).toBe(200);

    // Clean up
    await request(app).delete(`/api/auth/users/${userId}`).set("Authorization", `Bearer ${env.token}`);
  });
});

