import { defineConfig, configDefaults } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    // Explicit rather than relying on the (matching) default: each test file gets
    // its own fresh module registry, so projectStore.ts's `active`/`initPromise`
    // singleton never leaks between test files. resetActiveProjectForTests() is
    // the safety net for tests that open multiple projects within one file.
    isolate: true,
    // Never scan the real runtime data directory for test files. This is normally a
    // no-op (test files live in src/, not data/), but `server/data/` can end up
    // holding things that also match vitest's default `**/*.test.ts` include glob —
    // e.g. `codex-home/<userId>/.tmp/plugins/**` (Codex's own plugin-eval fixtures,
    // downloaded on first real Codex use, see lib/ai/codexProcessManager.ts) — which
    // then get misidentified as real test suites and reported as failures. Excluding
    // the whole directory is the robust fix regardless of what ends up in there.
    // "dist/**" duplicates configDefaults.exclude's own "**/dist/**" — added explicitly
    // because that leading "**/" form was observed to NOT exclude the compiled
    // dist/server/src/**/*.test.js output on Windows (tsc's outDir here ends up nested
    // as dist/server/src/... — see tsconfig.json's missing rootDir — and vitest still
    // picked those compiled files up as real test suites, doubling the whole run and
    // hiding real failures behind sheer parallel-worker overload). Belt-and-suspenders:
    // costs nothing on a platform where the default already works.
    exclude: [...configDefaults.exclude, "data/**", "dist/**"],
    // Each test file spins up a full Express app (createApp()) plus real file I/O
    // (sharp, temp dirs) in its own forked worker — with vitest's default pool sizing
    // (roughly one fork per logical core), running the whole ~45-file suite at once
    // means dozens of these apps starting concurrently, which reliably blows past the
    // default 10s hook timeout under CPU/memory contention (observed repeatedly:
    // whole test files failing with "Hook timed out", not a single real assertion
    // failure among them — always resolved by re-running a smaller slice). Capping
    // concurrency trades a bit of wall-clock time for the suite actually finishing
    // reliably in one run, which matters most for CI (a single `npm run test` with no
    // human retrying a flaky batch by hand).
    poolOptions: {
      forks: {
        maxForks: 4,
      },
    },
    hookTimeout: 20000,
  },
});
