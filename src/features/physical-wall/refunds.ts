import "server-only";

import type { PoolClient } from "pg";

import { newId } from "@/features/physical-wall/actions/shared";
import { createRefund, findRefund } from "@/features/physical-wall/razorpay";
import { pool } from "@/lib/db/index";

/**
 * Durable refunds (BE-1.14). See db/migrations/0022_be_refunds.sql.
 *
 *  1. queueRefundIn — inside the cancel transaction: write the pw_refunds row
 *     ('pending' for a Razorpay payment, 'manual' for cash/bank). It commits
 *     with the booking status and ledger expense, or not at all.
 *  2. processRefund — AFTER that commit, never inside a transaction: claim the
 *     row ('processing'), look for a refund already issued for it (a previous
 *     attempt may have crashed after Razorpay accepted it), otherwise create
 *     one, then record 'processed' or 'failed'.
 *  3. /api/cron/refunds — retries 'pending', 'failed' and stale 'processing'
 *     rows, so a crash anywhere in step 2 is recovered, never lost or doubled.
 */

const STALE = "10 minutes";
const MAX_ATTEMPTS = 8;

export async function queueRefundIn(
  client: PoolClient,
  opts: {
    bookingId: string;
    /** Omit to refund the booking's captured Razorpay payment (or 'manual' if none). */
    paymentId?: string | null;
    amountPaise: number;
    reason: string;
    actorId: string | null;
  }
): Promise<{ refundId: string; status: "pending" | "manual" }> {
  const payment = await client.query<{ payment_id: string }>(
    `select payment_id from pw_payments
     where booking_id = $1 and provider = 'razorpay' and status = 'captured' and payment_id is not null
     order by created_at desc limit 1`,
    [opts.bookingId]
  );
  const paymentId = opts.paymentId ?? payment.rows[0]?.payment_id ?? null;
  const status = paymentId ? "pending" : "manual";
  const refundId = newId("rf");
  // Unique per (booking, payment): a second cancel path for the same booking
  // cannot owe twice; a duplicate payment gets its own refund row.
  await client.query(
    `insert into pw_refunds (id, booking_id, payment_id, amount_paise, status, reason, created_by)
     values ($1, $2, $3, $4, $5, $6, $7)`,
    [refundId, opts.bookingId, paymentId, opts.amountPaise, status, opts.reason, opts.actorId]
  );
  return { refundId, status };
}

export type RefundOutcome = "processed" | "failed" | "skipped";

/** Send one refund to Razorpay. Never throws; never call inside a transaction. */
export async function processRefund(refundId: string): Promise<RefundOutcome> {
  const claimed = await pool.query<{ payment_id: string; amount_paise: number; booking_id: string }>(
    `update pw_refunds
     set status = 'processing', attempts = attempts + 1, updated_at = now()
     where id = $1 and attempts < $2
       and (status in ('pending', 'failed')
            or (status = 'processing' and updated_at < now() - $3::interval))
     returning payment_id, amount_paise, booking_id`,
    [refundId, MAX_ATTEMPTS, STALE]
  );
  const row = claimed.rows[0];
  if (!row) return "skipped"; // done, manual, being worked on, or out of attempts

  try {
    const refund =
      (await findRefund(row.payment_id, refundId)) ??
      (await createRefund(row.payment_id, Number(row.amount_paise), { bookingId: row.booking_id, refundId }));
    await pool.query(
      `update pw_refunds
       set status = 'processed', provider_refund_id = $2, last_error = null, updated_at = now()
       where id = $1`,
      [refundId, refund.id]
    );
    return "processed";
  } catch (error) {
    console.error(`[physical-wall] refund ${refundId} failed`, error);
    await pool
      .query(
        `update pw_refunds set status = 'failed', last_error = $2, updated_at = now()
         where id = $1 and status = 'processing'`,
        [refundId, String(error instanceof Error ? error.message : error).slice(0, 1000)]
      )
      .catch((e) => console.error(`[physical-wall] could not mark refund ${refundId} failed`, e));
    return "failed";
  }
}

/** The retry sweep behind /api/cron/refunds. */
export async function processOpenRefunds(limit = 20, until = Infinity) {
  const { rows } = await pool.query<{ id: string }>(
    `select id from pw_refunds
     where attempts < $1
       and (status in ('pending', 'failed')
            or (status = 'processing' and updated_at < now() - $2::interval))
     order by updated_at limit $3`,
    [MAX_ATTEMPTS, STALE, limit]
  );
  const results: Record<RefundOutcome, number> = { processed: 0, failed: 0, skipped: 0 };
  for (const { id } of rows) {
    if (Date.now() > until) break; // still open, retried next run
    results[await processRefund(id)] += 1;
  }
  return { scanned: rows.length, ...results };
}
