import "server-only";

import { newId } from "@/features/physical-wall/actions/shared";
import { getSql } from "@/lib/db";

/**
 * Notifications (Phase 1).
 *
 * A queue, not a side effect. Every "tell someone something" in this feature
 * inserts into `pw_notifications` and returns immediately — the caller's
 * transaction is never held open by an SMTP handshake, and a mail outage
 * degrades to "the message arrives late" rather than "the booking failed".
 *
 * Delivery: Resend when `RESEND_API_KEY` is set; otherwise rows stay `pending`
 * and the admin can see the backlog. Nothing pretends to have been sent.
 */

export type NotificationKind =
  | "waitlist.offer"
  | "booking.confirmed"
  | "install.scheduled"
  | "install.reminder"
  | "hold.expiring"
  | "feedback.invite"
  | "grievance.received"
  | "grievance.responded"
  | "identity.approved"
  | "identity.rejected"
  | "ugc.approved"
  | "ugc.removed"
  | "system.notice";

interface QueueInput {
  userId?: string | null;
  recipient: string;
  subject: string;
  body: string;
  kind: NotificationKind;
  channel?: "email" | "sms" | "in_app";
}

/** Queue a notification. Never throws into the caller's flow. */
export async function queueNotification(input: QueueInput): Promise<string | null> {
  try {
    const sql = getSql();
    const id = newId("ntf");
    await sql`
      insert into pw_notifications (id, user_id, recipient, subject, body, kind, channel)
      values (${id}, ${input.userId ?? null}, ${input.recipient}, ${input.subject},
              ${input.body}, ${input.kind}, ${input.channel ?? "email"})
    `;
    return id;
  } catch (error) {
    // A notification that cannot be queued must not break the thing it was
    // notifying about. Logged, not thrown.
    console.error("[physical-wall] Could not queue notification", error);
    return null;
  }
}

function isResendConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY);
}

/**
 * Deliver pending notifications.
 *
 * Called by the cron route (`/api/cron/deliver-notifications`) and by the
 * admin notifications page ("Send pending now"). Batched, capped, and honest:
 * each row records its own outcome, and a failure marks the row rather than
 * aborting the batch.
 */
export async function deliverPendingNotifications(limit = 25): Promise<{
  sent: number;
  failed: number;
  skipped: number;
}> {
  const sql = getSql();
  const pending = (await sql`
    select id, recipient, subject, body, attempts
    from pw_notifications
    where status = 'pending' and channel = 'email'
    order by created_at asc
    limit ${limit}
  `) as {
    id: string;
    recipient: string;
    subject: string;
    body: string;
    attempts: number;
  }[];

  if (!isResendConfigured()) {
    return { sent: 0, failed: 0, skipped: pending.length };
  }

  let sent = 0;
  let failed = 0;

  for (const row of pending) {
    try {
      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: process.env.NOTIFY_FROM_EMAIL ?? "Artwall <onboarding@resend.dev>",
          to: [row.recipient],
          subject: row.subject,
          text: row.body,
        }),
        signal: AbortSignal.timeout(10_000),
      });

      if (!response.ok) {
        throw new Error(`Resend responded ${response.status}`);
      }

      await sql`
        update pw_notifications
        set status = 'sent', sent_at = now(), last_error = null
        where id = ${row.id}
      `;
      sent += 1;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const nextAttempts = Number(row.attempts) + 1;
      // Three strikes and it stops retrying automatically — someone should
      // look at why, not let it spin forever.
      const status = nextAttempts >= 3 ? "failed" : "pending";
      await sql`
        update pw_notifications
        set status = ${status}, attempts = ${nextAttempts}, last_error = ${message.slice(0, 500)}
        where id = ${row.id}
      `;
      failed += 1;
    }
  }

  return { sent, failed, skipped: 0 };
}

/** Pending count for the admin badge / overview alert. */
export async function countPendingNotifications(): Promise<number> {
  try {
    const sql = getSql();
    const rows = (await sql`
      select count(*)::int as n from pw_notifications where status = 'pending'
    `) as { n: number }[];
    return Number(rows[0]?.n ?? 0);
  } catch {
    return 0;
  }
}