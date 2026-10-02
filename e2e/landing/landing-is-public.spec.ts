// spec: e2e/specs/home.plan.md
// No fixture: this is what a signed-out visitor, or a crawler, gets.
import { test, expect } from "@playwright/test";

test.describe("Home", () => {
  test("landing-is-public", async ({ page, request }) => {
    // 1. Open / without signing in
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1, name: "Your personal repository for learning any language" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Create an account" }).first()).toBeVisible();

    // 2. Request /robots.txt, /sitemap.xml and /llms.txt
    for (const path of ["/robots.txt", "/sitemap.xml", "/llms.txt"]) {
      const response = await request.get(path, { maxRedirects: 0 });
      expect(response.status(), path).toBe(200);
    }
  });
});
