import { test, expect } from "@playwright/test";
import { readFixture, injectAuthToken } from "./helpers";

const PROJECT_NAME = "E2E Test Project";

test("opens the fixture project from the project switcher and sees its volume", async ({ page }) => {
  const fixture = await readFixture();
  await injectAuthToken(page, fixture.token);

  await page.goto("/#/project");
  const card = page.locator(".project-card", { hasText: PROJECT_NAME });
  await expect(card).toBeVisible();

  await card.locator(".project-card-open").click();

  await expect(page).toHaveURL(/#\/$/);
  await expect(page.locator("a.card", { hasText: fixture.bookName })).toBeVisible();
});
