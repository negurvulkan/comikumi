import { beforeAll, describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { setupTestEnv, type TestEnv } from "../test-utils/fixtures.js";

let env: TestEnv;
let resolvePsdFontName: typeof import("./psdFontNames.js").resolvePsdFontName;

beforeAll(async () => {
  env = await setupTestEnv();
  const fontsDir = path.join(env.dataDir, "fonts");
  await fs.mkdir(fontsDir, { recursive: true });

  // A real, embeddable font (DejaVu Sans, see TestFont.LICENSE.txt) — unlike
  // fontResolver.test.ts's placeholder bytes, resolvePsdFontName actually parses the
  // file with fontkit, so it needs real TTF data to succeed.
  const fixturesDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "__fixtures__");
  await fs.copyFile(path.join(fixturesDir, "TestFont.ttf"), path.join(fontsDir, "RealFont.ttf"));
  await fs.writeFile(path.join(fontsDir, "FakeFont.ttf"), "not a real font");

  ({ resolvePsdFontName } = await import("./psdFontNames.js"));
});

describe("resolvePsdFontName", () => {
  it("reads the real PostScript name out of a valid font file", async () => {
    const name = await resolvePsdFontName("RealFont");
    expect(typeof name).toBe("string");
    expect(name!.length).toBeGreaterThan(0);
  });

  it("caches the result — a second call for the same family doesn't need to re-read the file", async () => {
    const first = await resolvePsdFontName("RealFont");
    const second = await resolvePsdFontName("RealFont");
    expect(second).toBe(first);
  });

  it("returns null for a family with no embeddable font file", async () => {
    expect(await resolvePsdFontName("NoSuchFamily")).toBeNull();
  });

  it("returns null for a file that isn't actually parseable font data", async () => {
    expect(await resolvePsdFontName("FakeFont")).toBeNull();
  });
});
