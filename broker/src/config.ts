import type { Config } from "./types.js";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var ${name}`);
  return value;
}

function numberEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined) return fallback;
  const n = Number(raw);
  if (Number.isNaN(n)) throw new Error(`Env var ${name} must be a number, got "${raw}"`);
  return n;
}

/** Read once at boot, same "env vars, no config file" convention as server/src/lib/paths.ts. */
export const config: Config = {
  brokerPort: numberEnv("BROKER_PORT", 4000),
  clientOrigin: requireEnv("CLIENT_ORIGIN"),
  demoImage: process.env.DEMO_IMAGE ?? "comikumi-demo:latest",
  sessionCookieName: process.env.SESSION_COOKIE_NAME ?? "comikumi_demo_session",
  maxConcurrentSessions: numberEnv("MAX_CONCURRENT_SESSIONS", 5),
  sessionIdleTimeoutMs: numberEnv("SESSION_IDLE_TIMEOUT_MS", 30 * 60 * 1000),
  sweepIntervalMs: numberEnv("SWEEP_INTERVAL_MS", 2 * 60 * 1000),
  containerMemoryMb: numberEnv("CONTAINER_MEMORY_MB", 512),
  containerCpus: numberEnv("CONTAINER_CPUS", 0.5),
  containerPidsLimit: numberEnv("CONTAINER_PIDS_LIMIT", 256),
  healthCheckTimeoutMs: numberEnv("HEALTH_CHECK_TIMEOUT_MS", 12000),
  healthCheckIntervalMs: numberEnv("HEALTH_CHECK_INTERVAL_MS", 200),
  demoMaxPages: process.env.DEMO_MAX_PAGES ? numberEnv("DEMO_MAX_PAGES", 8) : null,
};
