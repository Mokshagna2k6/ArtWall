"use server";

import { updateTag } from "next/cache";

import { recordAudit } from "@/features/physical-wall/audit";
import { requireRole } from "@/features/physical-wall/authorize";
import { BP, toPaise } from "@/features/physical-wall/money";
import {
  addonSchema,
  refundPolicySchema,
  settingsSchema,
  sizeSchema,
  slotTypeSchema,
} from "@/features/physical-wall/schema";
import {
  CATALOG_TAG,
  fail,
  firstIssue,
  newId,
  ok,
  toActionError,
  WALL_TAG,
  type ActionState,
} from "@/features/physical-wall/actions/shared";
import { getSql } from "@/lib/db";

/**
 * The admin catalogs (C02, C03, C05).
 *
 * Prices and multipliers arrive from the form in the units a human types —
 * rupees and "1.4x" — and are converted to paise and basis points here, at the
 * boundary. Nothing downstream sees a float.
 *
 * These are single-statement upserts, so they use the HTTP client and audit
 * separately rather than opening a transaction. An audit line that failed to
 * write does not justify refusing a price change.
 */

/** Slug an admin-supplied name into an id, for rows they are creating. */
function slugId(name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
  return slug || newId("cat");
}

export async function upsertSize(
  _previous: ActionState,
  formData: FormData
): Promise<ActionState> {
  try {
    const actor = await requireRole("admin");

    const parsed = sizeSchema.safeParse({
      id: formData.get("id") || undefined,
      name: formData.get("name"),
      wCm: formData.get("wCm"),
      hCm: formData.get("hCm"),
      weightKg: formData.get("weightKg"),
      basePrice: formData.get("basePrice"),
      active: formData.get("active") === "on" || formData.get("active") === "true",
    });
    if (!parsed.success) return fail(firstIssue(parsed.error));

    const input = parsed.data;
    const pricePaise = toPaise(input.basePrice);
    if (pricePaise === null) return fail("Enter a valid base price.");

    const id = input.id ?? slugId(input.name);
    const sql = getSql();

    await sql`
      insert into pw_size_catalog
        (id, name, w_cm, h_cm, weight_kg, base_price_paise, active)
      values (${id}, ${input.name}, ${input.wCm}, ${input.hCm}, ${input.weightKg},
              ${pricePaise}, ${input.active})
      on conflict (id) do update
        set name = excluded.name,
            w_cm = excluded.w_cm,
            h_cm = excluded.h_cm,
            weight_kg = excluded.weight_kg,
            base_price_paise = excluded.base_price_paise,
            active = excluded.active,
            updated_at = now()
    `;

    await recordAudit({
      actor,
      action: "catalog.size.upserted",
      subjectType: "size",
      subjectId: id,
      after: { ...input, basePricePaise: pricePaise },
    });

    updateTag(CATALOG_TAG);
    updateTag(WALL_TAG);
    return ok(
      `Saved '${input.name}'. New quotes use this price — bookings already confirmed keep theirs.`
    );
  } catch (error) {
    return toActionError("upsertSize", error);
  }
}

export async function upsertSlotType(
  _previous: ActionState,
  formData: FormData
): Promise<ActionState> {
  try {
    const actor = await requireRole("admin");

    const parsed = slotTypeSchema.safeParse({
      id: formData.get("id") || undefined,
      label: formData.get("label"),
      multiplier: formData.get("multiplier"),
      requiresGrant:
        formData.get("requiresGrant") === "on" ||
        formData.get("requiresGrant") === "true",
      active: formData.get("active") === "on" || formData.get("active") === "true",
    });
    if (!parsed.success) return fail(firstIssue(parsed.error));

    const input = parsed.data;
    const id = input.id ?? slugId(input.label);
    const multiplierBp = Math.round(input.multiplier * BP);
    const sql = getSql();

    await sql`
      insert into pw_slot_types (id, label, multiplier_bp, requires_grant, active)
      values (${id}, ${input.label}, ${multiplierBp}, ${input.requiresGrant}, ${input.active})
      on conflict (id) do update
        set label = excluded.label,
            multiplier_bp = excluded.multiplier_bp,
            requires_grant = excluded.requires_grant,
            active = excluded.active,
            updated_at = now()
    `;

    await recordAudit({
      actor,
      action: "catalog.type.upserted",
      subjectType: "slot-type",
      subjectId: id,
      after: { ...input, multiplierBp },
    });

    updateTag(CATALOG_TAG);
    updateTag(WALL_TAG);
    return ok(`Saved '${input.label}' at ${input.multiplier}×.`);
  } catch (error) {
    return toActionError("upsertSlotType", error);
  }
}

export async function upsertAddon(
  _previous: ActionState,
  formData: FormData
): Promise<ActionState> {
  try {
    const actor = await requireRole("admin");

    const parsed = addonSchema.safeParse({
      id: formData.get("id") || undefined,
      label: formData.get("label"),
      price: formData.get("price"),
      appliesTo: formData.get("appliesTo"),
      category: formData.get("category"),
      active: formData.get("active") === "on" || formData.get("active") === "true",
    });
    if (!parsed.success) return fail(firstIssue(parsed.error));

    const input = parsed.data;
    const pricePaise = toPaise(input.price);
    if (pricePaise === null) return fail("Enter a valid price.");

    const id = input.id ?? slugId(input.label);
    const sql = getSql();

    await sql`
      insert into pw_addon_catalog (id, label, price_paise, applies_to, category, active)
      values (${id}, ${input.label}, ${pricePaise}, ${input.appliesTo},
              ${input.category}, ${input.active})
      on conflict (id) do update
        set label = excluded.label,
            price_paise = excluded.price_paise,
            applies_to = excluded.applies_to,
            category = excluded.category,
            active = excluded.active,
            updated_at = now()
    `;

    await recordAudit({
      actor,
      action: "catalog.addon.upserted",
      subjectType: "addon",
      subjectId: id,
      after: { ...input, pricePaise },
    });

    updateTag(CATALOG_TAG);
    return ok(
      `Saved '${input.label}'. Bookings already placed keep the price they were charged.`
    );
  } catch (error) {
    return toActionError("upsertAddon", error);
  }
}

/**
 * Set the refund policy (C05).
 *
 * INSERT, never UPDATE. Bookings reference a version, so editing a row in place
 * would rewrite the terms of every booking that pointed at it — including ones
 * an artist has already agreed to.
 */
export async function setRefundPolicy(
  _previous: ActionState,
  formData: FormData
): Promise<ActionState> {
  try {
    const actor = await requireRole("admin");

    const parsed = refundPolicySchema.safeParse({
      percentage: formData.get("percentage"),
      note: formData.get("note") || undefined,
    });
    if (!parsed.success) return fail(firstIssue(parsed.error));

    const sql = getSql();
    const rows = (await sql`
      insert into pw_refund_policy (percentage, note, updated_by)
      values (${parsed.data.percentage}, ${parsed.data.note ?? null}, ${actor.id})
      returning version
    `) as { version: number }[];

    const version = Number(rows[0].version);

    await recordAudit({
      actor,
      action: "catalog.refund-policy.set",
      subjectType: "refund-policy",
      subjectId: String(version),
      after: { percentage: parsed.data.percentage, version },
    });

    updateTag(CATALOG_TAG);
    return ok(
      `Refund policy v${version} is now in force at ${parsed.data.percentage}%. Existing bookings keep the version they were made under.`
    );
  } catch (error) {
    return toActionError("setRefundPolicy", error);
  }
}

/** Wall settings: hold timers, GST, surge, the Platter discount rate. */
export async function updateSettings(
  _previous: ActionState,
  formData: FormData
): Promise<ActionState> {
  try {
    const actor = await requireRole("admin");

    const parsed = settingsSchema.safeParse({
      holdMinutes: formData.get("holdMinutes"),
      bufferDays: formData.get("bufferDays"),
      gstRate: formData.get("gstRate"),
      surgeEnabled:
        formData.get("surgeEnabled") === "on" ||
        formData.get("surgeEnabled") === "true",
      surgeThresholdPct: formData.get("surgeThresholdPct"),
      surgeMultiplier: formData.get("surgeMultiplier"),
      perkDiscount: formData.get("perkDiscount"),
      perkCostBearer: formData.get("perkCostBearer"),
    });
    if (!parsed.success) return fail(firstIssue(parsed.error));

    const input = parsed.data;
    const sql = getSql();

    await sql`
      update pw_settings set
        hold_minutes = ${input.holdMinutes},
        buffer_days = ${input.bufferDays},
        gst_rate_bp = ${Math.round(input.gstRate * 100)},
        surge_enabled = ${input.surgeEnabled},
        surge_threshold_pct = ${input.surgeThresholdPct},
        surge_multiplier_bp = ${Math.round(input.surgeMultiplier * BP)},
        perk_discount_bp = ${Math.round(input.perkDiscount * 100)},
        perk_cost_bearer = ${input.perkCostBearer},
        updated_at = now()
      where id = 1
    `;

    await recordAudit({
      actor,
      action: "settings.updated",
      subjectType: "settings",
      subjectId: "1",
      after: input,
    });

    updateTag(CATALOG_TAG);
    updateTag(WALL_TAG);
    return ok("Settings saved.");
  } catch (error) {
    return toActionError("updateSettings", error);
  }
}
