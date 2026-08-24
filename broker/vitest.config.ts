import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // config.ts requires CLIENT_ORIGIN at import time (throws otherwise) — set a
    // harmless default so every test file can import modules that transitively pull
    // in config.ts without each one stubbing it individually.
    env: {
      CLIENT_ORIGIN: "http://localhost:5173",
    },
  },
});
