"use server";

import { updateTag } from "next/cache";
import type { PoolClient } from "pg";

import { recordAuditIn } from "@/features/physical-wall/audit";
import { requireRole, type Actor } from "@/features/physical-wall/authorize";
import { createOrder, isRazorpayConfigured } from "@/features/physical-wall/razorpay";
import {
  fail,
  inTransaction,
  LEDGER_TAG,
  newId,
  ok,
  PreconditionError,
  toActionError,
  WALL_TAG,
  type ActionState,
} from "@/features/physical-wall/actions/shared";
import { getSql } from "@/lib/db";

/**
 * Payments (F17).
 *
 * A booking becomes `paid` in exactly one function — `settleBooking` — which
 * both the verified webhook and the admin fallback call. One code path means
 * the slot transitions, the payment row and the ledger entry cannot drift apart
 * depending on how the money arrived.
 */

/** Start a Razorpay checkout for a held booking. */
export async function startPayment(
  _previous: ActionState,
  formData: FormData
): Promise<ActionState> {
  try {
    const actor = await requireRole("artist");
    const bookingId = String(formData.get("bookingId") ?? "");
    if (!bookingId) return fail("Which booking?");

    if (!isRazorpayConfigured()) {
      return fail(
        "Online payment is not switched on yet. An admin can confirm this booking manually."
      );
    }

    const sql = getSql();
    const rows = (await sql`
      select id, total_amount_paise, status, hold_expires_at
      from pw_bookings
      where id = ${bookingId} and artist_id = ${actor.id}
      limit 1
    `) as Record<string, unknown>[];

    const booking = rows[0];
    if (!booking) return fail("We couldn't find that booking.");
    if (booking.status !== "held") {
      return fail("That booking is not waiting for payment.");
    }
    if (
      booking.hold_expires_at &&
      new Date(String(booking.hold_expires_at)) < new Date()
    ) {
      return fail("The hold on those slots has expired. Please choose again.");
    }

    const order = await createOrder(
      bookingId,
      Number(booking.total_amount_paise)
    );

    await sql`
      insert into pw_payments (id, booking_id, provider, order_id, amount_paise, status)
      values (${newId("pay")}, ${bookingId}, 'razorpay', ${order.id},
              ${Number(booking.total_amount_paise)}, 'created')
    `;

    return ok("Order created.", {
      orderId: order.id,
      amount: order.amount,
      keyId: process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID ?? "",
    });
  } catch (error) {
    return toActionError("startPayment", error);
  }
}

/**
 * Mark a booking paid, whatever the money's route in.
 *
 * Called by the webhook (signature already verified) and by the admin fallback.
 * Everything it touches commits together:
 *
 *  - the payment row, with `event_id` unique so a replayed webhook is a no-op,
 *  - the booking status,
 *  - each slot from `reserved` to `booked`,
 *  - the ledger entry, with `source_ref` unique so the revenue is counted once.
 *
 * Idempotency is enforced by those two unique indexes rather than by a check
 * that "already paid" — a check is a race, an index is a guarantee.
 */
async function settleBooking(
  client: PoolClient,
  options: {
    bookingId: string;
    eventId: string | null;
    paymentId: string | null;
    orderId: string | null;
    status: "captured" | "manual";
    actor: Actor | null;
    note: string;
    /** The amount Razorpay actually captured, in paise. Verified against the booking. */
    amountPaise?: number;
  }
): Promise<"settled" | "already-settled"> {
  const booking = await client.query<{
    id: string;
    status: string;
    total_amount_paise: number;
  }>(
    `select id, status, total_amount_paise from pw_bookings
     where id = $1 for update`,
    [options.bookingId]
  );

  if (booking.rowCount === 0) {
    throw new PreconditionError("We couldn't find that booking.");
  }
  if (booking.rows[0].status === "paid") return "already-settled";
  if (!["held", "expired"].includes(booking.rows[0].status)) {
    throw new PreconditionError(
      `That booking is ${booking.rows[0].status} and cannot be marked paid.`
    );
  }

  const amount = Number(booking.rows[0].total_amount_paise);

  // For webhook-settled bookings, the captured amount must match the booking
  // total exactly. A mismatch means the payment was for a different amount
  // than we quoted — refuse to confirm rather than accept a wrong price.
  if (options.status === "captured" && options.amountPaise !== undefined) {
    if (options.amountPaise !== amount) {
      throw new PreconditionError(
        `Payment amount mismatch: expected ${amount} paise, received ${options.amountPaise} paise.`
      );
    }
  }

  const payment = await client.query(
    `insert into pw_payments
       (id, booking_id, provider, order_id, payment_id, event_id, amount_paise, status, notes)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     on conflict (event_id) do nothing`,
    [
      newId("pay"),
      options.bookingId,
      options.status === "manual" ? "manual" : "razorpay",
      options.orderId,
      options.paymentId,
      options.eventId,
      amount,
      options.status,
      options.note,
    ]
  );

  // The webhook has been delivered before and we already handled it.
  if (options.eventId && payment.rowCount === 0) return "already-settled";

  await client.query(
    `update pw_bookings set status = 'paid', hold_expires_at = null, updated_at = now()
     where id = $1`,
    [options.bookingId]
  );

  // reserved -> booked for every slot on the booking. Held bookings whose
  // slots were force-released by an admin in the meantime simply match nothing.
  await client.query(
    `update pw_slots
     set state = 'booked', version = version + 1, updated_at = now()
     where id in (select slot_id from pw_booking_slots where booking_id = $1)
       and state = 'reserved'`,
    [options.bookingId]
  );

  await client.query(
    `insert into pw_ledger (id, type, category, amount_paise, note, entry_date, source_ref, created_by)
     values ($1, 'revenue', 'booking', $2, $3, current_date, $4, $5)
     on conflict (source_ref) where source_ref is not null do nothing`,
    [
      newId("led"),
      amount,
      `Booking ${options.bookingId}`,
      `booking:${options.bookingId}`,
      options.actor?.id ?? null,
    ]
  );

  await recordAuditIn(client, {
    actor: options.actor,
    action: "booking.paid",
    subjectType: "booking",
    subjectId: options.bookingId,
    after: { amountPaise: amount, via: options.status, eventId: options.eventId },
  });

  return "settled";
}

/**
 * The admin fallback: confirm a booking without a PSP.
 *
 * Not a stub. A bank transfer, a UPI payment made in person, or a cash payment
 * at the venue all need recording, and this is the honest way to record them —
 * with an actor in the audit log and a note saying how the money arrived.
 */
export async function markBookingPaid(
  _previous: ActionState,
  formData: FormData
): Promise<ActionState> {
  try {
    const actor = await requireRole("admin");
    const bookingId = String(formData.get("bookingId") ?? "");
    const note = String(formData.get("note") ?? "").trim();
    if (!bookingId) return fail("Which booking?");
    if (note.length < 3) {
      return fail("Say how the payment arrived — this is audited.");
    }

    const result = await inTransaction((client) =>
      settleBooking(client, {
        bookingId,
        eventId: null,
        paymentId: null,
        orderId: null,
        status: "manual",
        actor,
        note,
      })
    );

    updateTag(WALL_TAG);
    updateTag(LEDGER_TAG);

    return ok(
      result === "already-settled"
        ? "That booking was already paid."
        : "Booking confirmed and recorded in the ledger."
    );
  } catch (error) {
    return toActionError("markBookingPaid", error);
  }
}

/**
 * Webhook entry point. Called only by the route, and only after the signature
 * has been verified — this function trusts its caller on that and nothing else.
 */
export async function settleFromWebhook(options: {
  bookingId: string;
  eventId: string;
  paymentId: string | null;
  orderId: string | null;
  amountPaise: number;
}): Promise<"settled" | "already-settled"> {
  const result = await inTransaction((client) =>
    settleBooking(client, {
      ...options,
      status: "captured",
      actor: null,
      note: "Razorpay webhook",
    })
  );

  updateTag(WALL_TAG);
  updateTag(LEDGER_TAG);
  return result;
}