import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";

export interface TestEnv {
  /** Set as process.env.LETTERING_DATA_DIR by this function — the throwaway
   * "server/data" equivalent (fonts/images/bubble-svgs/app-state.json etc). */
  dataDir: string;
  /** A scanRoot containing one minimal volume: Volume_01/volume_01_empty/page_01.png. */
  scanRoot: string;
  /** Not-yet-existing path for a fresh project's projekt.json. */
  projectFile: string;
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
  return { dataDir, scanRoot, projectFile };
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
