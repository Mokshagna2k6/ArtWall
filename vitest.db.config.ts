import { readFileSync } from "node:fs";
import { parseEnv } from "node:util";
import { defineConfig } from "vitest/config";

import { coverage, shared, worktreeExcludes } from "./vitest.config";

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

/**
 * Stand-ins so the suite runs with no .env (CI). Razorpay's HTTP API is faked,
 * and Cloudinary upload signing and the guest cookie are local HMAC, so any
 * value works for those.
 * The one suite that talks to real Cloudinary (dpdp.db.test) skips itself on
 * the stand-in cloud name. .env, then non-empty real env vars, override these.
 */
const STAND_INS = {
  BETTER_AUTH_SECRET: "standin-auth-secret-at-least-32-chars",
  RAZORPAY_KEY_ID: "rzp_test_standin",
  RAZORPAY_KEY_SECRET: "standin-key-secret",
  RAZORPAY_WEBHOOK_SECRET: "standin-webhook-secret",
  CLOUDINARY_CLOUD_NAME: "standin-no-cloudinary",
  CLOUDINARY_API_KEY: "000000000000000",
  CLOUDINARY_API_SECRET: "standin-cloudinary-secret",
  // SEC-1.13 gates every physical-wall action/route on this flag; the whole
  // suite exercises that feature, so it must read as on with no .env (CI).
  PHYSICAL_WALL_ENABLED: "true",
  // Marketplace checkout is off by default everywhere; the db suite exercises it.
  MARKETPLACE_CHECKOUT_ENABLED: "true",
  // BC-3.11: createTag's 'qr' path signs every QR token with this KMS-held
  // Ed25519 seed (qr-signing.ts refuses to run with none set, by design —
  // never a hardcoded fallback in app code). A fixed 32-byte hex stand-in is
  // fine here: no real token verification depends on signature continuity
  // across test runs, same spirit as MINT_SIGNER_PRIVATE_KEY below.
  QR_SIGNING_ED25519_SEED: "11".repeat(32),
  // BC-3.09/3.10: resolveTagScan's NFC path derives per-tag SDM keys from
  // this KMS-held master key (kms.ts refuses to run with none set, same
  // policy as the QR seed above). Fixed 16-byte hex stand-in — FE-3.20's
  // scan-page test mints its own SUN messages against it within the run.
  NTAG424_MASTER_KEY_KMS_REF: "22".repeat(16),
};
const fromProcess = Object.fromEntries(
  Object.keys(STAND_INS).flatMap((k) => (process.env[k] ? [[k, process.env[k]]] : []))
);

export default defineConfig({
  ...shared,
  test: {
    globals: true,
    include: ["src/**/*.db.test.ts"],
    exclude: worktreeExcludes,
    // TEST_DATABASE_URL points the suite at a throwaway Postgres (CI service
    // container, local docker) instead of the shared dev database in .env.
    env: {
      ...STAND_INS,
      ...dotenv(),
      ...fromProcess,
      ...(process.env.TEST_DATABASE_URL ? { DATABASE_URL: process.env.TEST_DATABASE_URL } : {}),
    },
    setupFiles: ["src/test/db-setup.ts"],
    coverage,
    fileParallelism: false,
    testTimeout: 60_000,
    hookTimeout: 60_000,
  },
});
