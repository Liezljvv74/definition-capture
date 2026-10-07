// spec: e2e/specs/tutor.plan.md
// seed: e2e/tutor/seed.ts
import { test, expect } from "../fixtures";
import { choose, openLanguage, study } from "../language";
import { removeSeeded, seedConversation } from "./seed";

// No question is sent: the conversations are written straight into the local
// database. The search step embeds its query, a fraction of a cent.
test.beforeEach(async ({ page }) => {
  await openLanguage(page);
  await choose(page, "German");
});
test.afterEach(async ({ page }) => {
  await removeSeeded();
  await study(page, "Not chosen");
});

test.describe("Tutor conversations", () => {
  test("open, tick, rename, delete and search", async ({ page }) => {
    const { id } = await seedConversation("E2E dative", [
      { question: "When is the dative used?", title: "Dative after mit", text: "Use the dative after mit, nach and bei." },
      { question: "And with two-way prepositions?", title: "Two-way prepositions", text: "In with the dative says where something is." },
    ]);

    // 1. The conversation is in the sidebar and opens from its address.
    await page.goto(`/tutor?c=${id}`);
    const sidebar = page.getByRole("complementary", { name: "Conversations" });
    await expect(sidebar.getByRole("link", { name: "E2E dative" })).toHaveAttribute("aria-current", "page");
    await expect(page.getByRole("heading", { name: "Dative after mit" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Duden" }).first()).toBeVisible();

    // 2. Ticking two answers offers one rule from them; Clear takes it away.
    const ticks = page.getByRole("checkbox", { name: "Include in a rule" });
    await ticks.nth(0).check();
    await expect(page.getByRole("button", { name: /Make one rule/ })).toHaveCount(0);
    await ticks.nth(1).check();
    await expect(page.getByRole("button", { name: "Make one rule from 2 answers" })).toBeVisible();
    await page.getByRole("button", { name: "Clear" }).click();
    await expect(page.getByRole("button", { name: /Make one rule/ })).toHaveCount(0);

    // 3. Search finds it by a word in an answer, and leads to it.
    await page.getByRole("searchbox", { name: "Search conversations" }).fill("nach");
    await expect(sidebar.getByText("E2E dative")).toBeVisible();
    await page.getByRole("searchbox", { name: "Search conversations" }).fill("");

    // 4. Rename from its menu.
    await sidebar.getByLabel("Actions for E2E dative").click();
    await sidebar.getByRole("button", { name: "Rename" }).click();
    await sidebar.getByRole("textbox", { name: "Name" }).fill("E2E renamed");
    await sidebar.getByRole("textbox", { name: "Name" }).press("Enter");
    await page.reload();
    await expect(sidebar.getByRole("link", { name: "E2E renamed" })).toBeVisible();

    // 5. Delete, confirmed, and it is gone.
    await sidebar.getByLabel("Actions for E2E renamed").click();
    await sidebar.getByRole("button", { name: "Delete" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Delete" }).click();
    await expect(page).toHaveURL(/\/tutor\/?$/);
    await expect(sidebar.getByRole("link", { name: "E2E renamed" })).toHaveCount(0);
  });

  test("a conversation that is not there", async ({ page }) => {
    await page.goto("/tutor?c=00000000-0000-0000-0000-000000000000");
    await expect(page.getByText("That conversation was not found.")).toBeVisible();
    await expect(page.getByLabel("Your question")).toBeVisible();
  });
});
