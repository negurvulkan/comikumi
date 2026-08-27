import fs from "node:fs/promises";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { setupTestEnv, type TestEnv } from "../test-utils/fixtures.js";
import type { VolumeInfo } from "./projectScanner.js";

let env: TestEnv;
let findVolume: typeof import("./projectScanner.js").findVolume;
let listPages: typeof import("./projectScanner.js").listPages;
let pageOrderFilePathFor: typeof import("./projectScanner.js").pageOrderFilePathFor;

const VOLUME_ID = "Volume_01";
// Same fixed tiny valid PNG bytes used across server/src/routes/pages.test.ts.
const TINY_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  "base64"
);

async function volume(): Promise<VolumeInfo> {
  const v = await findVolume(VOLUME_ID);
  if (!v) throw new Error("test fixture volume not found");
  return v;
}

async function writePage(name: string): Promise<void> {
  const v = await volume();
  await fs.writeFile(path.join(v.emptyDir, `${name}.png`), TINY_PNG);
}

async function writeOrderFile(order: string[]): Promise<void> {
  const v = await volume();
  await fs.writeFile(pageOrderFilePathFor(v), JSON.stringify({ order }), "utf-8");
}

beforeAll(async () => {
  env = await setupTestEnv();
  const { createProject } = await import("../lib/projectStore.js");
  const scanner = await import("./projectScanner.js");
  findVolume = scanner.findVolume;
  listPages = scanner.listPages;
  pageOrderFilePathFor = scanner.pageOrderFilePathFor;
  await createProject(env.projectFile, { name: "Test Project", scanRoot: env.scanRoot });
  // Fixture already has page_01.png; add two more for a meaningful order to test.
  await writePage("page_02");
  await writePage("page_03");
});

describe("listPages() order awareness", () => {
  it("falls back to the natural/numeric filename sort when no order file exists", async () => {
    const pages = await listPages(await volume());
    expect(pages.map((p) => p.page)).toEqual(["page_01", "page_02", "page_03"]);
  });

  it("uses the saved order file when present", async () => {
    await writeOrderFile(["page_03", "page_01", "page_02"]);
    const pages = await listPages(await volume());
    expect(pages.map((p) => p.page)).toEqual(["page_03", "page_01", "page_02"]);
  });

  it("silently drops order entries for pages no longer on disk", async () => {
    await writeOrderFile(["page_03", "page_99", "page_01", "page_02"]);
    const pages = await listPages(await volume());
    expect(pages.map((p) => p.page)).toEqual(["page_03", "page_01", "page_02"]);
  });

  it("appends pages missing from the stored order at the end, naturally sorted", async () => {
    await writePage("page_04");
    await writeOrderFile(["page_03", "page_01"]);
    const pages = await listPages(await volume());
    expect(pages.map((p) => p.page)).toEqual(["page_03", "page_01", "page_02", "page_04"]);
  });
});
