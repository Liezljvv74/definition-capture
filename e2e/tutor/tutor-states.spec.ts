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

// Picks a language and waits until Settings shows it saved: the write is
// optimistic, so navigating at once could leave the page that follows reading
// the old value. The section summary renders the saved name, or "Not chosen".
async function choose(page: Page, name: string) {
  await language(page).selectOption({ label: name });
  const summary = page.getByRole("heading", { name: "Language", exact: true }).locator("xpath=following-sibling::p");
  await expect(summary).toHaveText(name);
}

test.afterEach(async ({ page }) => {
  await openLanguage(page);
  const select = language(page);
  if ((await select.inputValue()) !== "") await choose(page, "Not chosen");
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

    // 3. The tutor now offers the question box and the full trial allowance
    await page.goto("/tutor");
    await expect(page.getByLabel("Your question")).toBeVisible();
    await expect(page.getByText("5 trial messages left")).toBeVisible();
  });
});
