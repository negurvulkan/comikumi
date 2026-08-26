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
    exclude: [...configDefaults.exclude, "data/**"],
  },
});
