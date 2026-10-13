// spec: e2e/specs/home.plan.md
// seed: e2e/seed.spec.ts
import { test, expect } from "../fixtures";

test.describe("Home", () => {
  test("dashboard", async ({ page }) => {
    // 1. Sign in and land on the dashboard
    // (the fixture signs in; sign-in now lands on /home)
    await expect(page).toHaveURL(/\/home\/?$/);
    await expect(page.getByRole("heading", { level: 1, name: /^Welcome back/ })).toBeVisible();
    await expect(page.getByText("Ready for review")).toBeVisible();

    // 2. The demo video is on the page
    await expect(page.getByRole("heading", { name: "See it in use" })).toBeVisible();

    // 3. Open Vocabulary from the main menu
    await page.getByRole("navigation", { name: "Main" }).getByRole("button", { name: "Glossary" }).click();
    await page.getByRole("menuitem", { name: "Vocabulary" }).click();
    await expect(page.getByRole("heading", { name: "Vocabulary", level: 1 })).toBeVisible();
  });
});
