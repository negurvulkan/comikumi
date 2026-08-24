export interface Session {
  id: string;
  containerId: string;
  containerName: string;
  hostPort: string;
  lastAccess: number;
}

export interface Config {
  brokerPort: number;
  /** Exact origin the browser's demo-client page is served from — CORS is locked to
   * this single value plus credentials, never a wildcard (required for the
   * session-routing cookie to be usable at all, see docs/plan). */
  clientOrigin: string;
  demoImage: string;
  sessionCookieName: string;
  maxConcurrentSessions: number;
  sessionIdleTimeoutMs: number;
  sweepIntervalMs: number;
  containerMemoryMb: number;
  containerCpus: number;
  containerPidsLimit: number;
  healthCheckTimeoutMs: number;
  healthCheckIntervalMs: number;
  /** Forwarded as the seeded container's DEMO_MAX_PAGES override — unset lets the
   * image's own baked-in default (see Dockerfile) apply. */
  demoMaxPages: number | null;
}
