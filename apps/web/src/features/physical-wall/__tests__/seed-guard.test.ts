import { describe, expect, it } from "vitest";

// The guard lives next to the scripts it protects (scripts/seed-guard.mjs), not
// in src/, because it must be loadable by a plain `node scripts/...` run with
// no bundler or path alias. The test reaches out to it.
import {
  SeedGuardError,
  assertSafeSeedTarget,
  hostOf,
  isForbiddenHost,
} from "../../../../scripts/seed-guard.mjs";

/**
 * The seed scripts write dozens of rows and the purge deletes them. Pointed at
 * production they would do real damage, and the connection string that does
 * that is the one sitting in apps/web/.env. This guard is the only thing
 * standing between those two facts, so it gets a test.
 *
 * The bug this replaces: the pre-existing seed-accounts.mjs guarded on
 * NODE_ENV === "production", which is false for a local terminal run against a
 * production DATABASE_URL — i.e. it passed in exactly the dangerous case.
 */
describe("seed guard", () => {
  const PROD_POOLER =
    "postgresql://u:p@ep-royal-wildflower-azaegx8g-pooler.c-3.ap-southeast-1.aws.neon.tech/neondb?sslmode=require";
  const PROD_DIRECT =
    "postgresql://u:p@ep-royal-wildflower-azaegx8g.ap-southeast-1.aws.neon.tech/neondb";
  const BRANCH = "postgresql://u:p@ep-quiet-forest-12345-pooler.c-3.ap-southeast-1.aws.neon.tech/neondb";

  it("refuses the production pooler endpoint", () => {
    expect(() => assertSafeSeedTarget(PROD_POOLER)).toThrow(SeedGuardError);
  });

  it("refuses the production direct (non-pooler) endpoint", () => {
    // Same endpoint id, different host spelling — a substring match catches
    // both, which is why the check is not an equality test.
    expect(() => assertSafeSeedTarget(PROD_DIRECT)).toThrow(SeedGuardError);
  });

  it("refuses the production host regardless of case", () => {
    expect(() =>
      assertSafeSeedTarget("postgresql://u:p@EP-ROYAL-WILDFLOWER-AZAEGX8G.neon.tech/neondb")
    ).toThrow(SeedGuardError);
  });

  it("allows a different Neon branch endpoint", () => {
    expect(assertSafeSeedTarget(BRANCH)).toBe(
      "ep-quiet-forest-12345-pooler.c-3.ap-southeast-1.aws.neon.tech"
    );
  });

  it("allows a local throwaway Postgres", () => {
    expect(assertSafeSeedTarget("postgres://postgres:test@localhost:55433/postgres")).toBe(
      "localhost"
    );
  });

  // Fail closed: anything the guard cannot positively identify is refused
  // rather than waved through.
  it.each([
    ["an unparseable string", "not-a-url"],
    ["an empty string", ""],
    ["whitespace", "   "],
    ["undefined", undefined],
  ])("refuses %s", (_label, value) => {
    expect(() => assertSafeSeedTarget(value as string)).toThrow(SeedGuardError);
  });

  it("never puts the connection string in the error message", () => {
    // The message is shown on a terminal and may be pasted into a report.
    try {
      assertSafeSeedTarget(PROD_POOLER);
      throw new Error("expected a refusal");
    } catch (error) {
      const message = (error as Error).message;
      expect(message).not.toContain("u:p");
      expect(message).not.toContain("sslmode");
      expect(message).toContain("PRODUCTION");
    }
  });

  it("hostOf lowercases and strips credentials, port and path", () => {
    expect(hostOf("postgres://User:Secret@Example.COM:5432/db?x=1")).toBe("example.com");
  });

  it("isForbiddenHost matches only the production endpoint id", () => {
    expect(isForbiddenHost("ep-royal-wildflower-x.neon.tech")).toBe(true);
    expect(isForbiddenHost("ep-royal-sunflower-x.neon.tech")).toBe(false);
    expect(isForbiddenHost("localhost")).toBe(false);
  });
});
