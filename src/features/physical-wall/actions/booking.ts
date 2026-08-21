"use server";

import { updateTag } from "next/cache";

import { recordAuditIn } from "@/features/physical-wall/audit";
import { requireRole } from "@/features/physical-wall/authorize";
import {
  getCurrentRefundPolicy,
  getRefundPolicyVersion,
  getSettings,
  listAddons,
} from "@/features/physical-wall/data/catalogs";
import { getActiveGrid, getOccupancyPct } from "@/features/physical-wall/data/wall";
import { formatINR } from "@/features/physical-wall/money";
import { quote, refundAmountPaise, type Quote } from "@/features/physical-wall/pricing";
import { createRefund, isRazorpayConfigured } from "@/features/physical-wall/razorpay";
import {
  cancelBookingSchema,
  quoteRequestSchema,
  reserveSchema,
} from "@/features/physical-wall/schema";
import {
  addDays,
  fail,
  firstIssue,
  inTransaction,
  LEDGER_TAG,
  newId,
  ok,
  PreconditionError,
  toActionError,
  WALL_TAG,
  type ActionState,
} from "@/features/physical-wall/actions/shared";
import { releaseLapsedHoldsIn } from "@/features/physical-wall/expiry";
import { getSql } from "@/lib/db";

/**
 * Booking (F06, F07, F08, F09, F11).
 *
 * Two entry points that must agree: `quoteBooking` prices a basket for display,
 * and `reserveBooking` prices it again inside the transaction that holds the
 * slots. The second one is authoritative. A quote shown in the browser is a
 * preview — re-pricing on the server is what stops a tampered form buying a
 * wall for a rupee.
 */

interface SlotRow {
  id: string;
  state: string;
  base_price_paise: number;
  multiplier_bp: number;
  label: string;
}

/** Price a basket without holding anything. Safe to call on every keystroke. */
export async function quoteBooking(input: unknown): Promise<
  | { ok: true; quote: Quote; endDate: string }
  | { ok: false; message: string }
> {
  const parsed = quoteRequestSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: firstIssue(parsed.error) };

  const { slotIds, durationDays, startDate, addonIds } = parsed.data;

  try {
    const grid = await getActiveGrid();
    if (!grid) return { ok: false, message: "No wall layout is published yet." };

    const [settings, addons, occupancyPct] = await Promise.all([
      getSettings(),
      listAddons(),
      getOccupancyPct(grid.id),
    ]);

    const priced = await loadPricedSlots(slotIds, grid.id);
    if (priced.length !== slotIds.length) {
      return { ok: false, message: "One of those slots is no longer on the wall." };
    }

    const chosenAddons = addons
      .filter((addon) => addonIds.includes(addon.id))
      .map((addon) => ({
        addonId: addon.id,
        label: addon.label,
        pricePaise: addon.pricePaise,
      }));

    return {
      ok: true,
      endDate: addDays(startDate, durationDays - 1),
      quote: quote({
        slots: priced.map((slot) => ({
          slotId: slot.id,
          basePricePaise: slot.base_price_paise,
          typeMultiplierBp: slot.multiplier_bp,
        })),
        durationDays,
        addons: chosenAddons,
        occupancyPct,
        settings,
        totalSlots: grid.rowCount * grid.colCount,
      }),
    };
  } catch (error) {
    console.error("[physical-wall] quote", error);
    return { ok: false, message: "Could not price that. Try again." };
  }
}

async function loadPricedSlots(
  slotIds: string[],
  gridId: string
): Promise<SlotRow[]> {
  const sql = getSql();
  return (await sql.query(
    `select s.id, s.state, s.label, z.base_price_paise, t.multiplier_bp
     from pw_slots s
     join pw_size_catalog z on z.id = s.size_id
     join pw_slot_types   t on t.id = s.type_id
     where s.id = any($1::text[]) and s.grid_id = $2`,
    [slotIds, gridId]
  )) as unknown as SlotRow[];
}

/**
 * Hold a set of slots and open a booking (F07).
 *
 * All-or-nothing, and the transaction is what makes that true rather than
 * aspirational:
 *
 *  - `select … for update of s` locks every requested slot row *before* any of
 *    them is inspected. A second artist reserving the same slot blocks here
 *    until we commit or roll back, and then sees the updated state — so two
 *    people cannot both pass the availability check.
 *  - The overlap check runs inside the same transaction, against the same
 *    snapshot, so an availability read from thirty seconds ago cannot let a
 *    double-booking through.
 *  - Any failure throws, which rolls back every slot update and the booking
 *    rows together. There is no partial reservation to clean up afterwards.
 *
 * The hold expires on its own (`hold_expires_at`); an abandoned checkout stops
 * blocking the slot without anyone having to sweep it, because the availability
 * query treats a lapsed hold as gone.
 */
export async function reserveBooking(
  _previous: ActionState,
  formData: FormData
): Promise<ActionState> {
  try {
    const actor = await requireRole("artist");

    const parsed = reserveSchema.safeParse({
      slotIds: formData.getAll("slotIds").map(String),
      durationDays: formData.get("durationDays"),
      startDate: formData.get("startDate"),
      addonIds: formData.getAll("addonIds").map(String),
      artworkId: formData.get("artworkId") || undefined,
    });
    if (!parsed.success) return fail(firstIssue(parsed.error));

    const { slotIds, durationDays, startDate, addonIds, artworkId } = parsed.data;
    const endDate = addDays(startDate, durationDays - 1);

    const grid = await getActiveGrid();
    if (!grid) return fail("No wall layout is published yet.");

    const [settings, addons, occupancyPct, refundPolicy] = await Promise.all([
      getSettings(),
      listAddons(),
      getOccupancyPct(grid.id),
      getCurrentRefundPolicy(),
    ]);

    const bookingId = await inTransaction(async (client) => {
      // 0. Return any slot whose hold has lapsed before we look at the wall.
      //    Without this, a slot abandoned mid-checkout half an hour ago is
      //    still sitting at `reserved` and this reservation would be refused
      //    with "taken while you were choosing" — for a slot nobody holds.
      await releaseLapsedHoldsIn(client);

      // 1. Lock the slots. Everything after this point sees a stable world.
      const locked = await client.query<SlotRow>(
        `select s.id, s.state, s.label, z.base_price_paise, t.multiplier_bp
         from pw_slots s
         join pw_size_catalog z on z.id = s.size_id
         join pw_slot_types   t on t.id = s.type_id
         where s.id = any($1::text[]) and s.grid_id = $2
         for update of s`,
        [slotIds, grid.id]
      );

      if (locked.rows.length !== slotIds.length) {
        throw new PreconditionError(
          "One of those slots is no longer on the wall. Reload and choose again."
        );
      }

      const taken = locked.rows.filter((row) => row.state !== "available");
      if (taken.length > 0) {
        throw new PreconditionError(
          `${taken.map((row) => row.label).join(", ")} ${
            taken.length === 1 ? "was" : "were"
          } taken while you were choosing. Nothing has been booked — pick again.`
        );
      }

      // 2. Date overlap, in the same snapshot as the lock.
      const clash = await client.query<{ label: string }>(
        `select s.label
         from pw_booking_slots bs
         join pw_bookings b on b.id = bs.booking_id
         join pw_slots s    on s.id = bs.slot_id
         where bs.slot_id = any($1::text[])
           and b.status in ('held', 'paid', 'completed')
           and (b.status <> 'held' or b.hold_expires_at > now())
           and b.start_date <= ($3::date + $4::int)
           and b.end_date   >= ($2::date - $4::int)
         limit 5`,
        [slotIds, startDate, endDate, settings.bufferDays]
      );

      if (clash.rows.length > 0) {
        throw new PreconditionError(
          `${clash.rows.map((row) => row.label).join(", ")} already has a booking over those dates.`
        );
      }

      // 3. The artwork must belong to the artist reserving. Without this, a
      //    guessed id would let anyone hang someone else's work on the wall.
      if (artworkId) {
        const owned = await client.query(
          `select 1 from artworks where id = $1 and "userId" = $2`,
          [artworkId, actor.id]
        );
        if (owned.rowCount === 0) {
          throw new PreconditionError("That artwork is not yours to place.");
        }
      }

      // 4. Price it here, from the locked rows — not from anything the client sent.
      const chosenAddons = addons
        .filter((addon) => addonIds.includes(addon.id))
        .filter((addon) => addon.appliesTo === "artist" || addon.appliesTo === "both")
        .map((addon) => ({
          addonId: addon.id,
          label: addon.label,
          pricePaise: addon.pricePaise,
        }));

      const priced = quote({
        slots: locked.rows.map((row) => ({
          slotId: row.id,
          basePricePaise: row.base_price_paise,
          typeMultiplierBp: row.multiplier_bp,
        })),
        durationDays,
        addons: chosenAddons,
        occupancyPct,
        settings,
        totalSlots: grid.rowCount * grid.colCount,
      });

      const id = newId("bk");
      const holdExpiry = `${settings.holdMinutes} minutes`;

      await client.query(
        `insert into pw_bookings
           (id, artist_id, artwork_id, status, start_date, end_date, duration_days,
            base_amount_paise, addon_amount_paise, discount_amount_paise,
            gst_amount_paise, total_amount_paise, surge_applied,
            refund_policy_version, hold_expires_at)
         values ($1, $2, $3, 'held', $4::date, $5::date, $6, $7, $8, $9, $10, $11, $12, $13,
                 now() + $14::interval)`,
        [
          id,
          actor.id,
          artworkId ?? null,
          startDate,
          endDate,
          durationDays,
          priced.basePaise,
          priced.addonsPaise,
          priced.discountPaise,
          priced.gstPaise,
          priced.totalPaise,
          priced.surgeApplied,
          refundPolicy?.version ?? null,
          holdExpiry,
        ]
      );

      for (const line of priced.lines) {
        await client.query(
          `insert into pw_booking_slots (booking_id, slot_id, quoted_price_paise)
           values ($1, $2, $3)`,
          [id, line.slotId, line.pricePaise]
        );
        // available -> reserved, re-asserting the state in the WHERE clause.
        // We hold the lock so this cannot fail, and it is checked anyway: a
        // zero-row update here would mean the lock did not do what we think it
        // does, and that is worth failing loudly over rather than shipping a
        // booking whose slots were never actually held.
        const moved = await client.query(
          `update pw_slots
           set state = 'reserved', version = version + 1, updated_at = now()
           where id = $1 and state = 'available'`,
          [line.slotId]
        );
        if (moved.rowCount !== 1) {
          throw new PreconditionError(
            "A slot changed state mid-reservation. Nothing has been booked."
          );
        }
      }

      for (const addon of chosenAddons) {
        await client.query(
          `insert into pw_booking_addons (id, booking_id, addon_id, label, price_paise)
           values ($1, $2, $3, $4, $5)`,
          [newId("ba"), id, addon.addonId, addon.label, addon.pricePaise]
        );
      }

      await recordAuditIn(client, {
        actor,
        action: "booking.reserved",
        subjectType: "booking",
        subjectId: id,
        after: {
          slotIds,
          durationDays,
          startDate,
          endDate,
          totalPaise: priced.totalPaise,
          refundPolicyVersion: refundPolicy?.version ?? null,
        },
      });

      return id;
    });

    updateTag(WALL_TAG);
    return ok("Slots held. Complete payment to confirm the booking.", {
      bookingId,
    });
  } catch (error) {
    return toActionError("reserveBooking", error);
  }
}

/**
 * Attach an artwork to a booking that was made without one (F09).
 *
 * Separate from reserving because an artist often books the dates first and
 * decides what to hang later — and because forcing an upload into the
 * reservation transaction would hold slot locks across a file upload.
 */
export async function attachArtwork(
  _previous: ActionState,
  formData: FormData
): Promise<ActionState> {
  try {
    const actor = await requireRole("artist");
    const bookingId = String(formData.get("bookingId") ?? "");
    const artworkId = String(formData.get("artworkId") ?? "");
    if (!bookingId || !artworkId) return fail("Choose an artwork.");

    const sql = getSql();

    // Both ownership checks in the update itself: the booking must be the
    // artist's and the artwork must be theirs too.
    const rows = (await sql`
      update pw_bookings
      set artwork_id = ${artworkId}, updated_at = now()
      where id = ${bookingId}
        and artist_id = ${actor.id}
        and status in ('held', 'paid')
        and exists (
          select 1 from artworks
          where id = ${artworkId} and "userId" = ${actor.id}
        )
      returning id
    `) as { id: string }[];

    if (rows.length === 0) {
      return fail("That booking or artwork is not available to change.");
    }

    await sql`
      update artworks set "physicalStatus" = 'booked'
      where id = ${artworkId} and "userId" = ${actor.id}
    `;

    updateTag(WALL_TAG);
    return ok("Artwork attached to the booking.");
  } catch (error) {
    return toActionError("attachArtwork", error);
  }
}

/**
 * Artist cancels their own booking (F10).
 *
 * Two paths:
 *
 *  - **Held** bookings have not been paid. Slots go from `reserved` back to
 *    `available` (not admin-only in the state machine) and that is it — no
 *    refund, no ledger entry.
 *
 *  - **Paid** bookings are refunded according to the policy version snapshotted
 *    at booking time, *not* whatever policy is current now. The slot transition
 *    (`booked -> available`) would normally require admin in the state machine,
 *    so we bypass `assertTransition` and drive the SQL directly — the action is
 *    the artist's, the policy authorises it, and routing it through forceRelease
 *    would misattribute the action.
 *
 * Once a booking reaches `received`, `installed` or `live`, the artwork is
 * physically at the venue and a self-service cancel would leave a blank wall, so
 * those statuses are rejected here and the artist is told to contact the team.
 */
export async function cancelBooking(
  _previous: ActionState,
  formData: FormData
): Promise<ActionState> {
  try {
    const actor = await requireRole("artist");

    const parsed = cancelBookingSchema.safeParse({
      bookingId: formData.get("bookingId"),
      reason: formData.get("reason") || undefined,
    });
    if (!parsed.success) return fail(firstIssue(parsed.error));

    const { bookingId, reason } = parsed.data;

    const outcome = await inTransaction(async (client) => {
      const row = await client.query<{
        id: string;
        artist_id: string;
        status: string;
        total_amount_paise: number;
        refund_policy_version: number | null;
        artwork_id: string | null;
      }>(
        `select id, artist_id, status, total_amount_paise,
                refund_policy_version, artwork_id
         from pw_bookings
         where id = $1
         for update`,
        [bookingId]
      );
      if (row.rowCount === 0) throw new PreconditionError("No such booking.");

      const booking = row.rows[0];

      if (booking.artist_id !== actor.id) {
        throw new PreconditionError("That booking is not yours.");
      }

      if (!["held", "paid"].includes(booking.status)) {
        throw new PreconditionError(
          booking.status === "cancelled" || booking.status === "refunded"
            ? "This booking has already been cancelled."
            : "This booking is too far along to cancel online. Contact the ArtWall team for help."
        );
      }

      let refundPaise = 0;
      let policyLabel = "no refund due";

      if (booking.status === "paid" && booking.refund_policy_version) {
        const policy = await getRefundPolicyVersion(
          booking.refund_policy_version
        );
        if (policy) {
          refundPaise = refundAmountPaise(
            Number(booking.total_amount_paise),
            policy.percentage
          );
          policyLabel = `v${policy.version} at ${policy.percentage}%`;
        }
      }

      await client.query(
        `update pw_bookings
         set status = $2, cancelled_reason = $3, hold_expires_at = null, updated_at = now()
         where id = $1`,
        [
          booking.id,
          refundPaise > 0 ? "refunded" : "cancelled",
          reason ?? "Artist-initiated cancellation",
        ]
      );

      if (refundPaise > 0) {
        let razorpayRefundId: string | null = null;
        if (isRazorpayConfigured()) {
          const payment = await client.query<{ payment_id: string }>(
            `select payment_id from pw_payments
             where booking_id = $1 and provider = 'razorpay' and status = 'captured' and payment_id is not null
             order by created_at desc limit 1`,
            [booking.id]
          );
          if (payment.rows[0]?.payment_id) {
            const refund = await createRefund(
              payment.rows[0].payment_id,
              refundPaise,
              booking.id
            );
            razorpayRefundId = refund.id;
          }
        }

        await client.query(
          `insert into pw_ledger (id, type, category, amount_paise, note, entry_date, source_ref, created_by)
           values ($1, 'expense', 'refund', $2, $3, current_date, $4, $5)
           on conflict (source_ref) where source_ref is not null do nothing`,
          [
            newId("led"),
            refundPaise,
            `Refund for ${booking.id} — ${policyLabel}${razorpayRefundId ? ` (${razorpayRefundId})` : ""}. Artist-initiated.`,
            `refund:${booking.id}`,
            actor.id,
          ]
        );
      }

      // Release all slots back to available.
      await client.query(
        `update pw_slots
         set state = 'available', version = version + 1, updated_at = now()
         where id in (select slot_id from pw_booking_slots where booking_id = $1)`,
        [booking.id]
      );

      // Clear artwork physicalStatus if one was attached.
      if (booking.artwork_id) {
        await client.query(
          `update artworks set "physicalStatus" = null
           where id = $1`,
          [booking.artwork_id]
        );
      }

      await recordAuditIn(client, {
        actor,
        action: "booking.cancelled",
        subjectType: "booking",
        subjectId: booking.id,
        before: { status: booking.status },
        after: {
          status: refundPaise > 0 ? "refunded" : "cancelled",
          refundPaise,
          refundPolicy: policyLabel,
          reason: reason ?? "Artist-initiated cancellation",
        },
      });

      return { refundPaise, policyLabel };
    });

    updateTag(WALL_TAG);
    updateTag(LEDGER_TAG);

    if (outcome.refundPaise > 0) {
      return ok(
        `Booking cancelled. A refund of ${formatINR(outcome.refundPaise)} has been initiated under ${outcome.policyLabel}.`
      );
    }
    return ok("Booking cancelled. No payment was made, so no refund is needed.");
  } catch (error) {
    return toActionError("cancelBooking", error);
  }
}
