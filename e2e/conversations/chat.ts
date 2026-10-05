import type { Page } from "@playwright/test";
import { expect } from "../fixtures";

/** The turns shown, without the "Thinking…" line that stands in for a reply on its way. */
export const turns = (page: Page) => page.locator("main ol > li").filter({ hasNotText: "Thinking…" });

/** Clears the saved conversation, so a test starts from nothing and leaves nothing behind. */
export async function startNew(page: Page) {
  await page.goto("/conversations");
  await page.getByRole("button", { name: "New conversation" }).click();
  await expect(turns(page)).toHaveCount(0);
}

/**
 * Sends a message and waits for its reply: the turns grow by two, the message
 * and the answer. A real model answers, so the wait is long.
 */
export async function send(page: Page, message: string): Promise<string> {
  const before = await turns(page).count();
  await page.getByLabel("Your message").fill(message);
  await page.getByRole("button", { name: "Send" }).click();
  await expect(turns(page)).toHaveCount(before + 2, { timeout: 90_000 });
  return (await turns(page).nth(before + 1).innerText()).trim();
}
