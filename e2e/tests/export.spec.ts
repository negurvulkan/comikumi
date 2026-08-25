import fs from "node:fs/promises";
import path from "node:path";
import { test, expect } from "@playwright/test";
import { readFixture, injectAuthToken, waitForEditorLoaded } from "./helpers";

test("exports the current page as PNG via the UI and the file lands on disk", async ({ page }) => {
  const fixture = await readFixture();
  await injectAuthToken(page, fixture.token);

  await page.goto(`/#/volumes/${fixture.volumeId}/pages/${fixture.page}`);
  await waitForEditorLoaded(page);

  await page.getByRole("button", { name: "Page", exact: true }).click();
  await page.getByRole("button", { name: "Image…" }).click();

  // PNG is the default selected format, and "current page" is the default selection
  // mode (ExportPanel.tsx defaults to "current" whenever a currentPage is given) — no
  // extra clicks needed before submitting.
  await page.getByRole("button", { name: "Export", exact: true }).click();
  await expect(page.getByText(/exports completed/)).toBeVisible({ timeout: 15_000 });

  // Strongest assertion: the actual file landed where the server is supposed to write
  // it (see server/src/lib/paths.ts's languageFolderName(), default export template
  // "{book}_{folderSuffix}").
  const exportedFile = path.join(fixture.scanRoot, fixture.bookName, `${fixture.bookName}_${fixture.languageFolderSuffix}`, `${fixture.page}.png`);
  await expect(async () => {
    const stat = await fs.stat(exportedFile);
    expect(stat.size).toBeGreaterThan(0);
  }).toPass({ timeout: 10_000 });
});
