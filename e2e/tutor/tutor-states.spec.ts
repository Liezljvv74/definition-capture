// spec: e2e/specs/tutor.plan.md
// seed: e2e/seed.spec.ts
import type { Page } from "@playwright/test";
import { test, expect } from "../fixtures";

// No question is ever sent: an answer costs real money, so this covers the
// page's states only. The studied language is put back to "Not chosen" even
// when an assertion fails, so the next run starts from the same place.
const language = (page: Page) => page.getByLabel("Language you are learning");

// The Language section is folded away until its pencil is pressed.
async function openLanguage(page: Page) {
  await page.goto("/settings?section=glossary");
  await page.getByRole("button", { name: "Edit Language" }).click();
  await expect(language(page)).toBeEnabled();
}

test.afterEach(async ({ page }) => {
  await openLanguage(page);
  const select = language(page);
  if ((await select.inputValue()) !== "") await select.selectOption({ label: "Not chosen" });
});

test.describe("Tutor", () => {
  test("tutor-states", async ({ page }) => {
    // 1. With no studied language, the page points at Settings and has no question box
    await openLanguage(page);
    await language(page).selectOption({ label: "Not chosen" });
    await page.goto("/tutor");
    await expect(page.getByRole("link", { name: "Choose the language you are studying" })).toBeVisible();
    await expect(page.getByLabel("Your question")).toHaveCount(0);

    // 2. Choose German in Settings
    await openLanguage(page);
    await language(page).selectOption({ label: "German" });

    // 3. The tutor now offers the question box and the full trial allowance
    await page.goto("/tutor");
    await expect(page.getByLabel("Your question")).toBeVisible();
    await expect(page.getByText("5 trial messages left")).toBeVisible();
  });
});
