/**
 * Per-key async mutex — serializes concurrent read-modify-write sequences against the
 * same file (comments/script documents, project metadata) within this one Node process.
 * Not a cross-process file lock (no `proper-lockfile` or similar): ComiKumi only ever
 * runs as a single server process per deployment, so a simple in-memory promise chain
 * per key is sufficient to close the "two concurrent requests both read the old
 * document, each writes back only their own change" race — no real OS-level lock is
 * needed for that.
 */
const queues = new Map<string, Promise<unknown>>();

export function withFileLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const previous = queues.get(key) ?? Promise.resolve();
  const settledPrevious = previous.catch(() => {});
  const run = settledPrevious.then(fn);
  queues.set(
    key,
    run.catch(() => {})
  );
  return run;
}
