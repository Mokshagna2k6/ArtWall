/**
 * The pricing engine (F03, F05, F07, F08, F11).
 *
 * Ported from the prototype's `priceSlot` (context_for_claude_for_physical_wall/
 * artwall-wms.jsx:91), with three changes forced by the written spec:
 *
 *  - everything is integer paise and basis points, never floats (see money.ts),
 *  - size base prices and type multipliers are read from the admin catalogs
 *    rather than hard-coded (C02, C03),
 *  - GST is a separate, visible line, because the invoice has to show it.
 *
 * Pure. No database, no session, no clock. The caller loads the catalogs and
 * settings and hands them in — which is what makes this testable, and what makes
 * "quote once, freeze the numbers on the booking" possible.
 */

import { applyBp, BP } from "@/features/physical-wall/money";

/**
 * Per-day discount curve (F08): longer stays get a lower rate per day.
 *
 * Tiers rather than a formula, matching the spec's table. A duration that falls
 * between tiers takes the best tier it fully reaches — 10 days is priced at the
 * 1-week rate, not the 2-week one, because it hasn't earned the deeper discount.
 */
export const DURATION_TIERS = [
  { minDays: 30, discountBp: 7_200, label: "1 month or more" },
  { minDays: 14, discountBp: 8_200, label: "2 weeks" },
  { minDays: 7, discountBp: 8_800, label: "1 week" },
  { minDays: 3, discountBp: 9_500, label: "3 days" },
  { minDays: 1, discountBp: BP, label: "1 day" },
] as const;

export function durationDiscountBp(days: number): number {
  return DURATION_TIERS.find((tier) => days >= tier.minDays)?.discountBp ?? BP;
}

export interface PricedSlot {
  slotId: string;
  /** From pw_size_catalog. */
  basePricePaise: number;
  /** From pw_slot_types. 10000 = 1.0x. */
  typeMultiplierBp: number;
}

export interface AddonLine {
  addonId: string;
  label: string;
  pricePaise: number;
}

/** A tier from pw_settings.group_discount_tiers. */
export interface GroupDiscountTier {
  minSlots: number;
  percentBp: number;
}

export interface PricingSettings {
  gstRateBp: number;
  surgeEnabled: boolean;
  surgeThresholdPct: number;
  surgeMultiplierBp: number;
  groupDiscountTiers: GroupDiscountTier[];
}

export interface QuoteInput {
  slots: PricedSlot[];
  durationDays: number;
  addons: AddonLine[];
  /** How full the wall is right now, 0-100. Only read when surge is enabled. */
  occupancyPct: number;
  settings: PricingSettings;
  /** How many slots the whole wall has, for the "full wall" discount tier. */
  totalSlots: number;
}

export interface QuoteLine {
  slotId: string;
  /** What this one slot costs for the whole booking, before group discount. */
  pricePaise: number;
}

export interface Quote {
  lines: QuoteLine[];
  basePaise: number;
  discountPaise: number;
  addonsPaise: number;
  /** base - discount + addons. What GST is charged on. */
  netPaise: number;
  gstPaise: number;
  totalPaise: number;
  surgeApplied: boolean;
  durationDiscountBp: number;
  groupDiscountBp: number;
}

/**
 * Which group discount a basket of slots earns (F07).
 *
 * The spec says "5+/10+/full-wall tiers" and gives no percentages, so the
 * numbers live in pw_settings for the founder to set. A `minSlots` at or above
 * the wall's total slot count is the "full wall" tier.
 */
export function groupDiscountBpFor(
  slotCount: number,
  tiers: GroupDiscountTier[]
): number {
  return tiers
    .filter((tier) => slotCount >= tier.minSlots)
    .reduce((best, tier) => Math.max(best, tier.percentBp), 0);
}

/**
 * Quote a booking.
 *
 * Order matters and is deliberate: each slot is priced individually first, so
 * the artist can see what each position costs, and the group discount is then
 * applied to the sum. Add-ons are flat line-items — they are not multiplied by
 * the number of days or the number of slots, because "professional photography"
 * is one job however long the work hangs.
 */
export function quote(input: QuoteInput): Quote {
  const { slots, durationDays, addons, occupancyPct, settings, totalSlots } =
    input;

  const durBp = durationDiscountBp(durationDays);

  const surgeApplied =
    settings.surgeEnabled && occupancyPct > settings.surgeThresholdPct;
  const surgeBp = surgeApplied ? settings.surgeMultiplierBp : BP;

  const lines: QuoteLine[] = slots.map((slot) => {
    // size base -> type multiplier -> days -> duration curve -> surge.
    // Rounded once at the end of the chain so the intermediate multipliers do
    // not each contribute their own rounding error.
    const perDay = applyBp(slot.basePricePaise, slot.typeMultiplierBp);
    const forStay = perDay * durationDays;
    const discounted = applyBp(forStay, durBp);
    return { slotId: slot.slotId, pricePaise: applyBp(discounted, surgeBp) };
  });

  const basePaise = lines.reduce((sum, line) => sum + line.pricePaise, 0);

  // "Full wall" is expressed as a tier whose minSlots the basket meets, so the
  // tier list needs to know how big the wall is to resolve that case.
  const effectiveTiers = settings.groupDiscountTiers.map((tier) => ({
    ...tier,
    minSlots: tier.minSlots <= 0 ? totalSlots : tier.minSlots,
  }));
  const groupBp = groupDiscountBpFor(slots.length, effectiveTiers);
  const discountPaise = applyBp(basePaise, groupBp);

  const addonsPaise = addons.reduce((sum, addon) => sum + addon.pricePaise, 0);

  const netPaise = basePaise - discountPaise + addonsPaise;
  const gstPaise = applyBp(netPaise, settings.gstRateBp);

  return {
    lines,
    basePaise,
    discountPaise,
    addonsPaise,
    netPaise,
    gstPaise,
    totalPaise: netPaise + gstPaise,
    surgeApplied,
    durationDiscountBp: durBp,
    groupDiscountBp: groupBp,
  };
}

/**
 * What a cancelled booking gets back (C05).
 *
 * One percentage, applied uniformly — the spec is emphatic that there is no
 * tier logic here. The percentage passed in must be the one snapshotted on the
 * booking, never the current policy.
 */
export function refundAmountPaise(
  totalPaise: number,
  policyPercentage: number
): number {
  return applyBp(totalPaise, policyPercentage * 100);
}
