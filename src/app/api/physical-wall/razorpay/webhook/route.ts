import { NextResponse } from "next/server";

import { settleFromWebhook } from "@/features/physical-wall/actions/payment";
import { verifyWebhookSignature } from "@/features/physical-wall/razorpay";

export const dynamic = "force-dynamic";

/**
 * Razorpay webhook (F17).
 *
 * This route, and nothing else, is what makes a booking paid. A client callback
 * saying "payment succeeded" is a claim from an untrusted party; a
 * signature-verified webhook is Razorpay telling us directly. Trusting the
 * former is how a booking gets confirmed without money moving.
 *
 * Three properties matter and all three are here:
 *
 *  - **Raw body.** The HMAC is over the exact bytes received. Reading
 *    `request.json()` first and re-serialising reorders keys and changes
 *    whitespace, and the signature stops matching — so the text is read once,
 *    verified, and only then parsed.
 *  - **Idempotency.** Razorpay retries. The event id is stored on a unique
 *    column, so a redelivery is a no-op rather than a second ledger entry.
 *  - **Always 200 on a handled event.** A non-2xx makes Razorpay retry, which
 *    is right for a transient failure and wrong for "we already have this" or
 *    "this event isn't one we care about".
 */
export async function POST(request: Request) {
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
  const bookingId = payment?.notes?.bookingId;

  if (!bookingId || !payment?.id) {
    console.error("[physical-wall] Webhook had no booking reference", event.event);
    return NextResponse.json({ error: "no booking reference" }, { status: 400 });
  }

  try {
    const result = await settleFromWebhook({
      bookingId,
      // Razorpay's payment id is unique per payment and is what a redelivery
      // repeats, so it is the natural idempotency key.
      eventId: payment.id,
      paymentId: payment.id,
      orderId: payment.order_id ?? null,
    });

    return NextResponse.json({ status: result });
  } catch (error) {
    // A 500 here is deliberate: it asks Razorpay to retry, which is what we
    // want when our own database was briefly unavailable.
    console.error("[physical-wall] Could not settle webhook", error);
    return NextResponse.json({ error: "could not settle" }, { status: 500 });
  }
}
