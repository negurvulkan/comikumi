import { randomUUID } from "node:crypto";
import { docker } from "./docker.js";
import { config } from "./config.js";
import type { Session } from "./types.js";

export const DEMO_LABEL = "com.comikumi.demo";

export class SessionCapacityError extends Error {
  constructor() {
    super("Demo is at capacity — please try again shortly.");
    this.name = "SessionCapacityError";
  }
}

const sessions = new Map<string, Session>();

/** In-flight (not-yet-registered-in `sessions`) container creations — counted
 * separately so the capacity check in createSession() accounts for creations still
 * awaiting Docker/health-check, not just already-finished ones. Without this, several
 * concurrent no-cookie requests (e.g. a single cold page load fires half a dozen API
 * calls in parallel, all before any of them can receive a Set-Cookie response) would
 * each read `sessions.size` as still low and all slip past the check at once. */
let pendingCreations = 0;

/** Coalesces concurrent no-cookie requests from the same visitor into a single
 * createSession() call — the other piece of the same race: even with the atomic
 * capacity check above, a page load's several parallel first-contact requests would
 * otherwise each start (and get billed for) their own container for what is actually
 * one visitor. Keyed by IP (see app.ts's trust-proxy setting for why req.ip is
 * reliable here); different visitors' concurrent first requests still get independent
 * sessions. */
const pendingByIp = new Map<string, Promise<Session>>();

export async function getOrCreateSessionForIp(ip: string): Promise<Session> {
  const existing = pendingByIp.get(ip);
  if (existing) return existing;
  const creation = createSession();
  pendingByIp.set(ip, creation);
  creation
    .finally(() => {
      if (pendingByIp.get(ip) === creation) pendingByIp.delete(ip);
    })
    .catch(() => {});
  return creation;
}

/** Pure — kept separate from any Docker/timer state so it's trivially unit-testable. */
export function isIdle(session: Session, now: number, idleTimeoutMs: number): boolean {
  return now - session.lastAccess > idleTimeoutMs;
}

export function getSession(id: string | undefined): Session | undefined {
  if (!id) return undefined;
  return sessions.get(id);
}

export function touch(session: Session): void {
  session.lastAccess = Date.now();
}

async function waitForHealthy(hostPort: string): Promise<void> {
  const deadline = Date.now() + config.healthCheckTimeoutMs;
  let lastError: unknown;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`http://127.0.0.1:${hostPort}/api/health`);
      if (res.ok) return;
    } catch (err) {
      lastError = err;
    }
    await new Promise((resolve) => setTimeout(resolve, config.healthCheckIntervalMs));
  }
  throw new Error(`Container on port ${hostPort} never became healthy: ${String(lastError)}`);
}

/** Creates one throwaway, fully isolated container for a new visitor: no published
 * host port beyond a loopback-only one the broker itself proxies through, no volume
 * mount (destroying the container discards everything), memory/CPU/pids capped so one
 * visitor can't starve the box. Waits for the container's own health check before
 * returning, so the broker never proxies into a still-booting container. */
async function createSession(): Promise<Session> {
  // Reserve a slot synchronously (before any await) so the check-then-create isn't a
  // race across concurrent calls — see pendingCreations' doc comment above.
  if (sessions.size + pendingCreations >= config.maxConcurrentSessions) {
    throw new SessionCapacityError();
  }
  pendingCreations++;

  try {
    const id = randomUUID();
    const containerName = `comikumi-demo-${id}`;
    const env = ["CLIENT_DIST_DIR="];
    if (config.demoMaxPages !== null) env.push(`DEMO_MAX_PAGES=${config.demoMaxPages}`);

    const container = await docker.createContainer({
      Image: config.demoImage,
      name: containerName,
      Env: env,
      Labels: { [DEMO_LABEL]: "true" },
      ExposedPorts: { "3001/tcp": {} },
      HostConfig: {
        Memory: config.containerMemoryMb * 1024 * 1024,
        MemorySwap: config.containerMemoryMb * 1024 * 1024,
        NanoCpus: config.containerCpus * 1e9,
        PidsLimit: config.containerPidsLimit,
        AutoRemove: true,
        PortBindings: { "3001/tcp": [{ HostIp: "127.0.0.1", HostPort: "" }] },
      },
    });

    try {
      await container.start();
      const info = await container.inspect();
      const hostPort = info.NetworkSettings.Ports["3001/tcp"]?.[0]?.HostPort;
      if (!hostPort) throw new Error("Container started but was not assigned a host port");

      await waitForHealthy(hostPort);

      const session: Session = { id, containerId: container.id, containerName, hostPort, lastAccess: Date.now() };
      sessions.set(id, session);
      return session;
    } catch (err) {
      // Best-effort — AutoRemove only fires on a clean stop, not if we bail out here
      // while it's still starting.
      await container.remove({ force: true }).catch(() => {});
      throw err;
    }
  } finally {
    pendingCreations--;
  }
}

async function stopSession(session: Session): Promise<void> {
  sessions.delete(session.id);
  await docker
    .getContainer(session.containerId)
    .stop()
    .catch(() => {});
}

export function startIdleSweep(): NodeJS.Timeout {
  return setInterval(() => {
    const now = Date.now();
    for (const session of sessions.values()) {
      if (isIdle(session, now, config.sessionIdleTimeoutMs)) {
        console.log(`Idle demo session ${session.id} (${session.containerName}) — stopping.`);
        void stopSession(session);
      }
    }
  }, config.sweepIntervalMs);
}

/** A broker crash/restart loses the in-memory session map, but AutoRemove only fires
 * on a *clean* container stop — anything still running from a previous run must be
 * force-removed explicitly, found via the label rather than any state we kept. */
export async function cleanupOrphansOnStartup(): Promise<void> {
  const containers = await docker.listContainers({ all: true, filters: JSON.stringify({ label: [`${DEMO_LABEL}=true`] }) });
  await Promise.all(
    containers.map((c) =>
      docker
        .getContainer(c.Id)
        .remove({ force: true })
        .catch(() => {})
    )
  );
  if (containers.length > 0) console.log(`Removed ${containers.length} orphaned demo container(s) from a previous run.`);
}

export async function shutdownAll(): Promise<void> {
  await Promise.all([...sessions.values()].map((s) => stopSession(s)));
}
