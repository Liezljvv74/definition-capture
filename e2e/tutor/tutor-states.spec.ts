// spec: e2e/specs/tutor.plan.md
// seed: e2e/seed.spec.ts
import { test, expect } from "../fixtures";
import { choose, openLanguage, study } from "../language";

// No question is ever sent: an answer costs real money, so this covers the
// page's states only. The studied language is put back to "Not chosen" even
// when an assertion fails, so the next run starts from the same place.
test.afterEach(async ({ page }) => {
  await study(page, "Not chosen");
});

test.describe("Tutor", () => {
  test("tutor-states", async ({ page }) => {
    // 1. With no studied language, the page points at Settings and has no question box
    await openLanguage(page);
    await choose(page, "Not chosen");
    await page.goto("/tutor");
    await expect(page.getByRole("link", { name: "Choose the language you are studying" })).toBeVisible();
    await expect(page.getByLabel("Your question")).toHaveCount(0);

    // 2. Choose German in Settings
    await openLanguage(page);
    await choose(page, "German");

    // 3. The tutor now offers the question box and the allowance left. Either
    // plan's wording, since the local account may be on either.
    await page.goto("/tutor");
    await expect(page.getByLabel("Your question")).toBeVisible();
    await expect(page.getByText(/^\d+ (trial messages? left|left today)$/)).toBeVisible();
  });
});
