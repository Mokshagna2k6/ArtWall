import { describe, expect, it } from "vitest";

import {
  MAX_COUNTER_ROUNDS,
  minimumOfferPaise,
  nextCounterRound,
  offerExpiry,
  VALIDITY_DAYS,
  isValidOfferAmount,
} from "@/features/offers/rules";

/**
 * Bible §17 Part 1. These three rules are the whole reason the offer feature
 * is not just a comment thread with a number in it, so they are tested here
 * directly as well as through the database's CHECK constraints (0085) and the
 * action-level tests.
 */

describe("the 50% minimum (Bible §17)", () => {
  it("refuses anything under half the asking price", () => {
    expect(isValidOfferAmount(49_999, 100_000)).toBe(false);
    expect(isValidOfferAmount(1, 100_000)).toBe(false);
    expect(isValidOfferAmount(0, 100_000)).toBe(false);
  });

  it("accepts exactly half, and anything above it", () => {
    expect(isValidOfferAmount(50_000, 100_000)).toBe(true);
    expect(isValidOfferAmount(99_999, 100_000)).toBe(true);
    // Above the asking price is not an offer rule's business — the artist can
    // always say yes to more money.
    expect(isValidOfferAmount(120_000, 100_000)).toBe(true);
  });

  it("rounds an odd asking price UP, so it never lets 49.99% through", () => {
    // ceil(100001/2) = 50001. 50000 would be fractionally under half.
    expect(minimumOfferPaise(100_001)).toBe(50_001);
    expect(isValidOfferAmount(50_000, 100_001)).toBe(false);
    expect(isValidOfferAmount(50_001, 100_001)).toBe(true);
  });

  it("matches the Postgres CHECK's integer arithmetic for every parity", () => {
    // The constraint is `offer >= (asking + 1) / 2` with integer division.
    for (const asking of [1, 2, 3, 99, 100, 100_000, 100_001, 999_999]) {
      expect(minimumOfferPaise(asking)).toBe(Math.floor((asking + 1) / 2));
    }
  });

  it("refuses non-integer paise and a priceless work", () => {
    expect(isValidOfferAmount(50_000.5, 100_000)).toBe(false);
    expect(isValidOfferAmount(50_000, 0)).toBe(false);
  });
});

describe("the 2-counter-round ceiling (Bible §17)", () => {
  it("allows exactly two counters after the opening offer", () => {
    expect(MAX_COUNTER_ROUNDS).toBe(2);
    expect(nextCounterRound(0)).toBe(1); // artist counters the opening offer
    expect(nextCounterRound(1)).toBe(2); // buyer counters back
  });

  it("refuses the third counter, so the thread must expire instead", () => {
    expect(nextCounterRound(2)).toBeNull();
    expect(nextCounterRound(3)).toBeNull();
  });
});

describe("validity windows (Bible §17)", () => {
  it("offers exactly 7, 14 and 30 days", () => {
    expect([...VALIDITY_DAYS]).toEqual([7, 14, 30]);
  });

  it("expires that many days out", () => {
    const from = new Date("2026-01-01T00:00:00Z");
    expect(offerExpiry(7, from).toISOString()).toBe("2026-01-08T00:00:00.000Z");
    expect(offerExpiry(14, from).toISOString()).toBe("2026-01-15T00:00:00.000Z");
    expect(offerExpiry(30, from).toISOString()).toBe("2026-01-31T00:00:00.000Z");
  });
});
