import { describe, expect, it } from "vitest";
import { getActiveCommissionPolicy } from "@/features/policy/commission";

/**
 * BC-3.14: the venue revenue-share rate, seeded by migration 0045, is
 * readable through the same commission_policies reader every other rate
 * kind uses — no special-casing, no literal bps in src.
 */
describe("getActiveCommissionPolicy('venue_revenue_share')", () => {
  it("resolves to the seeded active row", async () => {
    const policy = await getActiveCommissionPolicy("venue_revenue_share");
    expect(policy.id).toBe("cpol_venue_rev_v1");
    expect(policy.rateBps).toBeGreaterThan(0);
    expect(policy.rateBps).toBeLessThanOrEqual(10_000);
  });

  it("the pre-existing kinds still resolve (no regression from adding a kind)", async () => {
    expect((await getActiveCommissionPolicy("curator_commission")).rateBps).toBe(1000);
    expect((await getActiveCommissionPolicy("mint_royalty")).rateBps).toBe(400);
  });
});
