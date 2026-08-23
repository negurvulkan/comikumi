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
  await fs.copyFile("C:\\Windows\\Fonts\\arial.ttf", path.join(fontsDir, "GlobalFont.ttf"));
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
