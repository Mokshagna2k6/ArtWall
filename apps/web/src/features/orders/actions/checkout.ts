"use server";

import { z } from "zod";

import { addressSchema } from "@/features/orders/address";
import { requireBuyer } from "@/features/orders/authorize";
import { createPendingOrder, releasePendingOrder } from "@/features/orders/checkout";
import { settleCheckoutPayment } from "@/features/orders/settlement";
import { attempt, inTransaction, newId, parseInput, PreconditionError, type Result } from "@/features/physical-wall/actions/shared";
import {
  createMarketplaceOrder,
  fetchPayment,
  isRazorpayConfigured,
  verifyPaymentSignature,
} from "@/features/physical-wall/razorpay";
import { pool } from "@/lib/db/index";

/**
 * Checkout: one Razorpay payment for the whole cart, however many sellers.
 *
 * Money never comes from the browser. The total is recomputed from the
 * database inside `createPendingOrder`; Razorpay is asked for exactly that
 * figure; and on the way back the amount is read from Razorpay's own payment
 * record (verifyCheckoutPayment) or the signed webhook, then compared with the
 * order again under a row lock in settleCheckoutPayment.
 */

const placeInput = z.object({
  address: addressSchema,
  /** Generated once per checkout page load; a double click or retry returns the same order. */
  idempotencyKey: z.string({ error: "Missing checkout key." }).trim().min(8).max(80),
});

export interface CheckoutStart {
  status: "pay" | "paid";
  orderId: string;
  orderNumber: string;
  providerOrderId: string | null;
  amountPaise: number;
  currency: "INR";
  /** Public by design (Checkout needs it); the secret never leaves the server. */
  keyId: string;
}

export async function placeCheckout(raw: unknown): Promise<Result<CheckoutStart>> {
  return attempt("placeCheckout", async () => {
    const { address, idempotencyKey } = parseInput(placeInput, raw);
    const buyer = await requireBuyer();
    if (!isRazorpayConfigured()) throw new PreconditionError("Online payment is not switched on yet.");
    const keyId = process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID ?? process.env.RAZORPAY_KEY_ID ?? "";

    const order = await inTransaction((client) => createPendingOrder(client, buyer, address, idempotencyKey));
    const base = { orderId: order.orderId, orderNumber: order.orderNumber, amountPaise: order.totalPaise, currency: "INR" as const, keyId };
    if (order.status === "paid") return { ...base, status: "paid" as const, providerOrderId: order.providerOrderId };
    if (order.status !== "pending_payment") throw new PreconditionError("That checkout has expired. Start again from your cart.");
    if (order.providerOrderId) return { ...base, status: "pay" as const, providerOrderId: order.providerOrderId };

    try {
      const rz = await createMarketplaceOrder(order.orderId, order.orderNumber, order.totalPaise);
      await pool.query(`update orders set provider_order_id = $2, updated_at = now() where id = $1 and provider_order_id is null`, [order.orderId, rz.id]);
      await pool.query(
        `insert into order_payments (id, order_id, provider_order_id, amount_paise, status) values ($1, $2, $3, $4, 'created')`,
        [newId("opay"), order.orderId, rz.id, order.totalPaise]
      );
      return { ...base, status: "pay" as const, providerOrderId: rz.id };
    } catch (error) {
      // Razorpay did not give us an order: put the works back on sale rather than hold them for the full window.
      console.error("[orders] could not create Razorpay order", error);
      await inTransaction((client) => releasePendingOrder(client, order.orderId, "cancelled", { kind: "system", id: null })).catch((e) =>
        console.error("[orders] could not release after Razorpay failure", e)
      );
      throw new PreconditionError("We couldn't start the payment. Nothing was charged. Please try again.");
    }
  });
}

const verifyInput = z.object({
  razorpay_order_id: z.string().min(1).max(64),
  razorpay_payment_id: z.string().min(1).max(64),
  razorpay_signature: z.string().min(1).max(256),
});

/**
 * Fast path after Razorpay Checkout's success callback. Whichever of this and
 * the webhook arrives second is a no-op (both key on the payment id).
 */
export async function verifyCheckoutPayment(raw: unknown): Promise<Result<{ status: "paid" | "pending" }>> {
  return attempt("verifyCheckoutPayment", async () => {
    const input = parseInput(verifyInput, raw);
    const buyer = await requireBuyer();
    if (!verifyPaymentSignature(input.razorpay_order_id, input.razorpay_payment_id, input.razorpay_signature)) {
      throw new PreconditionError("We couldn't verify that payment. If money left your account it will be confirmed or refunded automatically.");
    }
    const found = await pool.query<{ id: string }>(`select id from orders where provider_order_id = $1 and buyer_id = $2`, [
      input.razorpay_order_id,
      buyer.id,
    ]);
    if (!found.rows[0]) throw new PreconditionError("That payment is not for one of your orders.");

    // The amount comes from Razorpay, never from this request.
    const payment = await fetchPayment(input.razorpay_payment_id);
    if (payment.order_id !== input.razorpay_order_id) throw new PreconditionError("That payment does not belong to this order.");
    if (payment.status !== "captured") return { status: "pending" as const };

    const outcome = await settleCheckoutPayment({
      orderId: found.rows[0].id,
      providerOrderId: input.razorpay_order_id,
      eventId: null,
      paymentId: payment.id,
      amountPaise: payment.amount,
      currency: payment.currency,
    });
    if (outcome.result === "refund-queued") {
      throw new PreconditionError(`We could not confirm this order (${outcome.reason}). Your payment is being refunded automatically.`);
    }
    return { status: "paid" as const };
  });
}

const orderInput = z.object({ orderId: z.string({ error: "Which order?" }).trim().min(1).max(64) });

/** Polled by the pay button while it waits for the webhook. */
export async function getCheckoutStatus(raw: unknown): Promise<Result<{ status: string }>> {
  return attempt("getCheckoutStatus", async () => {
    const { orderId } = parseInput(orderInput, raw);
    const buyer = await requireBuyer();
    const { rows } = await pool.query<{ status: string }>(`select status from orders where id = $1 and buyer_id = $2`, [orderId, buyer.id]);
    if (!rows[0]) throw new PreconditionError("We couldn't find that order.");
    return { status: rows[0].status };
  });
}

/** The buyer backs out of an unpaid checkout: the works go straight back on sale. */
export async function cancelCheckout(raw: unknown): Promise<Result<null>> {
  return attempt("cancelCheckout", async () => {
    const { orderId } = parseInput(orderInput, raw);
    const buyer = await requireBuyer();
    const released = await inTransaction(async (client) => {
      const o = await client.query<{ buyer_id: string }>(`select buyer_id from orders where id = $1`, [orderId]);
      if (o.rows[0]?.buyer_id !== buyer.id) throw new PreconditionError("We couldn't find that order.");
      return releasePendingOrder(client, orderId, "cancelled", { kind: "buyer", id: buyer.id });
    });
    if (!released) throw new PreconditionError("That checkout is no longer waiting for payment.");
    return null;
  });
}
