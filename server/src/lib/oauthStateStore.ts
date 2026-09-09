import { randomUUID } from "node:crypto";

/**
 * Short-lived bridge between GET /api/connectors/:id/authorize (which generates a PKCE
 * code verifier + a `state`) and GET /api/connectors/:id/callback (which needs that
 * same verifier again to exchange the authorization code) — the callback request comes
 * from the external provider's redirect, with no Authorization header at all, so
 * `state` is the only thing tying it back to the ComiKumi user who started the flow.
 *
 * In-memory Map, same "small self-hosted process, no external services" convention as
 * server/src/lib/exportJobs.ts's job store — a pending authorization simply doesn't
 * survive a server restart, which is fine: the user just retries "Connect".
 */
interface PendingAuthorization {
  connectorId: string;
  userId: string;
  codeVerifier: string;
  createdAt: number;
}

const pending = new Map<string, PendingAuthorization>();

const STATE_TTL_MS = 10 * 60 * 1000;

function sweepExpired(): void {
  const cutoff = Date.now() - STATE_TTL_MS;
  for (const [state, entry] of pending) {
    if (entry.createdAt < cutoff) pending.delete(state);
  }
}

export function createPendingAuthorization(connectorId: string, userId: string, codeVerifier: string): string {
  sweepExpired();
  const state = randomUUID();
  pending.set(state, { connectorId, userId, codeVerifier, createdAt: Date.now() });
  return state;
}

/** Consumes (deletes) the pending authorization for `state` — a state is single-use,
 * so a replayed/guessed callback request can't exchange the same verifier twice.
 * Returns undefined for an unknown or expired state. */
export function consumePendingAuthorization(state: string): PendingAuthorization | undefined {
  sweepExpired();
  const entry = pending.get(state);
  if (entry) pending.delete(state);
  return entry;
}
