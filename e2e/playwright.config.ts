import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig, devices } from "@playwright/test";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const E2E_SERVER_PORT = 3101;
export const E2E_CLIENT_PORT = 4173;
// Not dot-prefixed (".tmp") on purpose — Express's res.sendFile() (via the `send`
// package's default dotfiles:"ignore") 404s any path with a dot-prefixed segment, which
// would silently break the page-image route for every fixture page served from under
// here (see server/src/routes/pages.ts). Real product code never has this problem since
// nobody's actual scan root lives under a dot-directory.
export const TMP_DIR = path.resolve(__dirname, "tmp-run");
export const DATA_DIR = path.join(TMP_DIR, "data");

// Deliberately different from the normal dev ports (3001/5173) so this suite can run
// alongside a real `npm run dev` session without colliding with it or touching real
// project data — see LETTERING_DATA_DIR below, which gives the spawned server a
// completely fresh, throwaway state directory (no users, no active project).
export default defineConfig({
  testDir: "./tests",
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: "list",
  globalSetup: "./global-setup.ts",
  globalTeardown: "./global-teardown.ts",
  use: {
    baseURL: `http://localhost:${E2E_CLIENT_PORT}`,
    locale: "en-US",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: [
    {
      command: "npx tsx src/index.ts",
      cwd: path.resolve(__dirname, "../server"),
      env: {
        PORT: String(E2E_SERVER_PORT),
        LETTERING_DATA_DIR: DATA_DIR,
      },
      url: `http://localhost:${E2E_SERVER_PORT}/api/auth/setup-status`,
      reuseExistingServer: false,
      timeout: 30_000,
      stdout: "pipe",
      stderr: "pipe",
    },
    {
      // VITE_API_BASE_URL (not the vite.config.ts dev proxy — see client/src/api/
      // apiBase.ts) is what actually controls which server the client's fetch() calls
      // hit: in dev, apiUrl() builds *absolute* "http://localhost:3001/api/..." URLs
      // when unset, bypassing the proxy entirely, so this is the only lever that works.
      command: `npx vite --port ${E2E_CLIENT_PORT}`,
      cwd: path.resolve(__dirname, "../client"),
      env: {
        VITE_API_BASE_URL: `http://localhost:${E2E_SERVER_PORT}`,
      },
      url: `http://localhost:${E2E_CLIENT_PORT}`,
      reuseExistingServer: false,
      timeout: 30_000,
      stdout: "pipe",
      stderr: "pipe",
    },
  ],
});
