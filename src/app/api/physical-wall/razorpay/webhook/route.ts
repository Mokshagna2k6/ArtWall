import { NextResponse } from "next/server";

import { features } from "@/config/site";
import { settleFromWebhook } from "@/features/physical-wall/settlement";
import { validateRazorpayConfig, verifyWebhookSignature } from "@/features/physical-wall/razorpay";

export const dynamic = "force-dynamic";

validateRazorpayConfig();

/**
 * Razorpay webhook (F17).
 *
 * The authoritative way a booking gets paid: Razorpay telling us directly. The
 * client-side verifyPayment action is a fast path that also checks a signature
 * and re-reads the payment from Razorpay; if the browser closes before it runs,
 * this route still settles the booking. Both key the payment on its Razorpay
 * payment id, so whichever arrives second is a no-op.
 *
 * Three properties matter and all three are here:
 *
 *  - **Raw body.** The HMAC is over the exact bytes received. Reading
 *    `request.json()` first and re-serialising reorders keys and changes
 *    whitespace, and the signature stops matching — so the text is read once,
 *    verified, and only then parsed.
 *  - **Idempotency.** Razorpay retries, re-sending the same
 *    `x-razorpay-event-id`. That id goes on pw_payments.event_id (unique) and
 *    the payment id on pw_payments.payment_id (unique); both are checked under
 *    the booking's row lock, so a redelivery — sequential or concurrent — is a
 *    no-op rather than a second payment or ledger entry.
 *  - **Always 200 on a handled event.** A non-2xx makes Razorpay retry, which
 *    is right for a transient failure and wrong for "we already have this" or
 *    "this event isn't one we care about".
 */
export async function POST(request: Request) {
  if (!features.physicalWall) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const rawBody = await request.text();
  const signature = request.headers.get("x-razorpay-signature");

  if (!verifyWebhookSignature(rawBody, signature)) {
    // No detail in the response. An attacker probing this endpoint learns only
    // that it rejected them.
    console.warn("[physical-wall] Rejected an unsigned Razorpay webhook");
    return NextResponse.json({ error: "invalid signature" }, { status: 401 });
  }

  let event: {
    event?: string;
    payload?: {
      payment?: {
        entity?: {
          id?: string;
          order_id?: string;
          amount?: number;
          currency?: string;
          notes?: { bookingId?: string };
        };
      };
    };
  };

  try {
    event = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "unparseable body" }, { status: 400 });
  }

  // Only captures move money. `payment.authorized` means funds are held, not
  // taken, and confirming a booking on it would hand out a slot for a payment
  // that can still fail.
  if (event.event !== "payment.captured") {
    return NextResponse.json({ ignored: event.event ?? "unknown" });
  }

  const payment = event.payload?.payment?.entity;
  // Notes are optional on a payment; settleFromWebhook falls back to our order row.
  const bookingId = payment?.notes?.bookingId ?? null;

  if (!payment?.id || (!bookingId && !payment.order_id)) {
    console.error("[physical-wall] Webhook had no booking reference", event.event);
    return NextResponse.json({ error: "no booking reference" }, { status: 400 });
  }

  // Amount and currency must be present and INR. The actual match against the
  // booking's total happens in settleFromWebhook, where the booking is locked.
  const paidAmountPaise = payment.amount;
  const currency = payment.currency;
  if (
    typeof paidAmountPaise !== "number" ||
    paidAmountPaise <= 0 ||
    currency !== "INR"
  ) {
    console.error("[physical-wall] Webhook missing amount or currency", event.event);
    return NextResponse.json({ error: "invalid amount" }, { status: 400 });
  }

  try {
    const result = await settleFromWebhook({
      bookingId,
      // Razorpay repeats x-razorpay-event-id on every redelivery of one event.
      // Fall back to the payment id (also unique) if the header is missing.
      eventId: request.headers.get("x-razorpay-event-id") || payment.id,
      paymentId: payment.id,
      orderId: payment.order_id ?? null,
      amountPaise: paidAmountPaise,
    });

    if (result === "unknown-order") {
      // Not ours to settle, and retrying won't change that. Logged for reconciliation.
      console.error("[physical-wall] Captured payment for an unknown order", payment.id, payment.order_id);
    }
    return NextResponse.json({ status: result });
  } catch (error) {
    // A 500 here is deliberate: it asks Razorpay to retry, which is what we
    // want when our own database was briefly unavailable.
    console.error("[physical-wall] Could not settle webhook", error);
    return NextResponse.json({ error: "could not settle" }, { status: 500 });
  }
}
