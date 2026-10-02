// spec: e2e/specs/vocabulary.plan.md
// seed: e2e/seed.spec.ts
import { test, expect } from "../fixtures";

// Unique per run, so a word left behind by a crashed run can never satisfy
// this run's assertions.
const word = `e2e-${Date.now()}`;
const definition = "A word added by the end-to-end test.";

// The test account is real data in the shared Supabase project. If the test
// fails between saving and deleting, remove the word here so failed runs do
// not pile up in the list.
test.afterEach(async ({ page }) => {
  const remove = page.getByRole("button", { name: `Delete ${word}` });
  if (await remove.isVisible()) {
    await remove.click();
    await page.getByRole("button", { name: "Delete word" }).click();
  }
});

test.describe("Vocabulary", () => {
  test("add-search-and-delete-a-word", async ({ page }) => {
    const search = page.getByRole("searchbox", { name: "Search words and definitions" });
    const wordLink = page.getByRole("link", { name: word });

    // 1. Go to Vocabulary
    await page.goto("/vocabulary");
    await expect(page.getByRole("heading", { name: "Vocabulary", level: 1 })).toBeVisible();

    // 2. Click "Add word", type a unique word and a definition, click "Save word"
    await page.getByRole("button", { name: "Add word" }).click();
    await page.getByRole("textbox", { name: "Word *" }).fill(word);
    await page.getByRole("textbox", { name: "Definition" }).fill(definition);
    await page.getByRole("button", { name: "Save word" }).click();
    await expect(page.getByRole("dialog", { name: "Add a word" })).toBeHidden();
    await expect(
      page.getByRole("row", { name: word }).getByRole("cell", { name: definition }),
    ).toBeVisible();

    // 3. Reload the page and type the word into the search box
    await page.reload();
    await search.fill(word);
    await expect(wordLink).toBeVisible();
    await expect(page.getByText(/words? shown$/)).toHaveText(/^1 of \d+ words? shown$/);

    // 4. Click the word's Delete button, then "Delete word" in the dialog
    await page.getByRole("button", { name: `Delete ${word}` }).click();
    await page.getByRole("button", { name: "Delete word" }).click();
    await expect(wordLink).toBeHidden();
    await expect(page.getByRole("heading", { name: "No words match those filters" })).toBeVisible();

    // 5. Reload the page
    // Waiting for the empty state rather than for the row to be hidden: just
    // after a reload the row is hidden because nothing has loaded yet, so a
    // hidden check alone would pass even if the delete never reached the
    // database.
    await page.reload();
    await search.fill(word);
    await expect(page.getByRole("heading", { name: "No words match those filters" })).toBeVisible();
    await expect(wordLink).toBeHidden();
  });
});
