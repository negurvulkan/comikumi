import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";
import request from "supertest";
import type { Express } from "express";

export interface TestEnv {
  /** Set as process.env.LETTERING_DATA_DIR by this function — the throwaway
   * "server/data" equivalent (fonts/images/bubble-svgs/app-state.json etc). */
  dataDir: string;
  /** A scanRoot containing one minimal volume: Volume_01/volume_01_empty/page_01.png. */
  scanRoot: string;
  /** Not-yet-existing path for a fresh project's projekt.json. */
  projectFile: string;
  /** Bearer token for a pre-created system-admin test account (see authedAgent()) —
   * every route requires auth now, so most tests just want a working default identity
   * rather than testing auth itself (that's routes/auth.test.ts's job). */
  token: string;
  userId: string;
}

/**
 * Creates a throwaway temp directory tree (data dir + scanRoot with one tiny real
 * PNG page + a not-yet-written project file path) and points
 * `process.env.LETTERING_DATA_DIR` at it, so `server/src/lib/paths.ts`'s
 * FONTS_DIR/IMAGES_DIR/BUBBLE_SVGS_DIR/THUMBNAILS_DIR/APP_STATE_FILE constants
 * resolve into it instead of the real repo's server/data.
 *
 * IMPORTANT: call this (from a test file's `beforeAll`) BEFORE dynamically
 * importing anything from "../app.js"/"../lib/projectStore.js"/"../lib/paths.js" —
 * those compute their directory constants once, at module-evaluation time, from
 * whatever `process.env.LETTERING_DATA_DIR` is set to right then. A static
 * top-level `import` would be hoisted above this function call and see the env
 * var unset — use `await import(...)` inside `beforeAll` instead.
 */
export async function setupTestEnv(): Promise<TestEnv> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "lettering-test-"));
  const dataDir = path.join(root, "data");
  const scanRoot = path.join(root, "scan-root");
  const projectFile = path.join(root, "projekt.json");

  const emptyDir = path.join(scanRoot, "Volume_01", "volume_01_empty");
  await fs.mkdir(emptyDir, { recursive: true });
  // A real, tiny, decodable PNG — both `image-size` and `sharp` (thumbnail
  // generation) need actual image bytes, not a placeholder text file.
  await sharp({ create: { width: 4, height: 4, channels: 3, background: { r: 255, g: 255, b: 255 } } })
    .png()
    .toFile(path.join(emptyDir, "page_01.png"));

  process.env.LETTERING_DATA_DIR = dataDir;

  // Dynamic import for the same reason as the doc comment above requires it for
  // app.js/projectStore.js/paths.js — authStore.js's USERS_FILE/AUTH_SECRET_FILE
  // constants are computed at module-evaluation time from LETTERING_DATA_DIR.
  const { createUser, signToken } = await import("../lib/authStore.js");
  const user = await createUser("test-admin", "test-password", true);
  const token = await signToken(user);

  return { dataDir, scanRoot, projectFile, token, userId: user.id };
}

/** Wraps supertest so every request from a test file is authenticated by default
 * (Authorization: Bearer <token>, see setupTestEnv()'s system-admin test account) —
 * use the raw `request(app)` directly only when a test deliberately wants to check
 * unauthenticated/unauthorized/forbidden behavior itself. */
export function authedAgent(app: Express, token: string) {
  const withAuth = (test: request.Test) => test.set("Authorization", `Bearer ${token}`);
  return {
    get: (url: string) => withAuth(request(app).get(url)),
    post: (url: string) => withAuth(request(app).post(url)),
    put: (url: string) => withAuth(request(app).put(url)),
    patch: (url: string) => withAuth(request(app).patch(url)),
    delete: (url: string) => withAuth(request(app).delete(url)),
  };
}

/** Writes a minimal, schema-valid page-layout JSON into
 * `<scanRoot>/Volume_01/volume_01<letteringSuffix>/page_01.json` — for
 * export-zip/import-zip/reports tests in layout.ts. Returns the written file's path. */
export async function writeLetteringFixture(scanRoot: string, letteringSuffix = "_lettering"): Promise<string> {
  const dir = path.join(scanRoot, "Volume_01", `volume_01${letteringSuffix}`);
  await fs.mkdir(dir, { recursive: true });
  const layout = {
    page: "page_01",
    sourceImage: "page_01.png",
    imageWidth: 4,
    imageHeight: 4,
    bubbles: [],
    images: [],
    curvedTexts: [],
    panels: [],
  };
  const file = path.join(dir, "page_01.json");
  await fs.writeFile(file, JSON.stringify(layout, null, 2), "utf-8");
  return file;
}
