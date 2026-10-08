import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

/**
 * Vitest rather than Jest because the stack decides it: `tsconfig.json` is
 * ESM with `"moduleResolution": "bundler"`, which Vitest reads natively and
 * Jest would need a transform to fake.
 *
 * Vitest 5 (with `@types/node` 22, the runtime being Node 24), moved up from
 * 3 on 7 October 2026: 3 pulled in tinypool and @vitest/mocker with critical
 * and moderate advisories.
 */
export default defineConfig({
  resolve: {
    alias: {
      // The `@/*` path from tsconfig.json, repeated here rather than read by a
      // plugin: one line is less to maintain than a dependency.
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      // `server-only` throws unless imported under React's server condition,
      // which Next applies and a test run does not; its own empty module is
      // what Next resolves it to on the server.
      "server-only": fileURLToPath(new URL("./node_modules/server-only/empty.js", import.meta.url)),
    },
  },
  test: {
    // Node by default: everything worth testing first is a pure function.
    // The two files that need a DOM opt in per-file with a
    // `@vitest-environment` comment, which stays stable across Vitest
    // majors in a way the config-level globs have not.
    environment: "node",
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
  },
});
