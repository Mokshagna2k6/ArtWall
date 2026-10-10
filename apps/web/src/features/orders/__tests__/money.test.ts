import { describe, expect, it } from "vitest";

import { checkoutTotals, groupBySeller, priceLine, ratioRound, splitRelease } from "@/features/orders/money";

// The seeded cpv_v1: platform 5%, curator 10% (artist is the remainder).
const SPLIT = { platformBps: 500, artistBps: 8100, curatorBps: 1000, venueBps: 0 };

const line = (artworkId: string, sellerId: string, unitPricePaise: number, curatorUserId: string | null = null) => ({
  artworkId,
  sellerId,
  unitPricePaise,
  curatorUserId,
});

describe("priceLine", () => {
  it("splits a price into platform + curator + artist that sum exactly to the price", () => {
    for (const price of [100, 101, 999, 12_345, 1_000_001, 199_999_999]) {
      for (const curator of [null, "cur_1"]) {
        const p = priceLine(line("a", "s", price, curator), SPLIT);
        expect(p.platformFeePaise + p.curatorFeePaise + p.sellerNetPaise).toBe(price);
        if (!curator) expect(p.curatorFeePaise).toBe(0);
      }
    }
  });

  it("rounds each share half-up and gives the artist the exact remainder", () => {
    // 5% of 10 paise = 0.5 -> 1 (half-up); curator 10% of 10 = 1; artist = 8
    expect(priceLine(line("a", "s", 10, "c"), SPLIT)).toMatchObject({ platformFeePaise: 1, curatorFeePaise: 1, sellerNetPaise: 8 });
  });

  it("handles the bps edges 0 and 10000", () => {
    const zero = priceLine(line("a", "s", 5000), { platformBps: 0, artistBps: 10000, curatorBps: 0, venueBps: 0 });
    expect(zero).toMatchObject({ platformFeePaise: 0, sellerNetPaise: 5000 });
    const all = priceLine(line("a", "s", 5000), { platformBps: 10000, artistBps: 0, curatorBps: 0, venueBps: 0 });
    expect(all).toMatchObject({ platformFeePaise: 5000, sellerNetPaise: 0 });
  });

  it("rejects non-integer or non-positive prices", () => {
    expect(() => priceLine(line("a", "s", 10.5), SPLIT)).toThrow();
    expect(() => priceLine(line("a", "s", 0), SPLIT)).toThrow();
  });
});

describe("groupBySeller / checkoutTotals (multi-seller checkout)", () => {
  const lines = [
    line("a1", "seller_a", 500_000),
    line("a2", "seller_a", 250_000, "cur_1"),
    line("b1", "seller_b", 120_000),
  ];
  const groups = groupBySeller(lines, SPLIT, 25_000);

  it("makes one sub-order per seller, with shipping once per seller", () => {
    expect(groups.map((g) => g.sellerId).sort()).toEqual(["seller_a", "seller_b"]);
    const a = groups.find((g) => g.sellerId === "seller_a")!;
    expect(a.subtotalPaise).toBe(750_000);
    expect(a.shippingPaise).toBe(25_000);
    expect(a.totalPaise).toBe(775_000);
    expect(a.lines).toHaveLength(2);
  });

  it("each sub-order's fees sum to its subtotal; the checkout total is the sum of sub-orders", () => {
    for (const g of groups) expect(g.platformFeePaise + g.curatorFeePaise + g.sellerNetPaise).toBe(g.subtotalPaise);
    const t = checkoutTotals(groups);
    expect(t.totalPaise).toBe(groups.reduce((s, g) => s + g.totalPaise, 0));
    expect(t.totalPaise).toBe(500_000 + 250_000 + 120_000 + 2 * 25_000);
    expect(t.gstPaise).toBe(0);
  });

  it("curator fee only appears on the attributed work", () => {
    const a = groups.find((g) => g.sellerId === "seller_a")!;
    expect(a.curatorFeePaise).toBe(25_000); // 10% of 250_000 only
    expect(groups.find((g) => g.sellerId === "seller_b")!.curatorFeePaise).toBe(0);
  });
});

describe("ratioRound", () => {
  it("rounds half-up with integer math", () => {
    expect(ratioRound(1, 1, 2)).toBe(1);
    expect(ratioRound(10, 1, 3)).toBe(3);
    expect(ratioRound(199_999_999, 1, 1)).toBe(199_999_999);
  });
});

describe("splitRelease (partial-refund math)", () => {
  const base = { holdPaise: 775_000, platformTotalPaise: 40_000, curatorTotals: { cur_1: 25_000 } };

  it("with no refund it reproduces the snapshot exactly", () => {
    const s = splitRelease({ ...base, remainingPaise: 775_000 });
    expect(s.platformPaise).toBe(40_000);
    expect(s.curators.cur_1).toBe(25_000);
    expect(s.artistPaise).toBe(775_000 - 40_000 - 25_000);
  });

  it("after a partial refund, fees reverse pro-rata and the parts sum to what is left", () => {
    for (const refunded of [1, 2_500, 100_000, 387_500, 774_999]) {
      const remaining = 775_000 - refunded;
      const s = splitRelease({ ...base, remainingPaise: remaining });
      expect(s.platformPaise + s.curators.cur_1 + s.artistPaise).toBe(remaining);
      expect(s.platformPaise).toBeLessThanOrEqual(40_000);
      expect(s.artistPaise).toBeGreaterThanOrEqual(0);
    }
  });

  it("a half refund roughly halves the platform fee", () => {
    const s = splitRelease({ ...base, remainingPaise: 387_500 });
    expect(s.platformPaise).toBe(20_000);
    expect(s.curators.cur_1).toBe(12_500);
  });

  it("refuses a remaining amount outside the hold", () => {
    expect(() => splitRelease({ ...base, remainingPaise: 775_001 })).toThrow();
    expect(() => splitRelease({ ...base, remainingPaise: -1 })).toThrow();
  });
});
