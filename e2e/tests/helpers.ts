import fs from "node:fs/promises";
import path from "node:path";
import type { Page } from "@playwright/test";
import { expect } from "@playwright/test";
import type { FixtureData } from "../global-setup";
import { TMP_DIR } from "../playwright.config";

// authFetch.ts's localStorage key — see client/src/api/authFetch.ts.
const TOKEN_KEY = "comikumi.authToken";

export async function readFixture(): Promise<FixtureData> {
  const raw = await fs.readFile(path.join(TMP_DIR, "fixture.json"), "utf-8");
  return JSON.parse(raw) as FixtureData;
}

/** Sets the auth token before any app script runs, so screens 2-4's specs can start
 * straight from an authenticated state without repeating the (already separately
 * tested, see auth.spec.ts) UI login flow on every run. */
export async function injectAuthToken(page: Page, token: string): Promise<void> {
  await page.addInitScript(
    ([key, value]) => window.localStorage.setItem(key, value),
    [TOKEN_KEY, token] as [string, string]
  );
}

export async function loginViaUi(page: Page, username: string, password: string): Promise<void> {
  await page.getByLabel("Username").fill(username);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Log in" }).click();
}

/** Draws a shape on the Konva page canvas by dragging from one corner to another,
 * relative to the canvas element's own bounding box — the canvas has no per-shape DOM
 * nodes, so this is the only way to trigger PageCanvas.tsx's draw-tool mouse handlers. */
export async function dragOnCanvas(page: Page, from: { x: number; y: number }, to: { x: number; y: number }): Promise<void> {
  const canvas = page.locator(".canvas-viewport canvas").first();
  const box = await canvas.boundingBox();
  if (!box) throw new Error("Canvas not visible");
  await page.mouse.move(box.x + from.x, box.y + from.y);
  await page.mouse.down();
  await page.mouse.move(box.x + to.x, box.y + to.y, { steps: 5 });
  await page.mouse.up();
}

export async function clickOnCanvas(page: Page, at: { x: number; y: number }): Promise<void> {
  const canvas = page.locator(".canvas-viewport canvas").first();
  const box = await canvas.boundingBox();
  if (!box) throw new Error("Canvas not visible");
  await page.mouse.click(box.x + at.x, box.y + at.y);
}

export async function waitForEditorLoaded(page: Page): Promise<void> {
  await expect(page.getByText("Loading page…")).toHaveCount(0, { timeout: 15_000 });
  await expect(page.locator(".toolstrip")).toBeVisible();
}
