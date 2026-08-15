"use server";

import { updateTag } from "next/cache";

import { recordAuditIn } from "@/features/physical-wall/audit";
import { requireRole } from "@/features/physical-wall/authorize";
import { resolveToken } from "@/features/physical-wall/data/tokens";
import { getSettings } from "@/features/physical-wall/data/catalogs";
import { applyBp, formatINR, toPaise } from "@/features/physical-wall/money";
import { perkRedeemSchema } from "@/features/physical-wall/schema";
import {
  fail,
  firstIssue,
  inTransaction,
  LEDGER_TAG,
  newId,
  ok,
  PreconditionError,
  toActionError,
  type ActionState,
} from "@/features/physical-wall/actions/shared";

/**
 * The Ric Platter coupon (RP01).
 *
 * A member of Platter's counter staff scans an artist's or visitor's code,
 * types the bill total, and the system applies the discount and logs the sale.
 * No POS integration, no menu, no food payments — the scan *is* the sale signal,
 * and `bill_amount_paise` is the single field the whole attribution story rests
 * on.
 *
 * Two things this deliberately does not do:
 *  - collect payment for food (Platter bills directly, so Artwall is not a GST
 *    e-commerce operator), and
 *  - store which dish anyone ate. The bill total is the only figure captured.
 */

export interface PerkPreview {
  principalType: "artist" | "visitor";
  principalName: string;
  eligible: boolean;
  reason?: string;
  discountBp: number;
}

/**
 * What the counter screen shows before the bill is typed.
 *
 * Read-only, so a staff member can scan, see "eligible — Sarita Devi, 10% off",
 * and only then ask for the total. Scanning something invalid should fail before
 * anyone starts arithmetic.
 */
export async function previewPerk(
  token: string
): Promise<{ ok: true; preview: PerkPreview } | { ok: false; message: string }> {
  try {
    await requireRole("staff");

    const resolved = await resolveToken(token);
    if (!resolved.ok) {
      return {
        ok: false,
        message:
          resolved.reason === "expired"
            ? "That coupon has expired. It's valid on the day it was issued."
            : "That code isn't valid.",
      };
    }

    const settings = await getSettings();
    const { subjectType, subjectId } = resolved.subject;
    const { getSql } = await import("@/lib/db");
    const sql = getSql();

    if (subjectType === "visitor") {
      const rows = (await sql`
        select v.name,
               exists (select 1 from pw_perk_redemptions where visit_ref = ${subjectId}) as used
        from pw_visits vi
        join pw_visitors v on v.id = vi.visitor_id
        where vi.id = ${subjectId}
        limit 1
      `) as { name: string; used: boolean }[];

      if (rows.length === 0) {
        return { ok: false, message: "That visit is no longer on file." };
      }

      return {
        ok: true,
        preview: {
          principalType: "visitor",
          principalName: rows[0].name,
          eligible: !rows[0].used,
          reason: rows[0].used ? "Already redeemed on this visit." : undefined,
          discountBp: settings.perkDiscountBp,
        },
      };
    }

    if (subjectType === "artist" || subjectType === "booking") {
      const rows = (await sql`
        select u.name, b.id as booking_id, b.status,
               exists (select 1 from pw_perk_redemptions where booking_ref = b.id) as used
        from pw_bookings b
        join "user" u on u.id = b.artist_id
        where (b.id = ${subjectId} or b.artist_id = ${subjectId})
          and b.status = 'paid'
          and current_date between b.start_date and b.end_date
        order by b.start_date desc
        limit 1
      `) as { name: string; used: boolean }[];

      if (rows.length === 0) {
        return {
          ok: false,
          message: "No active booking for that artist today, so no perk applies.",
        };
      }

      return {
        ok: true,
        preview: {
          principalType: "artist",
          principalName: rows[0].name,
          eligible: !rows[0].used,
          reason: rows[0].used ? "Already redeemed on this booking." : undefined,
          discountBp: settings.perkDiscountBp,
        },
      };
    }

    return { ok: false, message: "That's an artwork label, not a coupon." };
  } catch (error) {
    console.error("[physical-wall] previewPerk", error);
    return { ok: false, message: "Could not check that code." };
  }
}

/**
 * Redeem the coupon and log the sale.
 *
 * Eligibility: an artist needs an active paid booking today, a visitor needs a
 * registered visit. One redemption per visit and per booking, enforced by unique
 * indexes rather than by a check — the counter screen can be open on two phones,
 * and a check would be a race.
 *
 * The attribution comes from what the visitor actually scanned during the visit:
 * the last artwork they looked at is recorded as what drew them in. That is the
 * link between "art on the wall" and "rupees over the counter" the partnership
 * exists to prove.
 */
export async function redeemPerk(
  _previous: ActionState,
  formData: FormData
): Promise<ActionState> {
  try {
    const actor = await requireRole("staff");

    const parsed = perkRedeemSchema.safeParse({
      token: formData.get("token"),
      billAmount: formData.get("billAmount"),
    });
    if (!parsed.success) return fail(firstIssue(parsed.error));

    const billPaise = toPaise(parsed.data.billAmount);
    if (billPaise === null || billPaise <= 0) {
      return fail("Enter the bill total.");
    }

    const resolved = await resolveToken(parsed.data.token);
    if (!resolved.ok) {
      return fail(
        resolved.reason === "expired"
          ? "That coupon has expired."
          : "That code isn't valid."
      );
    }

    const settings = await getSettings();
    const discountPaise = applyBp(billPaise, settings.perkDiscountBp);
    const { subjectType, subjectId } = resolved.subject;

    const summary = await inTransaction(async (client) => {
      let principalType: "artist" | "visitor";
      let principalId: string;
      let visitRef: string | null = null;
      let bookingRef: string | null = null;
      let artworkRef: string | null = null;

      if (subjectType === "visitor") {
        const visit = await client.query<{ visitor_id: string }>(
          `select visitor_id from pw_visits where id = $1`,
          [subjectId]
        );
        if (visit.rowCount === 0) {
          throw new PreconditionError("That visit is no longer on file.");
        }

        principalType = "visitor";
        principalId = visit.rows[0].visitor_id;
        visitRef = subjectId;

        // What drew them in: the last artwork scanned during this visit.
        const scan = await client.query<{ artwork_id: string }>(
          `select artwork_id from pw_scans
           where visit_id = $1 order by created_at desc limit 1`,
          [subjectId]
        );
        artworkRef = scan.rows[0]?.artwork_id ?? null;
      } else {
        const booking = await client.query<{
          id: string;
          artist_id: string;
          artwork_id: string | null;
        }>(
          `select id, artist_id, artwork_id from pw_bookings
           where (id = $1 or artist_id = $1)
             and status = 'paid'
             and current_date between start_date and end_date
           order by start_date desc limit 1`,
          [subjectId]
        );
        if (booking.rowCount === 0) {
          throw new PreconditionError(
            "No active booking for that artist today, so no perk applies."
          );
        }

        principalType = "artist";
        principalId = booking.rows[0].artist_id;
        bookingRef = booking.rows[0].id;
        artworkRef = booking.rows[0].artwork_id;
      }

      const inserted = await client.query(
        `insert into pw_perk_redemptions
           (id, principal_type, principal_id, bill_amount_paise, discount_amount_paise,
            artwork_ref, visit_ref, booking_ref, redeemed_by)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         on conflict do nothing
         returning id`,
        [
          newId("perk"),
          principalType,
          principalId,
          billPaise,
          discountPaise,
          artworkRef,
          visitRef,
          bookingRef,
          actor.id,
        ]
      );

      // The unique index on visit_ref / booking_ref did the work: this coupon
      // has already been used.
      if (inserted.rowCount === 0) {
        throw new PreconditionError(
          "That coupon has already been redeemed. One per visit."
        );
      }

      // Who bears the discount is set in the partnership agreement and mirrored
      // in settings. Only Artwall's own share becomes an expense in our ledger —
      // recording Platter's share as our cost would overstate what the wall
      // costs us.
      const bearerShareBp =
        settings.perkCostBearer === "artwall"
          ? 10_000
          : settings.perkCostBearer === "split"
            ? 5_000
            : 0;
      const ourCost = applyBp(discountPaise, bearerShareBp);

      if (ourCost > 0) {
        await client.query(
          `insert into pw_ledger (id, type, category, amount_paise, note, entry_date, source_ref, created_by)
           values ($1, 'expense', 'platter-perk', $2, $3, current_date, $4, $5)
           on conflict (source_ref) where source_ref is not null do nothing`,
          [
            newId("led"),
            ourCost,
            `Platter perk for ${principalType} — bill ${formatINR(billPaise)}`,
            `perk:${inserted.rows[0].id}`,
            actor.id,
          ]
        );
      }

      await recordAuditIn(client, {
        actor,
        action: "perk.redeemed",
        subjectType: "perk",
        subjectId: String(inserted.rows[0].id),
        after: {
          principalType,
          billPaise,
          discountPaise,
          artworkRef,
          ourCostPaise: ourCost,
        },
      });

      return { discountPaise, billPaise, artworkRef };
    });

    updateTag(LEDGER_TAG);

    return ok(
      `Apply ${formatINR(summary.discountPaise)} off a bill of ${formatINR(summary.billPaise)}. ` +
        `Customer pays ${formatINR(summary.billPaise - summary.discountPaise)}.`,
      summary
    );
  } catch (error) {
    return toActionError("redeemPerk", error);
  }
}
