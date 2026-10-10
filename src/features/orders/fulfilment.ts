import "server-only";

import { expireOverdueCheckouts } from "@/features/orders/checkout";
import { releaseSellerOrderEscrow } from "@/features/orders/escrow";
import { notifyOrderUser } from "@/features/orders/notify";
import { processOrderRefund, requestSellerOrderRefund, type RefundKind } from "@/features/orders/refunds";
import { getMarketplaceSettings } from "@/features/orders/settings";
import type { TransitionActor } from "@/features/orders/state-machine";
import { lockSellerOrder, transitionSellerOrder } from "@/features/orders/transitions";
import { inTransaction, PreconditionError } from "@/features/physical-wall/actions/shared";
import { pool } from "@/lib/db/index";

/**
 * Sub-order operations shared by the seller, buyer and admin actions and the
 * sweep. Each is one transaction (status + audit event + money movement
 * together); notifications and the Razorpay refund call happen after commit.
 * Ownership is enforced here, in SQL terms, never trusted from the caller.
 */

async function orderMeta(sellerOrderId: string) {
  const { rows } = await pool.query<{ order_id: string; order_number: string; buyer_id: string; seller_id: string }>(
    `select so.order_id, o.order_number, o.buyer_id, so.seller_id from seller_orders so join orders o on o.id = so.order_id where so.id = $1`,
    [sellerOrderId]
  );
  return rows[0];
}

export async function acceptSellerOrder(sellerOrderId: string, sellerId: string): Promise<void> {
  await inTransaction(async (client) => {
    const so = await lockSellerOrder(client, sellerOrderId);
    if (so.seller_id !== sellerId) throw new PreconditionError("We couldn't find that order.");
    await transitionSellerOrder(client, sellerOrderId, "processing", { actor: "seller", actorId: sellerId, set: { accepted_at: new Date() } });
  });
  const m = await orderMeta(sellerOrderId);
  if (m) await notifyOrderUser("order.accepted", m.buyer_id, `order.accepted:${sellerOrderId}`, (u) => ({ name: u.name, orderNumber: m.order_number }));
}

/** Refund + notify, shared by decline / cancel / timeout / admin. Runs the Razorpay call after commit. */
export async function refundSellerOrder(opts: {
  sellerOrderId: string;
  amountPaise?: number;
  reason: string;
  kind: RefundKind;
  actor: TransitionActor;
  actorId: string | null;
  /** Ownership guard for seller/buyer callers; admin and system pass nothing. */
  mustBeSeller?: string;
  mustBeBuyer?: string;
}): Promise<{ refundId: string; full: boolean }> {
  const result = await inTransaction(async (client) => {
    const so = await lockSellerOrder(client, opts.sellerOrderId);
    if (opts.mustBeSeller && so.seller_id !== opts.mustBeSeller) throw new PreconditionError("We couldn't find that order.");
    if (opts.mustBeBuyer) {
      const o = await client.query<{ buyer_id: string }>(`select buyer_id from orders where id = $1`, [so.order_id]);
      if (o.rows[0]?.buyer_id !== opts.mustBeBuyer) throw new PreconditionError("We couldn't find that order.");
    }
    if (opts.kind === "buyer_cancel" && so.status !== "paid") {
      throw new PreconditionError("This order has already been accepted by the artist, so it can no longer be cancelled here. Contact support if there is a problem.");
    }
    return requestSellerOrderRefund(client, {
      sellerOrderId: opts.sellerOrderId,
      amountPaise: opts.amountPaise,
      reason: opts.reason,
      kind: opts.kind,
      actor: opts.actor,
      actorId: opts.actorId,
    });
  });
  await processOrderRefund(result.refundId);
  return { refundId: result.refundId, full: result.full };
}

export async function shipSellerOrder(opts: {
  sellerOrderId: string;
  sellerId: string;
  courier: string;
  awb: string;
  trackingUrl: string | null;
  actor: TransitionActor;
  actorId: string;
}): Promise<void> {
  await inTransaction(async (client) => {
    const so = await lockSellerOrder(client, opts.sellerOrderId);
    if (opts.actor === "seller" && so.seller_id !== opts.sellerId) throw new PreconditionError("We couldn't find that order.");
    await transitionSellerOrder(client, opts.sellerOrderId, "shipped", {
      actor: opts.actor,
      actorId: opts.actorId,
      note: `${opts.courier} ${opts.awb}`,
      set: { shipped_at: new Date(), courier: opts.courier, awb: opts.awb, tracking_url: opts.trackingUrl },
    });
  });
  const m = await orderMeta(opts.sellerOrderId);
  if (m) {
    await notifyOrderUser("order.shipped", m.buyer_id, `order.shipped:${opts.sellerOrderId}`, (u) => ({
      name: u.name,
      orderNumber: m.order_number,
      courier: opts.courier,
      awb: opts.awb,
      trackingUrl: opts.trackingUrl,
    }));
  }
}

/** Courier-confirmed delivery (admin, until the courier webhook exists): starts the dispute window. */
export async function markSellerOrderDelivered(sellerOrderId: string, adminId: string): Promise<void> {
  await inTransaction(async (client) => {
    const settings = await getMarketplaceSettings(client);
    const now = new Date();
    await transitionSellerOrder(client, sellerOrderId, "delivered", {
      actor: "admin",
      actorId: adminId,
      note: "Delivery confirmed",
      set: { delivered_at: now, release_eligible_at: new Date(now.getTime() + settings.disputeWindowDays * 86_400_000) },
    });
  });
}

/**
 * The buyer says it arrived: payment can be released now. Allowed while shipped
 * or after the admin marked it delivered (but before release).
 */
export async function confirmReceipt(sellerOrderId: string, buyerId: string): Promise<void> {
  await inTransaction(async (client) => {
    const so = await lockSellerOrder(client, sellerOrderId);
    const o = await client.query<{ buyer_id: string }>(`select buyer_id from orders where id = $1`, [so.order_id]);
    if (o.rows[0]?.buyer_id !== buyerId) throw new PreconditionError("We couldn't find that order.");
    const now = new Date();
    if (so.status === "shipped") {
      await transitionSellerOrder(client, sellerOrderId, "delivered", {
        actor: "buyer",
        actorId: buyerId,
        note: "Buyer confirmed receipt",
        set: { delivered_at: now, buyer_confirmed_at: now, release_eligible_at: now },
      });
    } else if (so.status === "delivered" && !so.buyer_confirmed_at) {
      await client.query(`update seller_orders set buyer_confirmed_at = $2, release_eligible_at = $2, updated_at = now() where id = $1`, [sellerOrderId, now]);
    } else {
      throw new PreconditionError("There is nothing to confirm on this order yet.");
    }
  });
  // Release right away; the sweep is the backstop if this fails.
  await inTransaction((client) => releaseSellerOrderEscrow(client, sellerOrderId, { kind: "system", id: null })).catch((e) =>
    console.error("[orders] release after confirmation failed; the sweep will retry", e)
  );
}

export interface SweepResult {
  expired: number;
  timedOut: number;
  released: number;
  errors: number;
}

/** Daily sweep: lapse unpaid checkouts, refund unaccepted orders, release eligible escrow. Each item is its own transaction. */
export async function runOrderSweep(until = Infinity): Promise<SweepResult> {
  const out: SweepResult = { expired: 0, timedOut: 0, released: 0, errors: 0 };
  out.expired = await inTransaction((c) => expireOverdueCheckouts(c, 200));

  const unaccepted = await pool.query<{ id: string }>(`select id from seller_orders where status = 'paid' and accept_by < now() order by accept_by limit 50`);
  for (const { id } of unaccepted.rows) {
    if (Date.now() > until) break;
    try {
      await refundSellerOrder({ sellerOrderId: id, reason: "The artist did not accept the order in time.", kind: "seller_timeout", actor: "system", actorId: null });
      out.timedOut += 1;
    } catch (e) {
      out.errors += 1;
      console.error("[orders] timeout refund failed", id, e);
    }
  }

  const releasable = await pool.query<{ id: string }>(
    `select id from seller_orders where status = 'delivered' and (buyer_confirmed_at is not null or release_eligible_at <= now()) order by release_eligible_at limit 50`
  );
  for (const { id } of releasable.rows) {
    if (Date.now() > until) break;
    try {
      const r = await inTransaction((c) => releaseSellerOrderEscrow(c, id, { kind: "system", id: null }));
      if (r === "released") out.released += 1;
    } catch (e) {
      out.errors += 1;
      console.error("[orders] release failed", id, e);
    }
  }
  return out;
}
