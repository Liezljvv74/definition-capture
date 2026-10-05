import type { Page } from "@playwright/test";
import { expect } from "./fixtures";

/**
 * The studied language under Settings, which the tutor and Conversations both
 * need. Shared by their tests, so each can set it and put it back to "Not
 * chosen" afterwards, and every run starts from the same place.
 */
export const language = (page: Page) => page.getByLabel("Language you are learning");

// The Language section is folded away until its pencil is pressed.
export async function openLanguage(page: Page) {
  await page.goto("/settings?section=glossary");
  await page.getByRole("button", { name: "Edit Language" }).click();
  await expect(language(page)).toBeEnabled();
}

// Picks a language and waits until Settings shows it saved: the write is
// optimistic, so navigating at once could leave the page that follows reading
// the old value. The section summary renders the saved name, or "Not chosen".
export async function choose(page: Page, name: string) {
  await language(page).selectOption({ label: name });
  const summary = page.getByRole("heading", { name: "Language", exact: true }).locator("xpath=following-sibling::p");
  await expect(summary).toHaveText(name);
}

/** Sets the studied language to `name`, from wherever the page is. */
export async function study(page: Page, name: string) {
  await openLanguage(page);
  if ((await language(page).inputValue()) === "" && name === "Not chosen") return;
  await choose(page, name);
}
