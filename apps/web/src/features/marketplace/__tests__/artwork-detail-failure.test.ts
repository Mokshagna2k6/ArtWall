import { describe, expect, it, vi } from "vitest";

/**
 * A database failure must NOT look like "this artwork does not exist".
 *
 * `/artwork/[id]` wraps `getArtworkDetail` in `cachedCatalog`
 * (`unstable_cache`, 1 hour) and calls `notFound()` on a null result. While
 * this read was wrapped in `readSafely`, any transient failure — a dropped
 * connection, a pool timeout — returned the same `null` that means "no such
 * artwork". The cache could not tell those apart, so it stored the failure
 * as a legitimate miss and served a 404 for a perfectly valid artwork, to
 * every visitor, for the whole cache window. Reloading could not clear it.
 *
 * Observed on production: /artwork/show_art_97_2, _98_0, _99_3 and _99_4 all
 * 404'd while their rows were public, available and owned by a published
 * profile — and neighbouring ids under the identical seed run served 200.
 *
 * So: a failure throws (nothing is cached, the next request retries), and
 * only a genuine absence returns null.
 */

const SQL_ERROR = "Connection terminated unexpectedly";

vi.mock("@/lib/db/index", () => {
  const boom = () => {
    throw new Error(SQL_ERROR);
  };
  // Any property access returns a thenable chain that throws when awaited,
  // which is how a dead connection surfaces through Drizzle's query builder.
  const db = new Proxy({}, { get: () => boom });
  return { db, pool: { query: boom, connect: boom, on: () => {} } };
});

const { getArtworkDetail } = await import("@/features/marketplace/actions");

describe("getArtworkDetail: a broken database is not a 404", () => {
  it("throws when the query fails, so the failure is never cached as a miss", async () => {
    await expect(getArtworkDetail("show_art_99_3")).rejects.toThrow();
  });

  it("returns null for a structurally invalid id, without touching the database", async () => {
    // Fails fast on input, so a junk URL stays cheap and still 404s properly.
    await expect(getArtworkDetail("")).resolves.toBeNull();
    await expect(getArtworkDetail("x".repeat(65))).resolves.toBeNull();
  });
});
