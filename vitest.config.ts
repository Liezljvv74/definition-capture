import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

/**
 * Vitest rather than Jest because the stack decides it: `tsconfig.json` is
 * ESM with `"moduleResolution": "bundler"`, which Vitest reads natively and
 * Jest would need a transform and a second copy of the path alias to fake.
 *
 * Vitest is pinned to 3 rather than the current 5 deliberately. 5 requires
 * `@types/node` 22 or newer, this project pins ^20, and bumping the type
 * baseline of the whole app to install a test runner is the tail wagging the
 * dog. (The runtime here is actually Node 24, so those types are already
 * behind — worth correcting one day, as its own change.)
 */
export default defineConfig({
  // Reads the `@/*` alias straight out of tsconfig.json, so the alias is
  // defined in exactly one place and cannot drift from the app's.
  plugins: [tsconfigPaths()],
  test: {
    // Node by default: everything worth testing first is a pure function.
    // The two files that need a DOM opt in per-file with a
    // `@vitest-environment` comment, which stays stable across Vitest
    // majors in a way the config-level globs have not.
    environment: "node",
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
  },
});
