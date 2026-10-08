// spec: e2e/specs/tutor.plan.md
// seed: e2e/tutor/seed.ts
import { test, expect } from "../fixtures";
import { study } from "../language";
import { removeSeeded, seedConversation } from "./seed";

const RULES = ["E2E rule one", "E2E rule two", "E2E rule three"];

test.beforeEach(async ({ page }) => {
  await study(page, "German");
});
test.afterEach(async ({ page }) => {
  await removeSeeded(RULES);
  await study(page, "Not chosen");
});

async function saveAs(page: import("@playwright/test").Page, answer: number, title: string) {
  await page.getByRole("button", { name: "Save as rule" }).nth(answer).click();
  await page.getByLabel("Title").fill(title);
}

test("rules saved from a conversation link to each other across visits, and to any other rule", async ({ page }) => {
  const a = await seedConversation("E2E link A", [
    { question: "q1", title: "Dative", text: "Use the dative after mit." },
    { question: "q2", title: "Dative again", text: "Also after nach." },
  ]);
  const b = await seedConversation("E2E link B", [{ question: "q3", title: "Genitive", text: "Use the genitive after wegen." }]);

  // 1. Save the first answer of A as a rule.
  await page.goto(`/tutor?c=${a.id}`);
  await saveAs(page, 0, RULES[0]);
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByText("Saved.")).toBeVisible();
  await page.getByRole("button", { name: "Close" }).last().click();
  // The link is recorded after the rule's own save; let both finish before leaving.
  await page.waitForLoadState("networkidle");

  // 2. The saved answer now offers its rule, not a second save, and still
  // does when the conversation is opened again; the only Save as rule left is
  // the second answer's.
  await expect(page.getByRole("link", { name: `Open “${RULES[0]}”` })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("link", { name: `Open “${RULES[0]}”` })).toBeVisible();
  await expect(page.getByRole("button", { name: "Save as rule" })).toHaveCount(1);
  // The next rule from A links to the first automatically.
  await saveAs(page, 0, RULES[1]);
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByText(`Saved, linked to “${RULES[0]}”.`)).toBeVisible();
  await page.getByRole("button", { name: "Close" }).last().click();

  // 3. In B, which saved nothing, Link another rule finds A's rule by its text.
  await page.goto(`/tutor?c=${b.id}`);
  await saveAs(page, 0, RULES[2]);
  await page.getByLabel("Link another rule").fill("mit");
  await page.getByRole("button", { name: new RegExp(RULES[0]) }).click();
  await expect(page.getByRole("checkbox", { name: RULES[0] })).toBeChecked();
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByText(`Saved, linked to “${RULES[0]}”.`)).toBeVisible();
});
