import "server-only";

import type {
  Addon,
  RefundPolicy,
  SizeClass,
  SlotType,
  WallSettings,
} from "@/features/physical-wall/types";
import { getSql } from "@/lib/db";

/**
 * Reads for the admin-owned catalogs (C02, C03, C05).
 *
 * These are the tables the founder edits and the pricing engine reads. Every
 * function selects columns explicitly rather than `select *`, so adding a
 * column later cannot silently widen what a page renders.
 */

export async function listSizes(includeInactive = false): Promise<SizeClass[]> {
  const sql = getSql();
  const rows = (await sql`
    select id, name, w_cm, h_cm, weight_kg, base_price_paise, active, sort_order
    from pw_size_catalog
    where ${includeInactive} or active = true
    order by sort_order asc, name asc
  `) as Record<string, unknown>[];

  return rows.map((row) => ({
    id: String(row.id),
    name: String(row.name),
    wCm: Number(row.w_cm),
    hCm: Number(row.h_cm),
    weightKg: Number(row.weight_kg),
    basePricePaise: Number(row.base_price_paise),
    active: Boolean(row.active),
    sortOrder: Number(row.sort_order),
  }));
}

export async function listSlotTypes(
  includeInactive = false
): Promise<SlotType[]> {
  const sql = getSql();
  const rows = (await sql`
    select id, label, multiplier_bp, requires_grant, active, sort_order
    from pw_slot_types
    where ${includeInactive} or active = true
    order by sort_order asc, label asc
  `) as Record<string, unknown>[];

  return rows.map((row) => ({
    id: String(row.id),
    label: String(row.label),
    multiplierBp: Number(row.multiplier_bp),
    requiresGrant: Boolean(row.requires_grant),
    active: Boolean(row.active),
    sortOrder: Number(row.sort_order),
  }));
}

export async function listAddons(includeInactive = false): Promise<Addon[]> {
  const sql = getSql();
  const rows = (await sql`
    select id, label, price_paise, applies_to, category, active, sort_order
    from pw_addon_catalog
    where ${includeInactive} or active = true
    order by sort_order asc, label asc
  `) as Record<string, unknown>[];

  return rows.map((row) => ({
    id: String(row.id),
    label: String(row.label),
    pricePaise: Number(row.price_paise),
    appliesTo: row.applies_to as Addon["appliesTo"],
    category: row.category as Addon["category"],
    active: Boolean(row.active),
    sortOrder: Number(row.sort_order),
  }));
}

/**
 * The refund policy currently in force.
 *
 * Highest version wins — the table is append-only, so "current" is always the
 * newest row and history stays intact for the bookings that reference it.
 */
export async function getCurrentRefundPolicy(): Promise<RefundPolicy | null> {
  const sql = getSql();
  const rows = (await sql`
    select version, percentage, note, updated_at
    from pw_refund_policy
    order by version desc
    limit 1
  `) as Record<string, unknown>[];

  if (rows.length === 0) return null;
  const row = rows[0];
  return {
    version: Number(row.version),
    percentage: Number(row.percentage),
    note: (row.note as string) ?? null,
    updatedAt: String(row.updated_at),
  };
}

/** Every policy version, newest first. Shown so a past booking can be explained. */
export async function listRefundPolicies(): Promise<RefundPolicy[]> {
  const sql = getSql();
  const rows = (await sql`
    select version, percentage, note, updated_at
    from pw_refund_policy
    order by version desc
    limit 50
  `) as Record<string, unknown>[];

  return rows.map((row) => ({
    version: Number(row.version),
    percentage: Number(row.percentage),
    note: (row.note as string) ?? null,
    updatedAt: String(row.updated_at),
  }));
}

/** The policy a specific booking was made under, not the current one. */
export async function getRefundPolicyVersion(
  version: number
): Promise<RefundPolicy | null> {
  const sql = getSql();
  const rows = (await sql`
    select version, percentage, note, updated_at
    from pw_refund_policy where version = ${version} limit 1
  `) as Record<string, unknown>[];

  if (rows.length === 0) return null;
  const row = rows[0];
  return {
    version: Number(row.version),
    percentage: Number(row.percentage),
    note: (row.note as string) ?? null,
    updatedAt: String(row.updated_at),
  };
}

/**
 * Wall settings, with defaults if the row is somehow missing.
 *
 * Returning defaults rather than throwing means an unseeded database still
 * renders a booking page — it prices at 18% GST with surge off, which is the
 * conservative reading and matches what the migration would have seeded.
 */
export const DEFAULT_SETTINGS: WallSettings = {
  holdMinutes: 30,
  bufferDays: 0,
  gstRateBp: 1800,
  surgeEnabled: false,
  surgeThresholdPct: 80,
  surgeMultiplierBp: 11_500,
  perkDiscountBp: 1000,
  perkCostBearer: "artwall",
  groupDiscountTiers: [],
  venueOpenHour: 11,
  venueCloseHour: 22,
};

export async function getSettings(): Promise<WallSettings> {
  try {
    const sql = getSql();
    const rows = (await sql`
      select hold_minutes, buffer_days, gst_rate_bp, surge_enabled,
             surge_threshold_pct, surge_multiplier_bp, perk_discount_bp,
             perk_cost_bearer, group_discount_tiers, venue_open_hour,
             venue_close_hour
      from pw_settings where id = 1 limit 1
    `) as Record<string, unknown>[];

    if (rows.length === 0) return DEFAULT_SETTINGS;
    const row = rows[0];

    return {
      holdMinutes: Number(row.hold_minutes),
      bufferDays: Number(row.buffer_days),
      gstRateBp: Number(row.gst_rate_bp),
      surgeEnabled: Boolean(row.surge_enabled),
      surgeThresholdPct: Number(row.surge_threshold_pct),
      surgeMultiplierBp: Number(row.surge_multiplier_bp),
      perkDiscountBp: Number(row.perk_discount_bp),
      perkCostBearer: row.perk_cost_bearer as WallSettings["perkCostBearer"],
      groupDiscountTiers: normaliseTiers(row.group_discount_tiers),
      venueOpenHour: Number(row.venue_open_hour),
      venueCloseHour: Number(row.venue_close_hour),
    };
  } catch (error) {
    console.error("[physical-wall] Could not read settings", error);
    return DEFAULT_SETTINGS;
  }
}

/**
 * Coerce the jsonb tier list into the shape pricing expects.
 *
 * jsonb is schemaless by definition, and this value is founder-editable, so a
 * malformed entry is a real possibility rather than a theoretical one. Bad
 * entries are dropped rather than throwing — a missing discount is recoverable,
 * a booking page that will not render is not.
 */
function normaliseTiers(value: unknown): WallSettings["groupDiscountTiers"] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    if (typeof entry !== "object" || entry === null) return [];
    const tier = entry as Record<string, unknown>;
    const minSlots = Number(tier.minSlots);
    const percentBp = Number(tier.percentBp);
    if (!Number.isFinite(minSlots) || !Number.isFinite(percentBp)) return [];
    return [{ minSlots, percentBp }];
  });
}
