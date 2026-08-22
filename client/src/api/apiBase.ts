/**
 * Configurable API origin — lets the client and server be hosted separately (different
 * machine/network) instead of always assuming they share an origin. Set
 * VITE_API_BASE_URL (a Vite build-time env var, e.g. in client/.env.local or the
 * environment the build runs in) to an absolute origin like
 * "https://comikumi.example.com" or "http://192.168.1.20:3001" to point the client at a
 * remotely-hosted server; no trailing slash.
 *
 * Falls back to "http://localhost:3001" (the server's own default dev port, see
 * server/src/index.ts) in dev when unset — this mirrors what vite.config.ts's dev-only
 * "/api" proxy already does, so unconfigured local dev behaves the same either way.
 * In a production build it falls back to "" (relative/same-origin), matching the normal
 * packaged setup where one Express process serves both the API and the built client
 * (see server/src/app.ts's optional staticDir) — a split deployment must set the env
 * var explicitly rather than silently defaulting to localhost in production.
 */
const configured = import.meta.env.VITE_API_BASE_URL?.trim();

export const API_BASE_URL = configured ? configured.replace(/\/+$/, "") : import.meta.env.DEV ? "http://localhost:3001" : "";

/** Prefixes a root-relative "/api/..." path with the configured API base. Use this for
 * every fetch() call and every URL handed to <img src>/FontFace/etc. — anything built
 * from a string literal like "/api/...". Leaves already-absolute (http/https) URLs
 * untouched, so it's safe to apply even to values that might already have gone through
 * it (e.g. a server-emitted `url` field re-wrapped defensively). */
export function apiUrl(path: string): string {
  if (/^https?:\/\//i.test(path)) return path;
  return `${API_BASE_URL}${path}`;
}
