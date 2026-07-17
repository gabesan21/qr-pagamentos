import { expect, test } from "@playwright/test";

test("launches the pinned Chromium against the design-system specimen", async ({ page }) => {
  await page.goto("/design-system");
  await expect(page.locator("h1")).toBeVisible();
});
