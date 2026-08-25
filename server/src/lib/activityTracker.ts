/**
 * In-memory "who was recently active" heuristic — updated on every authenticated
 * request (see auth.ts's requireAuth) and consulted before switching the server's
 * active project (see routes/project.ts), so switching away from a project other
 * people are currently working in warns instead of silently pulling it out from under
 * them. Deliberately not persisted: a server restart clearing this is correct, it's a
 * live-activity signal, not a durable record.
 */
interface ActivityEntry {
  username: string;
  lastSeenMs: number;
}

const lastSeenByUser = new Map<string, ActivityEntry>();

export function recordActivity(userId: string, username: string): void {
  lastSeenByUser.set(userId, { username, lastSeenMs: Date.now() });
}

export interface RecentlyActiveUser {
  username: string;
  secondsAgo: number;
}

/** Everyone (other than `excludeUserId`, normally the caller themself) seen within the
 * last `windowMs`, most recent first. */
export function getRecentlyActive(excludeUserId: string, windowMs: number): RecentlyActiveUser[] {
  const now = Date.now();
  const result: RecentlyActiveUser[] = [];
  for (const [userId, entry] of lastSeenByUser) {
    if (userId === excludeUserId) continue;
    const ageMs = now - entry.lastSeenMs;
    if (ageMs <= windowMs) result.push({ username: entry.username, secondsAgo: Math.round(ageMs / 1000) });
  }
  return result.sort((a, b) => a.secondsAgo - b.secondsAgo);
}

/** Test-only escape hatch — mirrors the reset helpers already in projectStore.ts/
 * authStore.ts so each test file starts from a clean slate. */
export function resetActivityForTests(): void {
  lastSeenByUser.clear();
}
