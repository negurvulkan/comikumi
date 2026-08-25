import { test, expect } from "@playwright/test";
import { readFixture, loginViaUi } from "./helpers";

test("logs in through the UI and lands on the volume list", async ({ page }) => {
  const fixture = await readFixture();

  // No token injected — this is the one spec that genuinely drives the login screen;
  // the other specs skip it via injectAuthToken() to stay fast (see helpers.ts).
  await page.goto("/");
  await expect(page).toHaveURL(/#\/login/);

  await loginViaUi(page, fixture.username, fixture.password);

  await expect(page).not.toHaveURL(/#\/login/);
  await expect(page.locator("a.card", { hasText: fixture.bookName })).toBeVisible();
});
