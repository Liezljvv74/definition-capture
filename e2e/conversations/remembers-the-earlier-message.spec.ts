// spec: e2e/specs/conversations.plan.md
// seed: e2e/seed.spec.ts
import { test, expect } from "../fixtures";
import { study } from "../language";
import { send, startNew } from "./chat";

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
  test("remembers-the-earlier-message", async ({ page }) => {
    // 1. Open /conversations and start a new conversation
    await startNew(page);

    // 2. Send a grammar question with a clear subject
    const first = await send(page, "In one short sentence, what is the German dative case for?");
    expect(first.length).toBeGreaterThan(0);

    // 3. A follow-up that names no subject: only the earlier turn says what "that" is
    const second = await send(page, "Say that again more simply.");
    expect(second).toMatch(/dativ|indirect|to whom|receiv|dem\b|give|gets?\b/i);
    expect(second).not.toBe(first);
  });
});
