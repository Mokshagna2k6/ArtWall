import { describe, expect, it } from "vitest";

import { purchasability } from "@/features/marketplace/purchasable";

/**
 * §8.7: Buy Now must appear ONLY when the work is genuinely purchasable.
 * These tests pin the cases where it must NOT, since that is the failure that
 * matters — offering a purchase the checkout would then refuse.
 */

const buyable = {
  ownerId: "user_seller",
  status: "available",
  pricePaise: 450_000,
  exhibitionStatus: "not_exhibited",
};

describe("purchasability", () => {
  it("allows a buy for an available, priced work with checkout on", () => {
    expect(purchasability(buyable, "user_buyer", true)).toEqual({ buyable: true });
  });

  it("allows a buy for a logged-out visitor (sign-in happens at the action)", () => {
    expect(purchasability(buyable, null, true)).toEqual({ buyable: true });
  });

  it("refuses when the marketplace checkout flag is off", () => {
    const result = purchasability(buyable, "user_buyer", false);
    expect(result.buyable).toBe(false);
    expect(result).toMatchObject({ reason: "checkout_off" });
  });

  it("refuses an unpriced work", () => {
    const result = purchasability({ ...buyable, pricePaise: null }, "user_buyer", true);
    expect(result).toMatchObject({ buyable: false, reason: "unpriced" });
  });

  it("refuses a zero or negative price", () => {
    expect(purchasability({ ...buyable, pricePaise: 0 }, "u", true)).toMatchObject({
      buyable: false,
      reason: "unpriced",
    });
    expect(purchasability({ ...buyable, pricePaise: -100 }, "u", true)).toMatchObject({
      buyable: false,
      reason: "unpriced",
    });
  });

  it.each(["sold", "reserved", "archived", "draft"])("refuses a %s work", (status) => {
    const result = purchasability({ ...buyable, status }, "user_buyer", true);
    expect(result.buyable).toBe(false);
  });

  it("refuses the owner buying their own work", () => {
    const result = purchasability(buyable, "user_seller", true);
    expect(result).toMatchObject({ buyable: false, reason: "own_work" });
  });

  it("does not treat a logged-out visitor as the owner", () => {
    // Regression guard: an empty-string viewer id must not collide with a seller id.
    expect(purchasability({ ...buyable, ownerId: "" }, null, true)).toEqual({ buyable: true });
  });

  // Bible §14/§42 (CHANGES-PLAN §22.2): exhibited work is not for sale by
  // default; only the demand-triggered sale makes it purchasable.
  it.each(["scheduled", "on_display"])(
    "refuses an otherwise-buyable work that is %s, until demand triggers the sale",
    (exhibitionStatus) => {
      const work = { ...buyable, exhibitionStatus };
      expect(purchasability(work, "user_buyer", true)).toMatchObject({
        buyable: false,
        reason: "on_exhibition",
      });
      // Threshold crossed = the sale was triggered, so it becomes buyable.
      expect(purchasability(work, "user_buyer", true, true)).toEqual({ buyable: true });
    }
  );

  it.each(["not_exhibited", "returned"])(
    "treats a %s work as an ordinary direct listing",
    (exhibitionStatus) => {
      expect(
        purchasability({ ...buyable, exhibitionStatus }, "user_buyer", true)
      ).toEqual({ buyable: true });
    }
  );

  it("still refuses a sold work even once the demand threshold is crossed", () => {
    const result = purchasability(
      { ...buyable, status: "sold", exhibitionStatus: "on_display" },
      "user_buyer",
      true,
      true
    );
    expect(result.buyable).toBe(false);
  });

  it("always carries a message a visitor can read when it refuses", () => {
    const result = purchasability({ ...buyable, status: "sold" }, "user_buyer", true);
    expect(result.buyable).toBe(false);
    if (!result.buyable) expect(result.message.length).toBeGreaterThan(0);
  });
});
