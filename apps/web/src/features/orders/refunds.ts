import "server-only";

import type { PoolClient } from "pg";

import { refundFromEscrow } from "@/features/orders/escrow";
import { notifyOrderUser } from "@/features/orders/notify";
import { FUNDS_HELD_STATES, type TransitionActor } from "@/features/orders/state-machine";
import { lockSellerOrder, recordOrderEvent, releaseArtworks, transitionSellerOrder } from "@/features/orders/transitions";
import { newId, PreconditionError } from "@/features/physical-wall/actions/shared";
import { alertAdmins } from "@/features/physical-wall/notifications";
import { createRefund, findRefund } from "@/features/physical-wall/razorpay";
import { pool } from "@/lib/db/index";

/**
 * Marketplace refunds: the outbox pattern of src/features/physical-wall/refunds.ts
 * (BE-1.14), per seller sub-order, partial against the checkout's single
 * Razorpay payment.
 *
 *  1. requestSellerOrderRefund (inside the caller's transaction): takes the
 *     money out of escrow, writes the order_refunds row, and moves the
 *     sub-order. Commits together or not at all.
 *  2. processOrderRefund (after commit, never inside a transaction): claim the
 *     row, look for a refund Razorpay already issued for it (Razorpay refunds
 *     are not idempotent), otherwise create one, record the outcome.
 *  3. /api/cron/refunds retries pending / failed / stale-processing rows.
 */

const STALE = "10 minutes";
const MAX_ATTEMPTS = 8;
export const ORDER_REFUND_ALERT_AFTER = 3;

export type RefundKind = "seller_declined" | "seller_timeout" | "buyer_cancel" | "admin" | "auto_orphan";

/** Queue a whole-payment refund for money we cannot attach to an order (mismatch, late capture). */
export async function queueOrphanRefundIn(
  client: PoolClient,
  opts: { orderId: string; paymentId: string | null; amountPaise: number; reason: string }
): Promise<string> {
  const id = newId("orf");
  await client.query(
    `insert into order_refunds (id, order_id, seller_order_id, payment_id, amount_paise, status, reason, kind)
     values ($1, $2, null, $3, $4, $5, $6, 'auto_orphan')`,
    [id, opts.orderId, opts.paymentId, opts.amountPaise, opts.paymentId ? "pending" : "manual", opts.reason]
  );
  return id;
}

export interface RefundRequest {
  sellerOrderId: string;
  /** Omit to refund everything still refundable. */
  amountPaise?: number;
  reason: string;
  kind: RefundKind;
  actor: TransitionActor;
  actorId: string | null;
}

/**
 * Refund (all or part of) one seller sub-order. Full refunds move it to
 * `refund_pending` (and put an unshipped work back on sale); partial refunds
 * leave the status alone and shrink what escrow will later release.
 */
export async function requestSellerOrderRefund(
  client: PoolClient,
  req: RefundRequest
): Promise<{ refundId: string; full: boolean; amountPaise: number; orderId: string; sellerId: string }> {
  const so = await lockSellerOrder(client, req.sellerOrderId);
  if (!FUNDS_HELD_STATES.includes(so.status) || so.status === "refund_pending") {
    throw new PreconditionError(
      so.status === "completed"
        ? "This order's payment has already been released to the seller; ask Finance to arrange a clawback."
        : "This order is not in a state that can be refunded."
    );
  }
  const remaining = so.total_paise - so.refunded_paise;
  const amountPaise = req.amountPaise ?? remaining;
  if (!Number.isSafeInteger(amountPaise) || amountPaise <= 0 || amountPaise > remaining) {
    throw new PreconditionError("Enter a refund amount between 1 paisa and the amount still refundable.");
  }
  const full = so.refunded_paise + amountPaise === so.total_paise;

  await refundFromEscrow(client, so.id, amountPaise, req.reason, so.commission_policy_version_id, req.actorId);

  const pay = await client.query<{ provider_payment_id: string }>(
    `select provider_payment_id from order_payments where order_id = $1 and status = 'captured' and provider_payment_id is not null
     order by created_at desc limit 1`,
    [so.order_id]
  );
  const paymentId = pay.rows[0]?.provider_payment_id ?? null;
  const refundId = newId("orf");
  await client.query(
    `insert into order_refunds (id, order_id, seller_order_id, payment_id, amount_paise, status, reason, kind, created_by)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [refundId, so.order_id, so.id, paymentId, amountPaise, paymentId ? "pending" : "manual", req.reason, req.kind, req.actorId]
  );
  await client.query(`update seller_orders set refunded_paise = refunded_paise + $2, updated_at = now() where id = $1`, [so.id, amountPaise]);

  if (full) {
    await transitionSellerOrder(client, so.id, "refund_pending", {
      actor: req.actor,
      actorId: req.actorId,
      note: req.reason,
      set: { cancel_reason: req.reason, cancelled_at: new Date() },
    });
    // Still with the seller (not yet shipped): the work goes back on sale.
    if (so.status === "paid" || so.status === "processing") await releaseArtworks(client, so.id);
  } else {
    await recordOrderEvent(client, {
      orderId: so.order_id,
      sellerOrderId: so.id,
      from: so.status,
      to: so.status,
      actorId: req.actorId,
      note: `Partial refund of ${amountPaise} paise: ${req.reason}`,
    });
  }
  return { refundId, full, amountPaise, orderId: so.order_id, sellerId: so.seller_id };
}

export type OrderRefundOutcome = "processed" | "failed" | "skipped";

/** Send one refund to Razorpay. Never throws; never call inside a transaction. */
export async function processOrderRefund(refundId: string): Promise<OrderRefundOutcome> {
  const claimed = await pool.query<{ payment_id: string; amount_paise: number; order_id: string; seller_order_id: string | null }>(
    `update order_refunds
     set status = 'processing', attempts = attempts + 1, updated_at = now()
     where id = $1 and payment_id is not null and attempts < $2
       and (status in ('pending', 'failed') or (status = 'processing' and updated_at < now() - $3::interval))
     returning payment_id, amount_paise, order_id, seller_order_id`,
    [refundId, MAX_ATTEMPTS, STALE]
  );
  const row = claimed.rows[0];
  if (!row) return "skipped";

  try {
    const refund =
      (await findRefund(row.payment_id, refundId)) ??
      (await createRefund(row.payment_id, Number(row.amount_paise), { orderId: row.order_id, refundId }));
    await markRefundProcessed(refundId, refund.id);
    return "processed";
  } catch (error) {
    console.error(`[orders] refund ${refundId} failed`, error);
    const message = String(error instanceof Error ? error.message : error).slice(0, 1000);
    await pool
      .query(`update order_refunds set status = 'failed', last_error = $2, updated_at = now() where id = $1 and status = 'processing'`, [refundId, message])
      .catch((e) => console.error(`[orders] could not mark refund ${refundId} failed`, e));
    return "failed";
  }
}

/**
 * Record that Razorpay moved the money (from the sender, or from a verified
 * refund.processed webhook), then close the sub-order if this was its last
 * outstanding refund. Idempotent.
 */
export async function markRefundProcessed(refundId: string, providerRefundId: string): Promise<void> {
  const { rows } = await pool.query<{ seller_order_id: string | null; amount_paise: number }>(
    `update order_refunds set status = 'processed', provider_refund_id = $2, last_error = null, updated_at = now()
     where id = $1 and status <> 'processed' returning seller_order_id, amount_paise`,
    [refundId, providerRefundId]
  );
  const refund = rows[0];
  if (!refund?.seller_order_id) return;

  const client = await pool.connect();
  let buyerId: string | null = null;
  let orderNumber = "";
  try {
    await client.query("begin");
    const so = await lockSellerOrder(client, refund.seller_order_id);
    if (so.status === "refund_pending" && so.refunded_paise === so.total_paise) {
      const open = await client.query(
        `select 1 from order_refunds where seller_order_id = $1 and status <> 'processed' and status <> 'manual' limit 1`,
        [so.id]
      );
      if (!open.rowCount) await transitionSellerOrder(client, so.id, "refunded", { actor: "system", actorId: null, note: "Refund processed" });
    }
    const o = await client.query<{ buyer_id: string; order_number: string }>(`select buyer_id, order_number from orders where id = $1`, [so.order_id]);
    buyerId = o.rows[0]?.buyer_id ?? null;
    orderNumber = o.rows[0]?.order_number ?? "";
    await client.query("commit");
  } catch (error) {
    await client.query("rollback").catch(() => {});
    console.error("[orders] could not close refunded sub-order", error);
  } finally {
    client.release();
  }
  if (buyerId) {
    await notifyOrderUser("order.refunded", buyerId, `order.refunded:${refundId}`, (u) => ({
      name: u.name,
      orderNumber,
      amountPaise: Number(refund.amount_paise),
    }));
  }
}

/** The retry sweep behind /api/cron/refunds, for marketplace refunds. */
export async function processOpenOrderRefunds(limit = 20, until = Infinity) {
  const { rows } = await pool.query<{ id: string }>(
    `select id from order_refunds
     where payment_id is not null and attempts < $1
       and (status in ('pending', 'failed') or (status = 'processing' and updated_at < now() - $2::interval))
     order by updated_at limit $3`,
    [MAX_ATTEMPTS, STALE, limit]
  );
  const results: Record<OrderRefundOutcome, number> = { processed: 0, failed: 0, skipped: 0 };
  for (const { id } of rows) {
    if (Date.now() > until) break;
    results[await processOrderRefund(id)] += 1;
  }
  const { rows: stuck } = await pool.query<{ id: string; order_id: string; amount_paise: number; attempts: number; last_error: string | null }>(
    `select id, order_id, amount_paise, attempts, last_error from order_refunds where status = 'failed' and attempts >= $1 order by updated_at limit 50`,
    [ORDER_REFUND_ALERT_AFTER]
  );
  for (const r of stuck) {
    await alertAdmins(
      `order-refund.stuck:${r.id}`,
      `Marketplace refund ${r.id} has failed ${r.attempts} times`,
      `Refund ${r.id} (order ${r.order_id}, ${r.amount_paise} paise) has failed ${r.attempts} times.\n\nLast error: ${r.last_error ?? "unknown"}`
    );
  }
  return { scanned: rows.length, ...results, stuck: stuck.length };
}
