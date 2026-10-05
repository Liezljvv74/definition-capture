// spec: e2e/specs/conversations.plan.md
// seed: e2e/seed.spec.ts
import { test, expect } from "../fixtures";
import { study } from "../language";
import { send, startNew, turns } from "./chat";

// Real messages to a real model: each answer can take a while.
test.setTimeout(240_000);

// Conversations keeps to the grammar of the studied language, so one is set
// first and put back to "Not chosen" after, as the tutor test leaves it.
test.beforeEach(async ({ page }) => {
  await study(page, "German");
});

test.afterEach(async ({ page }) => {
  await startNew(page);
  await study(page, "Not chosen");
});

test.describe("Conversations", () => {
  test("survives-a-reload", async ({ page }) => {
    // 1. Open /conversations and start a new conversation
    await startNew(page);

    // 2. Send two messages, each waiting for its reply
    await send(page, "Which article does the German word Aprikose take?");
    await send(page, "And what is its plural?");

    // 3. Reload: the saved conversation is read back from the database
    await page.reload();
    await expect(turns(page)).toHaveCount(4);
    await expect(turns(page).nth(0)).toContainText("Which article does the German word Aprikose take?");
    await expect(turns(page).nth(2)).toContainText("And what is its plural?");
  });
});
