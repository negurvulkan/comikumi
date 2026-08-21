import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    // Explicit rather than relying on the (matching) default: each test file gets
    // its own fresh module registry, so projectStore.ts's `active`/`initPromise`
    // singleton never leaks between test files. resetActiveProjectForTests() is
    // the safety net for tests that open multiple projects within one file.
    isolate: true,
  },
});
