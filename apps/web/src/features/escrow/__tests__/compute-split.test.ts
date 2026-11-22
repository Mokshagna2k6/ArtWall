import { describe, expect, it } from "vitest";

import { computeEscrowSplit } from "@/features/escrow/split";

/**
 * Pure commission-split math (BE-3.11). No database — proves the arithmetic
 * is correct for every shape of split before the DB test proves it actually
 * lands in the ledger balanced (see escrow.db.test.ts).
 */
describe("computeEscrowSplit", () => {
  const split = { platformBps: 500, artistBps: 8100, curatorBps: 1000, venueBps: 0 };

  it("splits three ways and the parts sum to the whole", () => {
    const { platformPaise, artistPaise, curatorVenuePaise } = computeEscrowSplit(100_000, split, true);
    expect(platformPaise + artistPaise + curatorVenuePaise).toBe(100_000);
    expect(platformPaise).toBe(5_000); // 5%
    expect(curatorVenuePaise).toBe(10_000); // 10%
    expect(artistPaise).toBe(85_000); // remainder
  });

  it("folds curator/venue's share into the artist when there is no curator/venue", () => {
    const { platformPaise, artistPaise, curatorVenuePaise } = computeEscrowSplit(100_000, split, false);
    expect(curatorVenuePaise).toBe(0);
    expect(platformPaise + artistPaise + curatorVenuePaise).toBe(100_000);
    expect(artistPaise).toBe(95_000); // 81% + the curator's 10% that had nowhere else to go
  });

  it("odd-paisa amounts still sum exactly (rounding residual lands on the artist)", () => {
    const amounts = [1, 3, 7, 11, 999, 1_234_567, 100_000_001];
    for (const amount of amounts) {
      const { platformPaise, artistPaise, curatorVenuePaise } = computeEscrowSplit(amount, split, true);
      expect(platformPaise + artistPaise + curatorVenuePaise).toBe(amount);
      expect(platformPaise).toBeGreaterThanOrEqual(0);
      expect(artistPaise).toBeGreaterThanOrEqual(0);
      expect(curatorVenuePaise).toBeGreaterThanOrEqual(0);
    }
  });

  it("an even split with no remainder still sums correctly", () => {
    const even = { platformBps: 2500, artistBps: 5000, curatorBps: 2500, venueBps: 0 };
    const { platformPaise, artistPaise, curatorVenuePaise } = computeEscrowSplit(100_00, even, true);
    expect(platformPaise).toBe(2500);
    expect(curatorVenuePaise).toBe(2500);
    expect(artistPaise).toBe(5000);
    expect(platformPaise + artistPaise + curatorVenuePaise).toBe(100_00);
  });

  it("a zero platform/curator split sends everything to the artist", () => {
    const allArtist = { platformBps: 0, artistBps: 10_000, curatorBps: 0, venueBps: 0 };
    const { platformPaise, artistPaise, curatorVenuePaise } = computeEscrowSplit(50_000, allArtist, false);
    expect(platformPaise).toBe(0);
    expect(curatorVenuePaise).toBe(0);
    expect(artistPaise).toBe(50_000);
  });

  it("1 paisa total still resolves without going negative", () => {
    const { platformPaise, artistPaise, curatorVenuePaise } = computeEscrowSplit(1, split, true);
    expect(platformPaise + artistPaise + curatorVenuePaise).toBe(1);
    expect(platformPaise).toBeGreaterThanOrEqual(0);
    expect(curatorVenuePaise).toBeGreaterThanOrEqual(0);
    expect(artistPaise).toBeGreaterThanOrEqual(0);
  });
});
