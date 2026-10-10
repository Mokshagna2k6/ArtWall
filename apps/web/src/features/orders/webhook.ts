import "server-only";

import { markRefundProcessed } from "@/features/orders/refunds";
import { recordFailedPayment, settleCheckoutPayment } from "@/features/orders/settlement";
import { alertAdmins } from "@/features/physical-wall/notifications";
import { pool } from "@/lib/db/index";

/**
 * Marketplace branch of the shared Razorpay webhook
 * (src/app/api/physical-wall/razorpay/webhook/route.ts).
 *
 * Razorpay allows one webhook URL per secret, so wall bookings and marketplace
 * orders share the route. The route has already verified the signature and the
 * replay window; it hands the parsed body here only when the payment (or
 * refund) carries `notes.orderId`. Wall-booking events (`notes.bookingId`)
 * never reach this file, and this file never reads a booking.
 */

export interface RazorpayEventBody {
  event?: string;
  payload?: {
    payment?: { entity?: PaymentEntity };
    refund?: { entity?: RefundEntity };
  };
}
interface PaymentEntity {
  id?: string;
  order_id?: string;
  amount?: number;
  currency?: string;
  error_code?: string;
  error_description?: string;
  notes?: { orderId?: string } | [];
}
interface RefundEntity {
  id?: string;
  payment_id?: string;
  notes?: { orderId?: string; refundId?: string } | [];
}

const noteOf = (notes: unknown, key: "orderId" | "refundId"): string | null => {
  if (!notes || Array.isArray(notes) || typeof notes !== "object") return null;
  const v = (notes as Record<string, unknown>)[key];
  return typeof v === "string" && v ? v : null;
};

export interface WebhookOutcome {
  http: number;
  body: Record<string, unknown>;
}

export async function handleMarketplaceEvent(event: RazorpayEventBody, eventId: string | null): Promise<WebhookOutcome> {
  const payment = event.payload?.payment?.entity;
  const refund = event.payload?.refund?.entity;

  switch (event.event) {
    case "payment.captured": {
      if (!payment?.id) return { http: 400, body: { error: "no payment reference" } };
      if (typeof payment.amount !== "number" || payment.amount <= 0 || payment.currency !== "INR") {
        return { http: 400, body: { error: "invalid amount" } };
      }
      try {
        const outcome = await settleCheckoutPayment({
          orderId: noteOf(payment.notes, "orderId"),
          providerOrderId: payment.order_id ?? null,
          // Razorpay repeats x-razorpay-event-id on redelivery; the payment id is the fallback key.
          eventId: eventId || payment.id,
          paymentId: payment.id,
          amountPaise: payment.amount,
          currency: payment.currency,
        });
        if (outcome.result === "unknown-order") console.error("[orders] Captured payment for an unknown order", payment.id, payment.order_id);
        return { http: 200, body: { status: outcome.result } };
      } catch (error) {
        console.error("[orders] Could not settle webhook", error);
        await alertAdmins(
          `webhook.razorpay.order-failed:${payment.id}`,
          "Razorpay marketplace webhook settlement failed",
          `payment ${payment.id} (order ${payment.order_id ?? "?"}): ${error instanceof Error ? error.message : String(error)}`
        );
        // 500 asks Razorpay to retry, right for a transient database problem.
        return { http: 500, body: { error: "could not settle" } };
      }
    }
    case "payment.failed": {
      if (!payment?.id) return { http: 400, body: { error: "no payment reference" } };
      await recordFailedPayment({
        orderId: noteOf(payment.notes, "orderId"),
        providerOrderId: payment.order_id ?? null,
        eventId,
        paymentId: payment.id,
        reason: payment.error_code ?? payment.error_description ?? null,
      });
      return { http: 200, body: { status: "recorded" } };
    }
    case "refund.processed": {
      const refundId = noteOf(refund?.notes, "refundId");
      if (!refund?.id || !refundId) return { http: 200, body: { ignored: "no refund reference" } };
      await markRefundProcessed(refundId, refund.id);
      return { http: 200, body: { status: "reconciled" } };
    }
    case "refund.failed": {
      const refundId = noteOf(refund?.notes, "refundId");
      if (!refundId) return { http: 200, body: { ignored: "no refund reference" } };
      // Back to `failed` so the cron retries it; stuck ones page admins after 3 attempts.
      await pool.query(
        `update order_refunds set status = 'failed', last_error = 'Razorpay reported refund.failed', updated_at = now()
         where id = $1 and status <> 'processed'`,
        [refundId]
      );
      return { http: 200, body: { status: "marked-failed" } };
    }
    default:
      return { http: 200, body: { ignored: event.event ?? "unknown" } };
  }
}
