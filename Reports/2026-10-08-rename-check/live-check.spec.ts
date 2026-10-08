// The check run on 8 October 2026 after the project folder was renamed to
// Captured; the outcome is in 2026-10-08-rename-check.pdf beside this file.
//
// It lives here, outside `e2e/`, on purpose: unlike the suite there it calls
// the real tutor, which costs money on every run, so `npm run e2e` must never
// pick it up. To run it again, copy it into `e2e/`, fix the two imports to
// "./fixtures" and "./language", set up the local stack as CLAUDE.md describes
// (the account needs messages left), run
// `npx playwright test e2e/live-check.spec.ts`, then delete the copy.
import { test, expect } from "../../e2e/fixtures";
import { study } from "../../e2e/language";

test.setTimeout(600_000);

test("every workspace page loads without errors", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(`${page.url()}: ${e.message}`));
  page.on("console", (m) => { if (m.type() === "error") errors.push(`${page.url()}: ${m.text()}`); });
  for (const path of ["/home", "/vocabulary", "/phrases", "/verbs", "/verbs/practise", "/grammar", "/flashcards", "/tutor", "/settings"]) {
    const response = await page.goto(path);
    expect(response?.status(), path).toBeLessThan(400);
    await page.waitForLoadState("networkidle");
    await expect(page.locator("main"), path).toBeVisible();
    await expect(page.getByText(/something went wrong|application error/i), path).toHaveCount(0);
  }
  expect(errors).toEqual([]);
});

test("the real tutor answers, merges and saves a rule", async ({ page }) => {
  await study(page, "German");
  await page.goto("/tutor");
  const allowance = page.getByText(/^\d+ (trial messages? left|left today)$/);
  const before = Number((await allowance.textContent())!.match(/\d+/)![0]);

  const questions = [
    "When do I use the dative case after prepositions?",
    "Which prepositions always take the accusative case?",
  ];
  for (const [i, q] of questions.entries()) {
    await page.getByLabel("Your question").fill(q);
    await page.getByRole("button", { name: "Ask" }).click();
    await expect(page.getByRole("button", { name: "Save as rule" })).toHaveCount(i + 1, { timeout: 180_000 });
    // Asking again before the page has moved to the conversation's address
    // loses the next answer from view until a reload (see HANDOFF.md).
    await expect(page).toHaveURL(/[?&]c=/);
    await page.waitForLoadState("networkidle");
  }
  await expect(page.getByText(/couldn.t|failed|not available/i)).toHaveCount(0);
  const after = Number((await allowance.textContent())!.match(/\d+/)![0]);
  expect(after).toBe(before - 2);

  // Merge the two answers into one rule with the real model, then save it.
  const boxes = page.getByRole("checkbox", { name: "Include in a rule" });
  await boxes.nth(0).check();
  await boxes.nth(1).check();
  await page.getByRole("button", { name: "Make one rule from 2 answers" }).click();
  await expect(page.getByRole("button", { name: "Discard" })).toBeVisible({ timeout: 180_000 });
  await page.getByRole("button", { name: "Save as rule" }).last().click();
  const title = `Live check ${Date.now()}`;
  await page.getByLabel("Title").fill(title);
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByText(/^Saved/)).toBeVisible();
  await page.getByRole("button", { name: "Close" }).last().click();
  await page.waitForLoadState("networkidle");

  // The Grammar page lists it, inside a topic group that may be folded away.
  await page.goto("/grammar");
  await expect(page.locator(`a[title="${title}"]`)).toBeAttached();
  await study(page, "Not chosen");
});

test("search finds the saved conversations", async ({ page }) => {
  await page.goto("/tutor");
  const searchDone = page.waitForResponse((r) => r.url().includes("/api/tutor/search"), { timeout: 60_000 });
  await page.getByLabel("Search conversations").fill("Akkusativ Präpositionen");
  const response = await searchDone;
  expect(response.status()).toBe(200);
  expect(((await response.json()) as { results: unknown[] }).results.length).toBeGreaterThan(0);
  await expect(page.getByText(/Search is not available|Too many searches/)).toHaveCount(0);
});
