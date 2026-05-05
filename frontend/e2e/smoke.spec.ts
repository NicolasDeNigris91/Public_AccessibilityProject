import { test, expect } from "@playwright/test";

test.describe("smoke", () => {
  test("landing renders the brand and CTA without runtime errors", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (err) => errors.push(err.message));

    await page.goto("/");
    await expect(page).toHaveTitle(/Euthus/);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

    expect(errors).toEqual([]);
  });

  test("dashboard form is present and SkipLink is keyboard-reachable", async ({ page }) => {
    await page.goto("/app");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(page.locator("input[type=url]")).toBeVisible();
    // SkipLink should appear on first Tab.
    await page.keyboard.press("Tab");
    const focused = page.locator(":focus");
    await expect(focused).toBeVisible();
  });
});
