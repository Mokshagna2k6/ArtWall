import "server-only";

import type { PoolClient } from "pg";

import { captureSellerOrderEscrow } from "@/features/orders/escrow";
import { notifyOrderUser } from "@/features/orders/notify";
import { processOrderRefund, queueOrphanRefundIn } from "@/features/orders/refunds";
import { getMarketplaceSettings } from "@/features/orders/settings";
import { recordOrderEvent, transitionSellerOrder } from "@/features/orders/transitions";
import { inTransaction, newId } from "@/features/physical-wall/actions/shared";
import { pool } from "@/lib/db/index";

/**
 * Settlement: the one place a checkout becomes `paid`.
 *
 * Deliberately NOT a "use server" module, for the same reason as
 * physical-wall/settlement.ts: every export of a "use server" file is callable
 * from a browser, and settleCheckoutPayment trusts its caller to have verified
 * the Razorpay signature (webhook route) or the checkout signature plus a
 * Razorpay API re-read (verifyCheckoutPayment).
 */

export type CheckoutSettleResult =
  | { result: "settled" | "already-settled" | "unknown-order" }
  /** Money arrived that cannot be attached to a payable order; the whole payment is being refunded. */
  | { result: "refund-queued"; refundId: string; reason: string };

export interface SettleInput {
  /** Our order id (from the payment's notes), if the payment carried one. */
  orderId: string | null;
  /** Razorpay's order id: the fallback lookup when notes are missing. */
  providerOrderId: string | null;
  eventId: string | null;
  paymentId: string;
  amountPaise: number;
  currency: string;
}

async function settleInTransaction(client: PoolClient, input: SettleInput): Promise<CheckoutSettleResult> {
  const found = await client.query<{
    id: string;
    status: string;
    total_paise: number;
    buyer_id: string;
    order_number: string;
  }>(
    `select id, status, total_paise, buyer_id, order_number from orders
     where ($1::text is not null and id = $1) or ($2::text is not null and provider_order_id = $2)
     order by (id = $1) desc nulls last limit 1 for update`,
    [input.orderId, input.providerOrderId]
  );
  const order = found.rows[0];
  if (!order) return { result: "unknown-order" };

  // Idempotency, under the order lock: a replayed event, or the other path's
  // record of the same captured payment, leaves nothing to do.
  const seen = await client.query<{ id: string; status: string }>(
    `select id, status from order_payments
     where order_id = $1 and (event_id = $2 or provider_payment_id = $3)`,
    [order.id, input.eventId, input.paymentId]
  );
  if (seen.rows.some((r) => r.status !== "failed")) return { result: "already-settled" };

  // Why this payment cannot confirm the order, if it can't.
  let blocker: string | null = null;
  if (order.status === "paid") blocker = "order was already paid (duplicate payment)";
  else if (order.status !== "pending_payment") blocker = `order is ${order.status}`;
  else if (input.currency !== "INR" || input.amountPaise !== order.total_paise) {
    blocker = `amount mismatch: expected ${order.total_paise} paise INR, received ${input.amountPaise} ${input.currency}`;
  } else {
    // Every work must still be ours to sell. (A checkout past its hold but not yet swept still is.)
    const lost = await client.query(
      `select 1 from order_items oi join artworks a on a.id = oi.artwork_id
       where oi.order_id = $1 and (not oi.active or a.status <> 'reserved') limit 1`,
      [order.id]
    );
    if (lost.rowCount) blocker = "a work in this order is no longer reserved for it";
  }

  // The payment row: update a prior failed attempt of the same payment, else insert.
  const failed = seen.rows.find((r) => r.status === "failed");
  const rowStatus = blocker ? "refunded" : "captured";
  if (failed) {
    await client.query(
      `update order_payments set status = $2, event_id = coalesce($3, event_id), amount_paise = $4, captured_at = now(), failure_code = null where id = $1`,
      [failed.id, rowStatus, input.eventId, input.amountPaise]
    );
  } else {
    await client.query(
      `insert into order_payments (id, order_id, provider_order_id, provider_payment_id, event_id, amount_paise, status, captured_at)
       values ($1, $2, $3, $4, $5, $6, $7, now())`,
      [newId("opay"), order.id, input.providerOrderId, input.paymentId, input.eventId, input.amountPaise, rowStatus]
    );
  }

  if (blocker) {
    // Money moved but the order cannot be confirmed: never resurrect a released
    // reservation, send the whole payment back.
    const refundId = await queueOrphanRefundIn(client, {
      orderId: order.id,
      paymentId: input.paymentId,
      amountPaise: input.amountPaise,
      reason: `Auto-refund: ${blocker}`,
    });
    await recordOrderEvent(client, { orderId: order.id, sellerOrderId: null, from: order.status, to: order.status, actorId: null, note: `Payment ${input.paymentId} refunded: ${blocker}` });
    return { result: "refund-queued", refundId, reason: blocker };
  }

  const settings = await getMarketplaceSettings(client);
  await client.query(`update orders set status = 'paid', paid_at = now(), updated_at = now() where id = $1`, [order.id]);
  await recordOrderEvent(client, { orderId: order.id, sellerOrderId: null, from: "pending_payment", to: "paid", actorId: null, note: `Payment ${input.paymentId}` });

  const sos = await client.query<{ id: string; total_paise: number; commission_policy_version_id: string }>(
    `select id, total_paise, commission_policy_version_id from seller_orders where order_id = $1 order by id`,
    [order.id]
  );
  const acceptBy = new Date(Date.now() + settings.sellerAcceptHours * 3_600_000);
  for (const so of sos.rows) {
    await transitionSellerOrder(client, so.id, "paid", { actor: "system", actorId: null, note: "Payment captured", set: { paid_at: new Date(), accept_by: acceptBy } });
    await captureSellerOrderEscrow(client, so, settings.disputeWindowDays);
  }
  await client.query(
    `update artworks set status = 'sold', "updatedAt" = now() where id in (select artwork_id from order_items where order_id = $1 and artwork_id is not null)`,
    [order.id]
  );
  await client.query(
    `delete from cart_items where user_id = $1 and artwork_id in (select artwork_id from order_items where order_id = $2 and artwork_id is not null)`,
    [order.buyer_id, order.id]
  );
  return { result: "settled" };
}

/** Settle, then (outside the transaction) send any auto-refund it queued and queue notifications. */
export async function settleCheckoutPayment(input: SettleInput): Promise<CheckoutSettleResult> {
  const outcome = await inTransaction((client) => settleInTransaction(client, input));
  if (outcome.result === "refund-queued") await processOrderRefund(outcome.refundId);
  if (outcome.result === "settled") await notifyPaid(input);
  return outcome;
}

async function notifyPaid(input: SettleInput): Promise<void> {
  const { rows } = await pool.query<{ id: string; order_number: string; buyer_id: string; total_paise: number }>(
    `select id, order_number, buyer_id, total_paise from orders
     where ($1::text is not null and id = $1) or ($2::text is not null and provider_order_id = $2) limit 1`,
    [input.orderId, input.providerOrderId]
  );
  const o = rows[0];
  if (!o) return;
  await notifyOrderUser("order.confirmed", o.buyer_id, `order.confirmed:${o.id}`, (u) => ({ name: u.name, orderNumber: o.order_number, totalPaise: o.total_paise }));
  const { rows: sos } = await pool.query<{ id: string; seller_id: string; total_paise: number; accept_by: Date }>(
    `select id, seller_id, total_paise, accept_by from seller_orders where order_id = $1`,
    [o.id]
  );
  for (const so of sos) {
    await notifyOrderUser("order.new_for_seller", so.seller_id, `order.new_for_seller:${so.id}`, (u) => ({
      name: u.name,
      orderNumber: o.order_number,
      totalPaise: so.total_paise,
      acceptBy: so.accept_by.toISOString(),
    }));
  }
}

/** Record a failed attempt (Razorpay `payment.failed`). The order stays payable until its hold lapses: Checkout lets the buyer retry. */
export async function recordFailedPayment(input: { orderId: string | null; providerOrderId: string | null; eventId: string | null; paymentId: string; reason: string | null }): Promise<void> {
  await inTransaction(async (client) => {
    const o = await client.query<{ id: string }>(
      `select id from orders where ($1::text is not null and id = $1) or ($2::text is not null and provider_order_id = $2) limit 1 for update`,
      [input.orderId, input.providerOrderId]
    );
    if (!o.rows[0]) return;
    await client.query(
      `insert into order_payments (id, order_id, provider_order_id, provider_payment_id, event_id, amount_paise, status, failure_code)
       values ($1, $2, $3, $4, $5, 0, 'failed', $6)
       on conflict do nothing`,
      [newId("opay"), o.rows[0].id, input.providerOrderId, input.paymentId, input.eventId, input.reason?.slice(0, 200) ?? null]
    );
  });
}
