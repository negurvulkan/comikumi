import { test, expect } from "@playwright/test";
import { readFixture, injectAuthToken, dragOnCanvas, clickOnCanvas, waitForEditorLoaded } from "./helpers";

const BUBBLE_TEXT = "E2E test bubble";

test("creates a bubble, sets its text, saves, and the text survives a reload", async ({ page }) => {
  const fixture = await readFixture();
  await injectAuthToken(page, fixture.token);

  await page.goto(`/#/volumes/${fixture.volumeId}/pages/${fixture.page}`);
  await waitForEditorLoaded(page);

  await page.getByTitle("Bubble (oval)").click();
  await dragOnCanvas(page, { x: 80, y: 80 }, { x: 260, y: 220 });

  const textarea = page.locator(".inspector textarea").first();
  await expect(textarea).toBeVisible();
  await textarea.fill(BUBBLE_TEXT);

  // Force an immediate save via the menu instead of waiting out the autosave interval —
  // see MenuBar → "Page" → "Save" in Editor.tsx.
  await page.getByRole("button", { name: "Page", exact: true }).click();
  await page.locator(".menu-dropdown .menu-item", { hasText: "Save" }).click();
  await expect(page.locator(".pill")).toHaveText("Saved", { timeout: 10_000 });

  await page.reload();
  await waitForEditorLoaded(page);

  // Nothing is selected right after a fresh load — re-select the bubble by clicking its
  // drawn position (same coordinates it was drawn at, since geometry now persisted) to
  // bring the inspector back before reading its value.
  await clickOnCanvas(page, { x: 170, y: 150 });
  await expect(page.locator(".inspector textarea").first()).toHaveValue(BUBBLE_TEXT);
});
