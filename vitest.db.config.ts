import { readFileSync } from "node:fs";
import { parseEnv } from "node:util";
import { defineConfig } from "vitest/config";

import { shared, worktreeExcludes } from "./vitest.config";

/**
 * Integration suite (`pnpm test:db`): *.db.test.ts against the real database in
 * .env. Files run one at a time — they share one database. Every test creates
 * its own fixture rows (ids prefixed `betest_`) and deletes them afterwards.
 */
function dotenv(): Record<string, string> {
  try {
    return parseEnv(readFileSync(".env", "utf8")) as Record<string, string>;
  } catch {
    return {};
  }
}

export default defineConfig({
  ...shared,
  test: {
    globals: true,
    include: ["src/**/*.db.test.ts"],
    exclude: worktreeExcludes,
    // TEST_DATABASE_URL points the suite at a throwaway Postgres (CI service
    // container, local docker) instead of the shared dev database in .env.
    env: {
      ...dotenv(),
      ...(process.env.TEST_DATABASE_URL ? { DATABASE_URL: process.env.TEST_DATABASE_URL } : {}),
    },
    setupFiles: ["src/test/db-setup.ts"],
    fileParallelism: false,
    testTimeout: 60_000,
    hookTimeout: 60_000,
  },
});
