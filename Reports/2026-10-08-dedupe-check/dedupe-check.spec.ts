// The browser check run on 8 October 2026 on the `dedupe` branch (PR #55),
// beside the full e2e suite and Reports/2026-10-08-rename-check/live-check.spec.ts;
// the outcome is in 2026-10-08-dedupe-check.pdf beside this file.
//
// It lives here, outside `e2e/`, as the rename check does: it is a one-off
// record, not part of `npm run e2e`. To run it again, copy it into `e2e/`, fix
// the two imports to "./fixtures" and "./language", set up the local stack as
// CLAUDE.md describes, run `npx playwright test e2e/dedupe-check.spec.ts`, then
// delete the copy. On a slow machine give it a longer expect timeout.
import type { Page } from "@playwright/test";

import { test, expect } from "../../e2e/fixtures";
import { study } from "../../e2e/language";

test.setTimeout(600_000);

const stamp = Date.now().toString(36);
const W1 = `Zeitung${stamp}`;
const W2 = `Fenster${stamp}`;
const ADD = /Add (your first )?word/;

async function addWord(page: Page, word: string, definition: string) {
  await page.goto("/vocabulary");
  await page.getByRole("button", { name: ADD }).first().click();
  const dialog = page.getByRole("dialog", { name: "Add a word" });
  await expect(dialog).toBeVisible();
  // autoFocus survives the native dialog.
  await expect(dialog.getByRole("textbox").first()).toBeFocused();
  await dialog.getByRole("textbox").first().fill(word);
  await dialog.getByLabel("Definition").fill(definition);
  await dialog.getByRole("button", { name: "Save word" }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByText(word).first()).toBeVisible();
}

test("pages load, and dialogs, lists, edit, backup and settings behave", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(`${page.url()}: ${e.message}`));
  page.on("console", (m) => { if (m.type() === "error") errors.push(`${page.url()}: ${m.text()}`); });

  for (const path of ["/home", "/vocabulary", "/phrases", "/verbs", "/verbs/practise", "/grammar", "/flashcards", "/tutor", "/settings"]) {
    const response = await page.goto(path);
    expect(response?.status(), path).toBeLessThan(400);
    await page.waitForLoadState("networkidle");
    await expect(page.locator("main").first(), path).toBeVisible();
  }

  await addWord(page, W1, "newspaper");
  await addWord(page, W2, "window");

  // Modal: Escape closes; a drag from the card to the backdrop does not; a backdrop press does.
  const dialog = page.getByRole("dialog", { name: "Add a word" });
  await page.getByRole("button", { name: ADD }).first().click();
  await expect(dialog).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();

  await page.getByRole("button", { name: ADD }).first().click();
  await expect(dialog).toBeVisible();
  const box = (await dialog.getByLabel("Definition").boundingBox())!;
  await page.mouse.move(box.x + 5, box.y + 5);
  await page.mouse.down();
  await page.mouse.move(3, 3);
  await page.mouse.up();
  await expect(dialog).toBeVisible();
  await page.mouse.click(3, 3);
  await expect(dialog).toBeHidden();

  // RefField: Escape closes the suggestion list first, then the dialog.
  // On main before PR #55 one Escape closed both; Modal now listens on window.
  await page.getByRole("button", { name: ADD }).first().click();
  await expect(dialog).toBeVisible();
  await dialog.getByRole("combobox", { name: "Ref" }).fill(W1.slice(0, 6));
  await expect(page.getByRole("listbox")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("listbox")).toBeHidden();
  await expect(dialog).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();

  // Add finds the word saved and opens the real Edit dialog with the note,
  // which now refuses a rename onto another saved word (it used to skip that).
  await page.getByRole("button", { name: ADD }).first().click();
  await dialog.getByRole("textbox").first().fill(W1);
  await dialog.getByLabel("Definition").fill("a daily paper");
  await dialog.getByRole("button", { name: "Save word" }).click();
  await expect(page.getByRole("dialog", { name: "That word is already saved" })).toBeVisible();
  await page.getByRole("button", { name: "Open it for editing" }).click();
  const edit = page.getByRole("dialog", { name: "Edit word" });
  await expect(edit).toBeVisible();
  await expect(edit.getByText("What you just typed")).toBeVisible();
  await expect(edit.getByText("a daily paper")).toBeVisible();
  await edit.getByRole("textbox").first().fill(W2);
  await edit.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByText(/already saved separately/)).toBeVisible();
  await page.keyboard.press("Escape");

  // Sorting and searching the list still work.
  await page.goto("/vocabulary");
  await page.getByRole("button", { name: /^Word/ }).first().click();
  await page.getByRole("searchbox").first().fill(W2);
  await expect(page.getByText(W2).first()).toBeVisible();
  await expect(page.getByText(W1)).toHaveCount(0);

  // The word's own page still shows it, through the shared frame.
  await page.getByRole("link", { name: W2 }).first().click();
  await expect(page.getByRole("link", { name: /Back to/ })).toBeVisible();
  await expect(page.getByText("window")).toBeVisible();

  // Export and Import dialogs open; Import reads a file and previews it.
  await page.getByRole("button", { name: "Backup" }).click();
  await page.getByRole("menuitem", { name: /Export…/ }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toBeHidden();
  const backup = JSON.stringify({ format: "definition-capture-backup", version: 10, words: [{ word: W1, definition: "x" }, { word: `Neu${stamp}`, definition: "y" }] });
  await page.locator('input[type="file"]').setInputFiles({ name: "b.json", mimeType: "application/json", buffer: Buffer.from(backup) });
  const imp = page.getByRole("dialog", { name: "Import a backup" });
  await expect(imp).toBeVisible();
  await expect(imp.getByText(/^2 words: 1 new to you, 1 of your \d+ already saved\.$/)).toBeVisible();
  await expect(imp.getByRole("radio")).toHaveCount(3);
  await page.keyboard.press("Escape");

  // Settings: the studied language picker.
  await study(page, "German");
  await page.goto("/settings?section=glossary");
  await expect(page.getByLabel("Language you are learning")).toHaveValue(/.+/);

  // Delete the two words through the shared delete flow.
  await page.goto("/vocabulary");
  await page.getByRole("searchbox").first().fill(stamp);
  await page.getByRole("checkbox", { name: /Select all/ }).first().check();
  await page.getByRole("button", { name: /^Delete/ }).first().click();
  const confirm = page.getByRole("dialog", { name: /Delete/ });
  await expect(confirm).toBeVisible();
  await confirm.getByRole("button", { name: "Delete" }).click();
  await expect(page.getByText(W1)).toHaveCount(0);
  await study(page, "Not chosen");

  expect(errors).toEqual([]);
});
