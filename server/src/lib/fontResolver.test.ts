import { beforeAll, describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import { setupTestEnv, type TestEnv } from "../test-utils/fixtures.js";

let env: TestEnv;
let findFontFileForFamily: typeof import("./fontResolver.js").findFontFileForFamily;

beforeAll(async () => {
  env = await setupTestEnv();
  const fontsDir = path.join(env.dataDir, "fonts");
  await fs.mkdir(fontsDir, { recursive: true });
  // findFontFileForFamily/findInDir only ever check the file's name+extension, never its
  // bytes (see fontResolver.ts) — a placeholder is enough, same as the .woff placeholder
  // just below. Previously copied a real system font (C:\Windows\Fonts\arial.ttf), which
  // only exists on Windows and silently broke this test on any other OS (Linux CI, macOS).
  await fs.writeFile(path.join(fontsDir, "GlobalFont.ttf"), "not a real font either");
  // A .woff placeholder — not real WOFF bytes, but findFontFileForFamily should reject it
  // purely by extension before ever trying to read/parse it.
  await fs.writeFile(path.join(fontsDir, "WebOnlyFont.woff"), "not a real font");

  ({ findFontFileForFamily } = await import("./fontResolver.js"));
});

describe("findFontFileForFamily", () => {
  it("finds a .ttf file in the global fonts dir by its derived family name", async () => {
    const result = await findFontFileForFamily("GlobalFont");
    expect(result).toBe(path.join(env.dataDir, "fonts", "GlobalFont.ttf"));
  });

  it("returns null for an unknown family", async () => {
    expect(await findFontFileForFamily("NoSuchFamily")).toBeNull();
  });

  it("returns null for a family only available as .woff (not PDF-embeddable)", async () => {
    expect(await findFontFileForFamily("WebOnlyFont")).toBeNull();
  });
});
