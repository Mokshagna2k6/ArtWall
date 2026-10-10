import { NextResponse } from "next/server";

import { features } from "@/config/site";
import { alertAdmins } from "@/features/physical-wall/notifications";
import { settleFromWebhook } from "@/features/physical-wall/settlement";
import { validateRazorpayConfig, verifyWebhookSignature } from "@/features/physical-wall/razorpay";
import { getSql } from "@/lib/db";

export const dynamic = "force-dynamic";

validateRazorpayConfig();

/**
 * Uptime check (PERF-3.02). The webhook itself is POST-only and signature
 * gated, so an external uptime monitor has nothing to poll — this GET is that
 * endpoint. Checks the one dependency this route actually needs (the
 * database) plus that Razorpay config is present; either failing means the
 * POST handler would also fail, so this is a true "is this route up" signal,
 * not just "is the server running".
 */
export async function GET() {
  if (!features.physicalWall) return NextResponse.json({ error: "Not found" }, { status: 404 });
  try {
    await getSql()`select 1`;
  } catch (error) {
    console.error("[physical-wall] Webhook health check: database unreachable", error);
    return NextResponse.json({ status: "down", reason: "database" }, { status: 503 });
  }
  if (!process.env.RAZORPAY_WEBHOOK_SECRET) {
    return NextResponse.json({ status: "down", reason: "config" }, { status: 503 });
  }
  return NextResponse.json({ status: "ok" });
}

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
 *  - **Replay window (SEC-2.14).** A signature alone proves the body was signed
 *    by Razorpay at *some* point — it says nothing about *when*. A captured
 *    signed payload replayed a year later would still verify and would still
 *    settle (the event/payment id dedup only catches a SECOND delivery of an
 *    event we already recorded, not a first-looking delivery of an old,
 *    previously-unprocessed one). Razorpay's own payload carries a top-level
 *    unix `created_at`; requests outside a tight window of "now" are rejected
 *    before touching the database.
 *  - **Always 200 on a handled event.** A non-2xx makes Razorpay retry, which
 *    is right for a transient failure and wrong for "we already have this" or
 *    "this event isn't one we care about".
 */
const WEBHOOK_REPLAY_WINDOW_SECONDS = 5 * 60;

export async function POST(request: Request) {
  // Two products share this URL (Razorpay allows one per secret): wall
  // bookings and marketplace orders. Each branch below is gated by its own flag.
  if (!features.physicalWall && !features.marketplaceCheckout) return NextResponse.json({ error: "Not found" }, { status: 404 });
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
    created_at?: number;
    payload?: {
      payment?: {
        entity?: {
          id?: string;
          order_id?: string;
          amount?: number;
          currency?: string;
          notes?: { bookingId?: string; orderId?: string };
        };
      };
      refund?: { entity?: { id?: string; payment_id?: string; notes?: { orderId?: string; refundId?: string } } };
    };
  };

  try {
    event = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "unparseable body" }, { status: 400 });
  }

  // SEC-2.14: reject a signed payload whose own `created_at` is not within a
  // tight window of now, in either direction. Caught *after* signature
  // verification (so a forged/garbage timestamp from a non-Razorpay sender
  // never reaches this check) and before any booking lookup or settlement.
  if (typeof event.created_at === "number") {
    const ageSeconds = Math.abs(Date.now() / 1000 - event.created_at);
    if (ageSeconds > WEBHOOK_REPLAY_WINDOW_SECONDS) {
      console.warn("[physical-wall] Rejected a Razorpay webhook outside the replay window", {
        createdAt: event.created_at,
        ageSeconds,
      });
      return NextResponse.json({ error: "stale event" }, { status: 401 });
    }
  }

  // Marketplace orders (notes.orderId, on the payment or the refund) are handled
  // by their own module; wall bookings (notes.bookingId) fall through,
  // unchanged, to the code below. Imported lazily: a booking event never loads
  // the orders code.
  if (event.payload?.payment?.entity?.notes?.orderId || event.payload?.refund?.entity?.notes?.orderId) {
    if (!features.marketplaceCheckout) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const { handleMarketplaceEvent } = await import("@/features/orders/webhook");
    const outcome = await handleMarketplaceEvent(event, request.headers.get("x-razorpay-event-id"));
    return NextResponse.json(outcome.body, { status: outcome.http });
  }
  if (!features.physicalWall) return NextResponse.json({ error: "Not found" }, { status: 404 });

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
    // PERF-3.01: alert on webhook failure. Deduped per payment id, so a burst
    // of Razorpay retries for the same failing payment pages once, not per
    // retry; a different payment id (i.e. the failure is spreading, not one
    // stuck payment) pages again.
    await alertAdmins(
      `webhook.razorpay.failed:${payment.id}`,
      "Razorpay webhook settlement failed",
      `payment ${payment.id} (order ${payment.order_id ?? "?"}): ${error instanceof Error ? error.message : String(error)}`
    );
    return NextResponse.json({ error: "could not settle" }, { status: 500 });
  }
}
