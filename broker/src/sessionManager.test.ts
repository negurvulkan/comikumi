import { describe, expect, it } from "vitest";
import { isIdle } from "./sessionManager.js";
import type { Session } from "./types.js";

function makeSession(lastAccess: number): Session {
  return { id: "s1", containerId: "c1", containerName: "comikumi-demo-s1", hostPort: "12345", lastAccess };
}

describe("isIdle", () => {
  it("is not idle when last access is within the timeout window", () => {
    const now = 1_000_000;
    expect(isIdle(makeSession(now - 1000), now, 30 * 60 * 1000)).toBe(false);
  });

  it("is idle once last access is older than the timeout window", () => {
    const now = 1_000_000;
    const timeout = 30 * 60 * 1000;
    expect(isIdle(makeSession(now - timeout - 1), now, timeout)).toBe(true);
  });

  it("is not idle exactly at the boundary (strictly greater-than, not equal)", () => {
    const now = 1_000_000;
    const timeout = 30 * 60 * 1000;
    expect(isIdle(makeSession(now - timeout), now, timeout)).toBe(false);
  });
});
