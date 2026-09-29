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

/**
 * Coverage floors (BE-2.25), per module group, on the MERGED unit + integration
 * coverage. Payments, invoices, UGC and the NFT routes are mostly exercised by
 * the *.db.test.ts suite, so neither run alone is the true number; the floors
 * are only checked by `vitest --merge-reports --coverage` (CI's last test
 * step). Set a few points under what the suite reaches today: raise them as
 * tests are added, never lower them to get a red build green.
 */
const FLOORS = {
  // payment — measured 2026-09-30: lines 71.6, statements 70.4, functions 62.1, branches 65.2
  "src/{features/physical-wall/{settlement,refunds,razorpay,actions/payment}.ts,app/api/physical-wall/razorpay/**}": {
    lines: 65,
    statements: 65,
    functions: 55,
    branches: 60,
  },
  // invoice — measured: lines 62.7, statements 60.0, functions 36.4, branches 29.5
  "src/{features/physical-wall/{invoice-number,actions/invoice}.ts,app/api/physical-wall/invoice/**}": {
    lines: 55,
    statements: 55,
    functions: 30,
    branches: 25,
  },
  // UGC — measured: lines 51.9, statements 49.6, functions 35.7, branches 57.0
  "src/{features/physical-wall/actions/ugc.ts,app/api/physical-wall/ugc/**}": {
    lines: 45,
    statements: 45,
    functions: 30,
    branches: 50,
  },
  // NFT routes — measured: lines 64.2, statements 60.9, functions 71.4, branches 55.7
  "src/app/api/blockchain/**": { lines: 60, statements: 55, functions: 65, branches: 50 },
};

/** Off unless `--coverage` is passed. */
export const coverage = {
  provider: "v8" as const,
  include: ["src/**/*.ts"],
  exclude: ["src/**/__tests__/**", "src/**/*.test.ts", "src/test/**"],
  reporter: ["text-summary", "html", "json-summary"],
  thresholds: process.argv.includes("--merge-reports") ? FLOORS : {},
};

export default defineConfig({
  ...shared,
  test: {
    globals: true,
    exclude: [...worktreeExcludes, "**/*.db.test.ts"],
    coverage,
  },
});
