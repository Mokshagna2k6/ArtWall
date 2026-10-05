import "server-only";

import type { PoolClient } from "pg";

import { newId } from "@/features/physical-wall/actions/shared";
import { recordAudit } from "@/features/physical-wall/audit";
import { alertAdmins } from "@/features/physical-wall/notifications";
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
/** Admins are alerted once a refund has failed this many times (BE-2.11). Retries continue up to MAX_ATTEMPTS. */
export const REFUND_ALERT_AFTER = 3;

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
    // SEC-2.11: the audit log at queue time (booking.cancelled / booking.payment-refunded)
    // records who asked for the refund and why; this records that Razorpay
    // actually moved the money, which is the part only known after the fact.
    await recordAudit({
      actor: null,
      action: "refund.processed",
      subjectType: "booking",
      subjectId: row.booking_id,
      after: { refundId, providerRefundId: refund.id, amountPaise: Number(row.amount_paise) },
    });
    return "processed";
  } catch (error) {
    console.error(`[physical-wall] refund ${refundId} failed`, error);
    const message = String(error instanceof Error ? error.message : error).slice(0, 1000);
    await pool
      .query(
        `update pw_refunds set status = 'failed', last_error = $2, updated_at = now()
         where id = $1 and status = 'processing'`,
        [refundId, message]
      )
      .catch((e) => console.error(`[physical-wall] could not mark refund ${refundId} failed`, e));
    await recordAudit({
      actor: null,
      action: "refund.failed",
      subjectType: "booking",
      subjectId: row.booking_id,
      after: { refundId, amountPaise: Number(row.amount_paise), error: message },
    });
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

  // Reconciliation: anything still failing after REFUND_ALERT_AFTER attempts
  // needs a person. alertAdmins dedupes per refund, so each is raised once.
  const { rows: stuck } = await pool.query<{ id: string; booking_id: string; amount_paise: number; attempts: number; last_error: string | null }>(
    `select id, booking_id, amount_paise, attempts, last_error from pw_refunds
     where status = 'failed' and attempts >= $1 order by updated_at limit 50`,
    [REFUND_ALERT_AFTER]
  );
  for (const r of stuck) {
    await alertAdmins(
      `refund.stuck:${r.id}`,
      `Refund ${r.id} has failed ${r.attempts} times`,
      `Refund ${r.id} (booking ${r.booking_id}, ${r.amount_paise} paise) has failed ${r.attempts} times` +
        `${r.attempts >= MAX_ATTEMPTS ? " and will not be retried automatically" : ""}.

Last error: ${r.last_error ?? "unknown"}`
    );
  }
  return { scanned: rows.length, ...results, stuck: stuck.length };
}

/** Refunds failing past the alert threshold: a person has to look at them (admin overview). */
export async function countStuckRefunds(): Promise<number> {
  const { rows } = await pool.query<{ n: number }>(
    `select count(*)::int as n from pw_refunds where status = 'failed' and attempts >= $1`,
    [REFUND_ALERT_AFTER]
  );
  return rows[0]?.n ?? 0;
}
