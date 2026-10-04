"use server";

import { z } from "zod";

import { requireRole } from "@/features/physical-wall/authorize";
import {
  createOrder,
  fetchOrder,
  fetchPayment,
  isRazorpayConfigured,
  verifyPaymentSignature,
} from "@/features/physical-wall/razorpay";
import { settleAndRefund } from "@/features/physical-wall/settlement";
import {
  type ActionState,
  fail,
  formInput,
  newId,
  ok,
  parseInput,
  toActionError,
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
    const { bookingId } = formInput(z.object({ bookingId: z.string({ error: "Which booking?" }).min(1, "Which booking?").max(64) }), formData);

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
    if (booking.status === "paid" || booking.status === "completed") {
      // FE-2.03: a retried/double click can land after the webhook already
      // settled this booking from an earlier attempt. Tell the truth instead
      // of "not waiting for payment", which would read as a dead end.
      return ok("This booking is already paid.", { status: "paid", bookingId });
    }
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

const OFFLINE_METHODS = ["cash", "bank_transfer", "upi", "cheque"] as const;

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
    const { bookingId, method, note } = formInput(
      z.object({
        bookingId: z.string({ error: "Which booking?" }).min(1, "Which booking?").max(64),
        method: z.enum(OFFLINE_METHODS, { error: "Choose how the money arrived: cash, bank transfer, UPI or cheque." }),
        note: z.string({ error: "Add the payment reference. This is audited." }).trim().min(3, "Add the payment reference. This is audited.").max(500),
      }),
      formData
    );

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
    const { razorpay_order_id: orderId, razorpay_payment_id: paymentId, razorpay_signature: signature } = parseInput(
      z.object({
        razorpay_order_id: z.string().min(1).max(64),
        razorpay_payment_id: z.string().min(1).max(64),
        razorpay_signature: z.string().min(1).max(256),
      }),
      input
    );
    if (!verifyPaymentSignature(orderId, paymentId, signature)) {
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
 * Just the booking's current status, for the pay button's poll (FE-2.03).
 *
 * The webhook can settle a booking to "paid" concurrently with, or instead
 * of, the client's own verifyPayment call — Razorpay's webhook delivery has
 * no ordering guarantee relative to the browser's redirect back from
 * Checkout. Rather than trusting verifyPayment's single response, the button
 * polls this until the booking itself reads paid (or something else final),
 * so a booking the webhook already paid is never shown stuck as unpaid.
 */
export async function getBookingPaymentStatus(
  bookingId: string
): Promise<{ status: string } | null> {
  try {
    const actor = await requireRole("artist");
    const id = parseInput(z.string().min(1).max(64), bookingId);
    const sql = getSql();
    const rows = (await sql`
      select status from pw_bookings where id = ${id} and artist_id = ${actor.id} limit 1
    `) as { status: string }[];
    return rows[0] ? { status: rows[0].status } : null;
  } catch (error) {
    console.error("[physical-wall] getBookingPaymentStatus", error);
    return null;
  }
}
