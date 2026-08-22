import { beforeAll, describe, expect, it } from "vitest";
import path from "node:path";
import fs from "node:fs/promises";
import { setupTestEnv, type TestEnv } from "../test-utils/fixtures.js";

let authStore: typeof import("./authStore.js");
let env: TestEnv;

beforeAll(async () => {
  // Same dynamic-import-after-env-var convention as every other test file here —
  // authStore.js's USERS_FILE/AUTH_SECRET_FILE constants are computed at module-
  // evaluation time from LETTERING_DATA_DIR.
  env = await setupTestEnv();
  authStore = await import("./authStore.js");
});

describe("hasAnyUsers", () => {
  it("starts false once users.json is (re)moved — setupTestEnv() itself already created a system-admin account", async () => {
    // Must run before any createUser() call in this file (tests run in declaration
    // order within a file). setupTestEnv() already wrote one user (test-admin, see
    // fixtures.ts) to prove the login flow works — remove that file directly to
    // exercise the true empty-directory path, since nothing else in this file
    // depends on that account existing.
    await fs.rm(path.join(env.dataDir, "users.json"));
    expect(await authStore.hasAnyUsers()).toBe(false);
  });
});

describe("hashPassword/verifyPassword", () => {
  it("verifies the correct password", () => {
    const hash = authStore.hashPassword("correct horse battery staple");
    expect(authStore.verifyPassword("correct horse battery staple", hash)).toBe(true);
  });

  it("rejects a wrong password", () => {
    const hash = authStore.hashPassword("correct horse battery staple");
    expect(authStore.verifyPassword("wrong password", hash)).toBe(false);
  });

  it("produces a different salt (and hash) each time for the same password", () => {
    const a = authStore.hashPassword("same password");
    const b = authStore.hashPassword("same password");
    expect(a).not.toBe(b);
    expect(authStore.verifyPassword("same password", a)).toBe(true);
    expect(authStore.verifyPassword("same password", b)).toBe(true);
  });
});

describe("signToken/verifyToken", () => {
  it("round-trips a valid token", async () => {
    const user = await authStore.createUser("roundtrip-user", "pw", false);
    const token = await authStore.signToken(user);
    const payload = await authStore.verifyToken(token);
    expect(payload).toMatchObject({ sub: user.id, username: "roundtrip-user", isSystemAdmin: false });
  });

  it("rejects a tampered/garbage token", async () => {
    const payload = await authStore.verifyToken("not.a.validtoken");
    expect(payload).toBeNull();
  });

  it("rejects an empty token", async () => {
    const payload = await authStore.verifyToken("");
    expect(payload).toBeNull();
  });
});

describe("createUser/findUserByUsername/hasAnyUsers", () => {
  it("finds a created user by username, and reports hasAnyUsers() true afterward", async () => {
    const user = await authStore.createUser("findme", "pw", true);
    const found = await authStore.findUserByUsername("findme");
    expect(found?.id).toBe(user.id);
    expect(await authStore.hasAnyUsers()).toBe(true);
  });

  it("toPublicUser() strips passwordHash", async () => {
    const user = await authStore.createUser("public-view", "pw", false);
    const pub = authStore.toPublicUser(user);
    expect(pub).not.toHaveProperty("passwordHash");
    expect(pub.username).toBe("public-view");
  });
});
