import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";

const ENV_KEYS = [
  "CLIENT_ORIGIN",
  "BROKER_PORT",
  "DEMO_IMAGE",
  "MAX_CONCURRENT_SESSIONS",
  "SESSION_IDLE_TIMEOUT_MS",
  "CONTAINER_MEMORY_MB",
  "DEMO_MAX_PAGES",
];
const originalEnv: Record<string, string | undefined> = {};

beforeEach(() => {
  for (const key of ENV_KEYS) originalEnv[key] = process.env[key];
});

afterEach(() => {
  for (const key of ENV_KEYS) {
    if (originalEnv[key] === undefined) delete process.env[key];
    else process.env[key] = originalEnv[key];
  }
});

describe("config", () => {
  it("applies documented defaults when only CLIENT_ORIGIN is set", async () => {
    for (const key of ENV_KEYS) delete process.env[key];
    process.env.CLIENT_ORIGIN = "https://demo-client.example.com";

    vi.resetModules();
    const { config } = await import("./config.js");

    expect(config.clientOrigin).toBe("https://demo-client.example.com");
    expect(config.brokerPort).toBe(4000);
    expect(config.demoImage).toBe("comikumi-demo:latest");
    expect(config.maxConcurrentSessions).toBe(5);
    expect(config.sessionIdleTimeoutMs).toBe(30 * 60 * 1000);
    expect(config.containerMemoryMb).toBe(512);
    expect(config.demoMaxPages).toBeNull();
  });

  it("throws when CLIENT_ORIGIN is missing", async () => {
    for (const key of ENV_KEYS) delete process.env[key];

    vi.resetModules();
    await expect(import("./config.js")).rejects.toThrow(/CLIENT_ORIGIN/);
  });

  it("honors overrides", async () => {
    for (const key of ENV_KEYS) delete process.env[key];
    process.env.CLIENT_ORIGIN = "https://demo-client.example.com";
    process.env.MAX_CONCURRENT_SESSIONS = "8";
    process.env.DEMO_MAX_PAGES = "12";

    vi.resetModules();
    const { config } = await import("./config.js");

    expect(config.maxConcurrentSessions).toBe(8);
    expect(config.demoMaxPages).toBe(12);
  });
});
