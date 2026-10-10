import { describe, it, expect } from "vitest";
import {
  DURATION_TIERS,
  durationDiscountBp,
  groupDiscountBpFor,
  quote,
  refundAmountPaise,
  type PricedSlot,
  type PricingSettings,
  type QuoteInput,
} from "../pricing";
import { BP } from "../money";

const BASE_SETTINGS: PricingSettings = {
  gstRateBp: 1800, // 18%
  surgeEnabled: false,
  surgeThresholdPct: 80,
  surgeMultiplierBp: 12_000, // 1.2x
  groupDiscountTiers: [
    { minSlots: 5, percentBp: 500 }, // 5%
    { minSlots: 10, percentBp: 1000 }, // 10%
  ],
};

function slot(
  id: string,
  basePaise: number,
  typeBp: number = BP
): PricedSlot {
  return { slotId: id, basePricePaise: basePaise, typeMultiplierBp: typeBp };
}

describe("DURATION_TIERS", () => {
  it("are sorted descending by minDays", () => {
    for (let i = 0; i < DURATION_TIERS.length - 1; i++) {
      expect(DURATION_TIERS[i].minDays).toBeGreaterThan(
        DURATION_TIERS[i + 1].minDays
      );
    }
  });

  it("deeper discount for longer stays", () => {
    for (let i = 0; i < DURATION_TIERS.length - 1; i++) {
      expect(DURATION_TIERS[i].discountBp).toBeLessThan(
        DURATION_TIERS[i + 1].discountBp
      );
    }
  });
});

describe("durationDiscountBp", () => {
  it("1 day = no discount (1.0x)", () => {
    expect(durationDiscountBp(1)).toBe(BP);
  });

  it("3 days = 3-day tier", () => {
    expect(durationDiscountBp(3)).toBe(9_500);
  });

  it("7 days = 1-week tier", () => {
    expect(durationDiscountBp(7)).toBe(8_800);
  });

  it("10 days between tiers takes 1-week tier, not 2-week", () => {
    expect(durationDiscountBp(10)).toBe(8_800);
  });

  it("14 days = 2-week tier", () => {
    expect(durationDiscountBp(14)).toBe(8_200);
  });

  it("30+ days = monthly tier", () => {
    expect(durationDiscountBp(30)).toBe(7_200);
    expect(durationDiscountBp(60)).toBe(7_200);
  });
});

describe("groupDiscountBpFor", () => {
  const tiers = [
    { minSlots: 5, percentBp: 500 },
    { minSlots: 10, percentBp: 1000 },
  ];

  it("no discount for 1 slot", () => {
    expect(groupDiscountBpFor(1, tiers)).toBe(0);
  });

  it("5 slots earns 5% discount", () => {
    expect(groupDiscountBpFor(5, tiers)).toBe(500);
  });

  it("10 slots earns 10% discount", () => {
    expect(groupDiscountBpFor(10, tiers)).toBe(1000);
  });

  it("7 slots still only earns 5% (between tiers)", () => {
    expect(groupDiscountBpFor(7, tiers)).toBe(500);
  });

  it("empty tiers = no discount", () => {
    expect(groupDiscountBpFor(100, [])).toBe(0);
  });
});

describe("quote", () => {
  it("single slot, 1 day, no addons, no surge", () => {
    const input: QuoteInput = {
      slots: [slot("s1", 100_00)], // ₹100/day base
      durationDays: 1,
      addons: [],
      occupancyPct: 50,
      settings: BASE_SETTINGS,
      totalSlots: 20,
    };
    const q = quote(input);

    expect(q.lines).toHaveLength(1);
    expect(q.basePaise).toBe(100_00);
    expect(q.discountPaise).toBe(0); // 1 slot, no group discount
    expect(q.addonsPaise).toBe(0);
    expect(q.netPaise).toBe(100_00);
    expect(q.gstPaise).toBe(18_00); // 18% of 10000
    expect(q.totalPaise).toBe(118_00);
    expect(q.surgeApplied).toBe(false);
    expect(q.durationDiscountBp).toBe(BP);
    expect(q.groupDiscountBp).toBe(0);
  });

  it("applies duration discount for 7-day booking", () => {
    const input: QuoteInput = {
      slots: [slot("s1", 100_00)],
      durationDays: 7,
      addons: [],
      occupancyPct: 50,
      settings: BASE_SETTINGS,
      totalSlots: 20,
    };
    const q = quote(input);

    // 10000 base * 7 days = 70000, then * 0.88 = 61600
    expect(q.basePaise).toBe(61_600);
    expect(q.durationDiscountBp).toBe(8_800);
  });

  it("applies type multiplier", () => {
    const input: QuoteInput = {
      slots: [slot("s1", 100_00, 15_000)], // 1.5x premium
      durationDays: 1,
      addons: [],
      occupancyPct: 50,
      settings: BASE_SETTINGS,
      totalSlots: 20,
    };
    const q = quote(input);

    expect(q.basePaise).toBe(150_00); // 10000 * 1.5
  });

  it("adds flat addon lines", () => {
    const input: QuoteInput = {
      slots: [slot("s1", 100_00)],
      durationDays: 1,
      addons: [
        { addonId: "photo", label: "Photography", pricePaise: 200_00 },
        { addonId: "frame", label: "Framing", pricePaise: 150_00 },
      ],
      occupancyPct: 50,
      settings: BASE_SETTINGS,
      totalSlots: 20,
    };
    const q = quote(input);

    expect(q.addonsPaise).toBe(350_00);
    expect(q.netPaise).toBe(100_00 + 350_00);
  });

  it("applies surge when above threshold", () => {
    const input: QuoteInput = {
      slots: [slot("s1", 100_00)],
      durationDays: 1,
      addons: [],
      occupancyPct: 90, // above 80% threshold
      settings: { ...BASE_SETTINGS, surgeEnabled: true },
      totalSlots: 20,
    };
    const q = quote(input);

    expect(q.surgeApplied).toBe(true);
    expect(q.basePaise).toBe(120_00); // 10000 * 1.2x
  });

  it("does NOT apply surge when below threshold", () => {
    const input: QuoteInput = {
      slots: [slot("s1", 100_00)],
      durationDays: 1,
      addons: [],
      occupancyPct: 50,
      settings: { ...BASE_SETTINGS, surgeEnabled: true },
      totalSlots: 20,
    };
    const q = quote(input);
    expect(q.surgeApplied).toBe(false);
  });

  it("does NOT apply surge when disabled", () => {
    const input: QuoteInput = {
      slots: [slot("s1", 100_00)],
      durationDays: 1,
      addons: [],
      occupancyPct: 90,
      settings: BASE_SETTINGS, // surgeEnabled: false
      totalSlots: 20,
    };
    const q = quote(input);
    expect(q.surgeApplied).toBe(false);
  });

  it("applies group discount for 5+ slots", () => {
    const slots = Array.from({ length: 5 }, (_, i) => slot(`s${i}`, 100_00));
    const input: QuoteInput = {
      slots,
      durationDays: 1,
      addons: [],
      occupancyPct: 50,
      settings: BASE_SETTINGS,
      totalSlots: 20,
    };
    const q = quote(input);

    expect(q.groupDiscountBp).toBe(500); // 5%
    expect(q.basePaise).toBe(500_00);
    expect(q.discountPaise).toBe(25_00); // 5% of 50000
    expect(q.netPaise).toBe(475_00);
  });

  it("GST is on net (base - discount + addons)", () => {
    const input: QuoteInput = {
      slots: [slot("s1", 100_00)],
      durationDays: 1,
      addons: [{ addonId: "a", label: "Addon", pricePaise: 100_00 }],
      occupancyPct: 50,
      settings: BASE_SETTINGS,
      totalSlots: 20,
    };
    const q = quote(input);

    expect(q.netPaise).toBe(200_00);
    expect(q.gstPaise).toBe(36_00); // 18% of 20000
    expect(q.totalPaise).toBe(236_00);
  });
});

describe("refundAmountPaise", () => {
  it("75% refund", () => {
    expect(refundAmountPaise(100_00, 75)).toBe(75_00);
  });

  it("100% refund", () => {
    expect(refundAmountPaise(100_00, 100)).toBe(100_00);
  });

  it("0% refund", () => {
    expect(refundAmountPaise(100_00, 0)).toBe(0);
  });

  it("25% refund of a large amount", () => {
    expect(refundAmountPaise(10_00_000, 25)).toBe(2_50_000);
  });
});
