import { test as baseTest, expect } from "@playwright/test";
export { expect } from "@playwright/test";

/**
 * Every test starts signed in to the dedicated test account, through the real
 * sign-in form, so the proxy's session check is exercised on every run rather
 * than bypassed with a saved cookie.
 *
 * The account must be a throwaway: local development and production share one
 * Supabase project, and the tests add and delete rows in it.
 */
export const test = baseTest.extend({
  page: async ({ page, baseURL }, use, testInfo) => {
    // The live project's sign-in is behind a captcha that a script cannot
    // solve. These tests need the local Supabase copy, where it is off, with
    // `.env.development.local` pointing the app at it (see CLAUDE.md).
    testInfo.skip(
      !/^https?:\/\/(localhost|127\.0\.0\.1)(:|\/|$)/.test(baseURL ?? ""),
      "Signed-in end-to-end tests run on localhost only: production sign-in is protected by captcha.",
    );
    const email = process.env.E2E_EMAIL;
    const password = process.env.E2E_PASSWORD;
    if (!email || !password) {
      throw new Error("Set E2E_EMAIL and E2E_PASSWORD in .env.local to a test account.");
    }

    await page.goto("/sign-in");
    await page.getByRole("textbox", { name: "Email address" }).fill(email);
    await page.getByRole("textbox", { name: "Password" }).fill(password);
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page).not.toHaveURL(/\/sign-in/);

    await use(page);
  },
});
