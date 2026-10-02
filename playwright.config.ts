import { defineConfig, devices } from "@playwright/test";

// The test account's credentials live in `.env.local` beside the Supabase
// values, so nothing secret is committed. Node's own loader rather than
// dotenv: one call, no new dependency. A missing file is fine, because CI
// would set the variables directly.
try {
  process.loadEnvFile(".env.local");
} catch {}

/**
 * End-to-end tests, kept in `e2e/` so Vitest (which only reads `src/`) and
 * Playwright never pick up each other's files.
 *
 * They run against production by default, because that is where changes are
 * tried; local development and production share one Supabase project, so
 * localhost would not touch less real data anyway. Point them elsewhere with
 * `E2E_BASE_URL=http://localhost:3000` and a running `npm run dev`.
 */
export default defineConfig({
  testDir: "./e2e",
  // Every test signs in to the same account and edits its lists, so running
  // two at once would let one test's rows show up in another's assertions.
  workers: 1,
  fullyParallel: false,
  retries: process.env.CI ? 2 : 0,
  reporter: "html",
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "https://definition-capture.vercel.app",
    trace: "on-first-retry",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
