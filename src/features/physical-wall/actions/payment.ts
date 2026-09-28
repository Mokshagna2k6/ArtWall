"use server";

import { revalidateTag, updateTag } from "next/cache";
import type { PoolClient } from "pg";

import { recordAuditIn } from "@/features/physical-wall/audit";
import { requireRole, type Actor } from "@/features/physical-wall/authorize";
import {
  createOrder,
  fetchOrder,
  fetchPayment,
  isRazorpayConfigured,
  verifyPaymentSignature,
} from "@/features/physical-wall/razorpay";
import { notifyUser } from "@/features/physical-wall/notifications";
import { processRefund, queueRefundIn } from "@/features/physical-wall/refunds";
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
      // The key id is public by design (Checkout needs it); the secret never leaves the server.
      keyId: process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID ?? process.env.RAZORPAY_KEY_ID ?? "",
      currency: order.currency,
      bookingId,
    });
  } catch (error) {
    return toActionError("startPayment", error);
  }
}

type SettleResult =
  | { result: "settled" | "already-settled" }
  /** Money arrived for a booking we cannot confirm; a full refund is queued. */
  | { result: "refund-queued"; refundId: string; reason: string };

/**
 * Mark a booking paid, whatever the money's route in.
 *
 * Called by the webhook and the client verify (both signature-verified) and by
 * the admin offline path. Everything it touches commits together:
 *
 *  - the payment row. Both online paths key it on the Razorpay payment id
 *    (unique), so webhook + client verify, in any order and any number of
 *    times, record one payment;
 *  - the booking status, and each slot to `booked`;
 *  - the ledger entry, with `source_ref` unique so the revenue is counted once.
 *
 * A captured payment is never rejected with an error, because the money has
 * already moved: if the booking cannot be confirmed (cancelled, amount wrong,
 * hold lapsed and the slots were taken, or a second payment for a booking
 * already paid) the payment is recorded and a full refund is queued instead.
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
): Promise<SettleResult> {
  const booking = await client.query<{
    id: string;
    status: string;
    total_amount_paise: number;
    start_date: string;
    end_date: string;
  }>(
    `select id, status, total_amount_paise, start_date::text, end_date::text from pw_bookings
     where id = $1 for update`,
    [options.bookingId]
  );

  if (booking.rowCount === 0) {
    throw new PreconditionError("We couldn't find that booking.");
  }
  const b = booking.rows[0];
  const amount = Number(b.total_amount_paise);
  const online = options.status === "captured";

  // The booking row lock serialises webhook and client verify, so this read is safe.
  if (options.paymentId) {
    const seen = await client.query(`select 1 from pw_payments where payment_id = $1`, [options.paymentId]);
    if (seen.rowCount) return { result: "already-settled" };
  }

  // Why this booking cannot be confirmed, if it can't.
  let blocker: string | null = null;
  if (b.status === "paid" || b.status === "completed") {
    if (!online) return { result: "already-settled" };
    blocker = "booking was already paid (duplicate payment)";
  } else if (!["held", "expired"].includes(b.status)) {
    blocker = `booking is ${b.status}`;
  } else if (online && options.amountPaise !== undefined && options.amountPaise !== amount) {
    blocker = `amount mismatch: expected ${amount} paise, received ${options.amountPaise}`;
  } else {
    // The slots must still be this booking's to take. A held booking's slots
    // are `reserved` for it; an expired one's went back to the wall and may
    // since have been reserved or booked by someone else.
    const slots = await client.query<{ label: string; state: string }>(
      `select s.label, s.state from pw_slots s
       join pw_booking_slots bs on bs.slot_id = s.id
       where bs.booking_id = $1 for update of s`,
      [b.id]
    );
    const wanted = b.status === "held" ? "reserved" : "available";
    const lost = slots.rows.filter((row) => row.state !== wanted);
    const clash =
      b.status === "expired"
        ? await client.query(
            `select 1 from pw_booking_slots bs
             join pw_bookings o on o.id = bs.booking_id
             where o.id <> $1
               and bs.slot_id in (select slot_id from pw_booking_slots where booking_id = $1)
               and o.status in ('held', 'paid', 'completed')
               and (o.status <> 'held' or o.hold_expires_at > now())
               and o.start_date <= ($3::date + coalesce((select buffer_days from pw_settings limit 1), 0))
               and o.end_date   >= ($2::date - coalesce((select buffer_days from pw_settings limit 1), 0))
             limit 1`,
            [b.id, b.start_date, b.end_date]
          )
        : { rowCount: 0 };
    if (slots.rowCount === 0 || lost.length > 0 || clash.rowCount) {
      blocker = `slots no longer available (${lost.map((r) => r.label).join(", ") || "date clash"})`;
    }
  }

  if (blocker && !online) throw new PreconditionError(`Cannot mark paid: ${blocker}.`);

  // Record the money that arrived: always, even when it is going straight back.
  await client.query(
    `insert into pw_payments
       (id, booking_id, provider, order_id, payment_id, event_id, amount_paise, status, notes)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [
      newId("pay"),
      options.bookingId,
      online ? "razorpay" : "manual",
      options.orderId,
      options.paymentId,
      options.eventId,
      online ? options.amountPaise ?? amount : amount,
      // An orphaned payment is 'refunded' so a later policy refund never picks it.
      blocker ? "refunded" : options.status,
      options.note,
    ]
  );

  if (blocker) {
    const refundPaise = options.amountPaise ?? amount;
    const { refundId } = await queueRefundIn(client, {
      bookingId: b.id,
      paymentId: options.paymentId,
      amountPaise: refundPaise,
      reason: `Auto-refund: ${blocker}`,
      actorId: null,
    });
    await recordAuditIn(client, {
      actor: null,
      action: "booking.payment-refunded",
      subjectType: "booking",
      subjectId: b.id,
      after: { paymentId: options.paymentId, refundId, refundPaise, reason: blocker },
    });
    return { result: "refund-queued", refundId, reason: blocker };
  }

  await client.query(
    `update pw_bookings set status = 'paid', hold_expires_at = null, updated_at = now()
     where id = $1`,
    [options.bookingId]
  );

  await client.query(
    `update pw_slots
     set state = 'booked', version = version + 1, updated_at = now()
     where id in (select slot_id from pw_booking_slots where booking_id = $1)`,
    [options.bookingId]
  );

  await client.query(
    `insert into pw_ledger (id, type, category, amount_paise, note, entry_date, source_ref, created_by, booking_id)
     values ($1, 'revenue', 'booking', $2, $3, current_date, $4, $5, $6)
     on conflict (source_ref) where source_ref is not null do nothing`,
    [
      newId("led"),
      amount,
      `Booking ${options.bookingId}`,
      `booking:${options.bookingId}`,
      options.actor?.id ?? null,
      options.bookingId,
    ]
  );

  await recordAuditIn(client, {
    actor: options.actor,
    action: "booking.paid",
    subjectType: "booking",
    subjectId: options.bookingId,
    before: { status: b.status },
    after: { amountPaise: amount, via: options.status, paymentId: options.paymentId, note: options.note },
  });

  return { result: "settled" };
}

/** Settle, then (outside the transaction) send any auto-refund it queued. */
async function settleAndRefund(
  options: Parameters<typeof settleBooking>[1],
  // updateTag only works inside a Server Action; the webhook Route Handler passes revalidateTag.
  expireTag: (tag: string) => void = updateTag
): Promise<SettleResult> {
  const outcome = await inTransaction((client) => settleBooking(client, options));
  if (outcome.result === "refund-queued") await processRefund(outcome.refundId);
  if (outcome.result === "settled") {
    const [b] = (await getSql()`
      select artist_id, start_date::text, end_date::text, total_amount_paise
      from pw_bookings where id = ${options.bookingId}
    `) as { artist_id: string; start_date: string; end_date: string; total_amount_paise: number }[];
    await notifyUser("booking.confirmed", b.artist_id, ({ name }) => ({
      name,
      bookingId: options.bookingId,
      startDate: b.start_date,
      endDate: b.end_date,
      totalPaise: Number(b.total_amount_paise),
    }));
  }
  expireTag(WALL_TAG);
  expireTag(LEDGER_TAG);
  return outcome;
}

const OFFLINE_METHODS = ["cash", "bank_transfer", "upi", "cheque"];

/**
 * Admin: record a payment that arrived OUTSIDE Razorpay (BE-1.13).
 *
 * Form fields: bookingId, method (cash | bank_transfer | upi | cheque), note
 * (the payment reference, at least 3 chars). Audited with the admin as actor.
 *
 * Refused when the booking has a Razorpay order that Razorpay reports paid:
 * that money is online and the webhook/verify path records it; recording it
 * here as well would book one payment twice.
 */
export async function markBookingPaid(
  _previous: ActionState,
  formData: FormData
): Promise<ActionState> {
  try {
    const actor = await requireRole("admin");
    const bookingId = String(formData.get("bookingId") ?? "");
    const method = String(formData.get("method") ?? "");
    const note = String(formData.get("note") ?? "").trim();
    if (!bookingId) return fail("Which booking?");
    if (!OFFLINE_METHODS.includes(method)) {
      return fail("Choose how the money arrived: cash, bank transfer, UPI or cheque.");
    }
    if (note.length < 3) {
      return fail("Add the payment reference. This is audited.");
    }

    if (isRazorpayConfigured()) {
      const orders = (await getSql()`
        select order_id from pw_payments
        where booking_id = ${bookingId} and provider = 'razorpay' and order_id is not null
      `) as { order_id: string }[];
      for (const { order_id } of orders) {
        const order = await fetchOrder(order_id);
        if (order.status === "paid" || order.amount_paid > 0) {
          return fail(
            "This booking was paid online through Razorpay. It confirms automatically, so don't record it by hand."
          );
        }
      }
    }

    const outcome = await settleAndRefund({
      bookingId,
      eventId: null,
      paymentId: null,
      orderId: null,
      status: "manual",
      actor,
      note: `${method}: ${note}`,
    });

    return ok(
      outcome.result === "already-settled"
        ? "That booking was already paid."
        : "Booking confirmed and recorded in the ledger."
    );
  } catch (error) {
    return toActionError("markBookingPaid", error);
  }
}

/**
 * Artist: confirm a Razorpay Checkout success (BE-1.11).
 *
 * Input: exactly what Razorpay Checkout's `handler` callback receives,
 * { razorpay_order_id, razorpay_payment_id, razorpay_signature }.
 *
 * The signature (HMAC-SHA256 of "order_id|payment_id" with the key secret) is
 * checked first; the booking comes from OUR order row, never from the client;
 * the amount comes from Razorpay's own payment record. Idempotent with the
 * webhook: both key the payment on its Razorpay id.
 */
export async function verifyPayment(input: {
  razorpay_order_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
}): Promise<ActionState> {
  try {
    const actor = await requireRole("artist");
    const orderId = String(input?.razorpay_order_id ?? "");
    const paymentId = String(input?.razorpay_payment_id ?? "");
    if (!verifyPaymentSignature(orderId, paymentId, String(input?.razorpay_signature ?? ""))) {
      return fail(
        "We couldn't verify that payment. If money left your account, it will be confirmed or refunded automatically."
      );
    }

    const rows = (await getSql()`
      select p.booking_id from pw_payments p
      join pw_bookings b on b.id = p.booking_id
      where p.order_id = ${orderId} and b.artist_id = ${actor.id}
      limit 1
    `) as { booking_id: string }[];
    const bookingId = rows[0]?.booking_id;
    if (!bookingId) return fail("That payment is not for one of your bookings.");

    const payment = await fetchPayment(paymentId);
    if (payment.order_id !== orderId) return fail("That payment does not belong to this order.");
    if (payment.status !== "captured") {
      // Authorised, not yet captured: the webhook confirms it on capture.
      return ok("Payment received. Your booking will be confirmed in a moment.", {
        bookingId,
        status: "pending",
      });
    }

    const outcome = await settleAndRefund({
      bookingId,
      eventId: paymentId,
      paymentId,
      orderId,
      status: "captured",
      actor,
      note: "Razorpay checkout (client verify)",
      amountPaise: payment.amount,
    });

    if (outcome.result === "refund-queued") {
      return fail(`We couldn't confirm this booking (${outcome.reason}). Your payment is being refunded in full.`);
    }
    return ok("Payment confirmed. Your booking is paid.", { bookingId, status: "paid" });
  } catch (error) {
    return toActionError("verifyPayment", error);
  }
}

/**
 * Webhook entry point (BE-1.12). Called only by the route, after the webhook
 * signature has been verified. The booking comes from the payment's notes or,
 * if absent, from our own order row.
 */
export async function settleFromWebhook(options: {
  bookingId: string | null;
  eventId: string;
  paymentId: string;
  orderId: string | null;
  amountPaise: number;
}): Promise<SettleResult["result"] | "unknown-order"> {
  let bookingId = options.bookingId;
  if (!bookingId && options.orderId) {
    const rows = (await getSql()`
      select booking_id from pw_payments where order_id = ${options.orderId} limit 1
    `) as { booking_id: string }[];
    bookingId = rows[0]?.booking_id ?? null;
  }
  if (!bookingId) return "unknown-order";

  const outcome = await settleAndRefund({
    ...options,
    bookingId,
    status: "captured",
    actor: null,
    note: "Razorpay webhook",
  }, (tag) => revalidateTag(tag, "max"));
  return outcome.result;
}
