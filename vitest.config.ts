import { resolve } from "node:path";
import { configDefaults, defineConfig } from "vitest/config";

/**
 * Unit suite (`pnpm test`): hermetic, no network, no database.
 *
 * Excludes agent/tool worktrees (.claude/worktrees, .kilo) — they hold full
 * copies of src/, and without this every test was collected two or three times
 * over, which is where the old "212 tests" figure came from. Also excludes the
 * *.db.test.ts integration suite, which runs against a real database via
 * `pnpm test:db` (vitest.db.config.ts). True counts: docs/testing.md.
 */
export const shared = {
  resolve: {
    alias: {
      "@": resolve(__dirname, "src"),
      // `server-only` throws outside a React Server bundle; tests are not one.
      "server-only": resolve(__dirname, "src/test/server-only-stub.ts"),
    },
  },
};

export const worktreeExcludes = [
  ...configDefaults.exclude,
  "**/.claude/**",
  "**/.kilo/**",
  "**/.next/**",
  "contracts/**",
];

export default defineConfig({
  ...shared,
  test: {
    globals: true,
    exclude: [...worktreeExcludes, "**/*.db.test.ts"],
  },
});
