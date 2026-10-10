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

const SIGN_OFF = "\n\n— Artwall Labs";
const inr = (paise: number) =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" }).format(paise / 100);
const when = (iso: string) =>
  new Date(iso).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short" });

/**
 * One template per kind (BE-1.34). The kind union is derived from this object,
 * so a kind without a template cannot exist. Each template takes exactly the
 * data it needs.
 */
export const TEMPLATES = {
  "waitlist.offer": (d: { name: string; slotLabel: string; expiresAt: string }) => ({
    subject: `A wall slot is held for you: ${d.slotLabel}`,
    body: `Hi ${d.name},\n\n${d.slotLabel} has opened up and we're holding it for you until ${when(d.expiresAt)}. Accept the offer from your waitlist page to book it.${SIGN_OFF}`,
  }),
  "booking.confirmed": (d: { name: string; bookingId: string; startDate: string; endDate: string; totalPaise: number }) => ({
    subject: "Your wall booking is confirmed",
    body: `Hi ${d.name},\n\nPayment of ${inr(d.totalPaise)} received. Booking ${d.bookingId} runs ${d.startDate} to ${d.endDate}.\n\nNext: sign the exhibition agreement, then pick an install window.${SIGN_OFF}`,
  }),
  "install.scheduled": (d: { name: string; startsAt: string }) => ({
    subject: "Install window booked",
    body: `Hi ${d.name},\n\nYour install is booked for ${when(d.startsAt)}. Bring the work and your booking QR.${SIGN_OFF}`,
  }),
  "install.reminder": (d: { name: string; startsAt: string }) => ({
    subject: "Reminder: your install is coming up",
    body: `Hi ${d.name},\n\nA reminder that your install window is ${when(d.startsAt)}. Bring the work and your booking QR.${SIGN_OFF}`,
  }),
  "hold.expiring": (d: { name: string; bookingId: string; expiresAt: string }) => ({
    subject: "Your slot hold is about to expire",
    body: `Hi ${d.name},\n\nThe hold on booking ${d.bookingId} ends at ${when(d.expiresAt)}. Complete payment before then or the slots go back to the wall.${SIGN_OFF}`,
  }),
  "feedback.invite": (d: { name: string; bookingId: string }) => ({
    subject: "How did your time on the wall go?",
    body: `Hi ${d.name},\n\nYour exhibition (booking ${d.bookingId}) has ended. Two minutes of feedback helps us run the wall better: open your bookings page to leave it.${SIGN_OFF}`,
  }),
  "grievance.received": (d: { subject: string; dueDays: number }) => ({
    subject: `We received your grievance: ${d.subject}`,
    body: `We have received your grievance "${d.subject}". A named person will reply within ${d.dueDays} days.${SIGN_OFF}`,
  }),
  "grievance.responded": (d: { reply: string }) => ({
    subject: "Your grievance has a reply",
    body: `We have responded to your grievance.\n\nReply:\n${d.reply}${SIGN_OFF}`,
  }),
  "identity.approved": (d: { name: string }) => ({
    subject: "Identity verified — payouts are now enabled",
    body: `Hi ${d.name},\n\nYour identity has been verified. You can now receive payouts for your exhibitions.${SIGN_OFF}`,
  }),
  "identity.rejected": (d: { name: string; note: string | null }) => ({
    subject: "Identity verification needs attention",
    body: `Hi ${d.name},\n\nWe could not verify your identity from the document you submitted.${d.note ? `\n\nNote: ${d.note}` : ""}\n\nPlease upload a clearer image and try again.${SIGN_OFF}`,
  }),
  "ugc.approved": (d: { caption: string }) => ({
    subject: "Your photo is in the community gallery",
    body: `Your photo "${d.caption}" was approved and is now in The Wall's community gallery. You can withdraw it any time.${SIGN_OFF}`,
  }),
  "ugc.removed": (d: { caption: string }) => ({
    subject: "Your photo was not published",
    body: `Your photo "${d.caption}" was reviewed and not published to the community gallery, and has been deleted.${SIGN_OFF}`,
  }),
  "order.confirmed": (d: { name: string; orderNumber: string; totalPaise: number }) => ({
    subject: `Order ${d.orderNumber} confirmed`,
    body: `Hi ${d.name},

Payment of ${inr(d.totalPaise)} received for order ${d.orderNumber}. Each artist now has a chance to accept and ship their work; your payment is held in escrow until you receive it.${SIGN_OFF}`,
  }),
  "order.new_for_seller": (d: { name: string; orderNumber: string; totalPaise: number; acceptBy: string }) => ({
    subject: `New order ${d.orderNumber}: accept it by ${when(d.acceptBy)}`,
    body: `Hi ${d.name},

You have a paid order ${d.orderNumber} worth ${inr(d.totalPaise)}. Accept it from Studio > Orders by ${when(d.acceptBy)}, or the buyer is refunded automatically and the work goes back on sale.${SIGN_OFF}`,
  }),
  "order.accepted": (d: { name: string; orderNumber: string }) => ({
    subject: `Your order ${d.orderNumber} was accepted`,
    body: `Hi ${d.name},

The artist accepted order ${d.orderNumber} and is preparing it for dispatch.${SIGN_OFF}`,
  }),
  "order.shipped": (d: { name: string; orderNumber: string; courier: string; awb: string; trackingUrl: string | null }) => ({
    subject: `Your order ${d.orderNumber} has shipped`,
    body: `Hi ${d.name},

Order ${d.orderNumber} is on its way via ${d.courier} (tracking ${d.awb}).${d.trackingUrl ? `
Track it: ${d.trackingUrl}` : ""}

When it arrives, confirm receipt from your orders page to release payment to the artist.${SIGN_OFF}`,
  }),
  "order.refunded": (d: { name: string; orderNumber: string; amountPaise: number }) => ({
    subject: `Refund of ${inr(d.amountPaise)} for order ${d.orderNumber}`,
    body: `Hi ${d.name},

A refund of ${inr(d.amountPaise)} for order ${d.orderNumber} has been issued to your original payment method. Banks usually take 5-7 working days to show it.${SIGN_OFF}`,
  }),
  "system.notice": (d: { subject: string; body: string }) => ({
    subject: d.subject,
    body: `${d.body}${SIGN_OFF}`,
  }),
  "auth.verify-email": (d: { name: string; url: string }) => ({
    subject: "Verify your email for ArtWall",
    body: `Hi ${d.name},\n\nConfirm this is your email address:\n${d.url}\n\nIf you didn't request this, you can ignore it.${SIGN_OFF}`,
  }),
};

export type NotificationKind = keyof typeof TEMPLATES;
export type NotificationData<K extends NotificationKind> = Parameters<(typeof TEMPLATES)[K]>[0];

interface QueueInput {
  userId?: string | null;
  recipient: string;
  subject: string;
  body: string;
  kind: NotificationKind;
  channel?: "email" | "sms" | "in_app";
  dedupeKey?: string | null;
}

/**
 * The outbox row's event-schema version (BE-3.22, F70): a plain integer so a
 * future broker bridge (SQS/SNS/whatever) can tell which shape a row is in
 * without guessing from which columns are populated. Bump this, not the
 * table, when the row's shape changes; every producer goes through
 * `queueNotification` below, so none of them need to know this exists.
 */
export const NOTIFICATION_SCHEMA_VERSION = 1;

/** Queue a notification. Never throws into the caller's flow. */
export async function queueNotification(input: QueueInput): Promise<string | null> {
  try {
    const sql = getSql();
    const id = newId("ntf");
    const rows = (await sql`
      insert into pw_notifications (id, user_id, recipient, subject, body, kind, channel, dedupe_key, schema_version)
      values (${id}, ${input.userId ?? null}, ${input.recipient}, ${input.subject},
              ${input.body}, ${input.kind}, ${input.channel ?? "email"}, ${input.dedupeKey ?? null},
              ${NOTIFICATION_SCHEMA_VERSION})
      on conflict (dedupe_key) where dedupe_key is not null do nothing
      returning id
    `) as { id: string }[];
    return rows[0]?.id ?? null;
  } catch (error) {
    // A notification that cannot be queued must not break the thing it was
    // notifying about. Logged, not thrown.
    console.error("[physical-wall] Could not queue notification", error);
    return null;
  }
}

/** Render a kind's template and queue it. Skips (null) when there is no email address to send to. */
export async function notify<K extends NotificationKind>(
  kind: K,
  to: { userId?: string | null; email: string | null | undefined; dedupeKey?: string },
  data: NotificationData<K>
): Promise<string | null> {
  const email = to.email?.trim();
  if (!email || !email.includes("@")) return null;
  const render = TEMPLATES[kind] as (d: NotificationData<K>) => { subject: string; body: string };
  const { subject, body } = render(data);
  return queueNotification({ userId: to.userId, recipient: email, subject, body, kind, dedupeKey: to.dedupeKey });
}

/** Notify an artist by user id (looks up their email and name). Never throws. */
export async function notifyUser<K extends NotificationKind>(
  kind: K,
  userId: string,
  data: (user: { name: string }) => NotificationData<K>
): Promise<string | null> {
  try {
    const rows = (await getSql()`select email, name from "user" where id = ${userId} limit 1`) as {
      email: string;
      name: string;
    }[];
    if (!rows[0]) return null;
    return notify(kind, { userId, email: rows[0].email }, data({ name: rows[0].name }));
  } catch (error) {
    console.error("[physical-wall] Could not notify", kind, error);
    return null;
  }
}

/**
 * Time-based notifications, each queued once (dedupe_key). Run by the
 * deliver-notifications cron before it sends.
 */
export async function queueScheduledNotifications(): Promise<number> {
  const sql = getSql();
  let queued = 0;

  const reminders = (await sql`
    select w.id, w.starts_at, u.id as user_id, u.email, u.name
    from pw_install_windows w
    join pw_bookings b on b.id = w.booking_id
    join "user" u on u.id = b.artist_id
    where w.status = 'reserved' and w.starts_at between now() and now() + interval '24 hours'
  `) as { id: string; starts_at: string; user_id: string; email: string; name: string }[];
  for (const r of reminders) {
    const to = { userId: r.user_id, email: r.email, dedupeKey: `install.reminder:${r.id}` };
    if (await notify("install.reminder", to, { name: r.name, startsAt: String(r.starts_at) })) queued++;
  }

  const holds = (await sql`
    select b.id, b.hold_expires_at, u.id as user_id, u.email, u.name
    from pw_bookings b join "user" u on u.id = b.artist_id
    where b.status = 'held' and b.hold_expires_at between now() and now() + interval '10 minutes'
  `) as { id: string; hold_expires_at: string; user_id: string; email: string; name: string }[];
  for (const h of holds) {
    const to = { userId: h.user_id, email: h.email, dedupeKey: `hold.expiring:${h.id}` };
    if (await notify("hold.expiring", to, { name: h.name, bookingId: h.id, expiresAt: String(h.hold_expires_at) })) queued++;
  }

  const ended = (await sql`
    select b.id, u.id as user_id, u.email, u.name
    from pw_bookings b join "user" u on u.id = b.artist_id
    where b.status in ('paid', 'completed')
      and b.end_date < (now() at time zone 'Asia/Kolkata')::date
      and b.end_date >= (now() at time zone 'Asia/Kolkata')::date - 7
  `) as { id: string; user_id: string; email: string; name: string }[];
  for (const e of ended) {
    const to = { userId: e.user_id, email: e.email, dedupeKey: `feedback.invite:${e.id}` };
    if (await notify("feedback.invite", to, { name: e.name, bookingId: e.id })) queued++;
  }

  return queued;
}

function isResendConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY);
}

/** After this many failed attempts a message is dead-lettered (BE-2.12). */
export const MAX_NOTIFICATION_ATTEMPTS = 5;
/** Backoff before the next try, after `attempts` failures: 1, 4, 16, 64 minutes. */
export const retryDelayMinutes = (attempts: number) => 4 ** Math.max(0, attempts - 1);

type Claimed = { id: string; recipient: string; subject: string; body: string; attempts: number };

/**
 * Deliver due notifications from the outbox (BE-2.12, BE-2.13).
 *
 * Called by the cron route (`/api/cron/deliver-notifications`) and by the admin
 * "Send pending now" button, so two runs can overlap. Delivery is idempotent:
 *
 *  - Rows are CLAIMED (status 'sending') by one UPDATE over a
 *    `for update skip locked` subquery. Overlapping runs get disjoint rows;
 *    a row is never handed to two runs at once.
 *  - Resend gets the row id as its Idempotency-Key. A run that died after
 *    Resend accepted a message but before marking it sent leaves a stale claim;
 *    the retry re-sends with the same key and Resend drops the duplicate.
 *  - Marking sent/retrying/dead is conditional on the row still being
 *    'sending', so a late writer cannot overwrite a newer outcome.
 *
 * Failures back off (retryDelayMinutes) and after MAX_NOTIFICATION_ATTEMPTS go
 * to 'dead', which the admin overview lists.
 */
export async function deliverPendingNotifications(
  limit = 25,
  /** Restrict to these rows (tests; admin "send this one"). */
  onlyIds?: string[],
  /** Epoch ms after which no new row is started (lib/cron.ts deadline). */
  until = Infinity
): Promise<{ sent: number; failed: number; dead: number; skipped: number }> {
  const sql = getSql();
  const ids = onlyIds ?? null;
  const due = `channel = 'email'
      and ((status in ('pending', 'retrying') and next_attempt_at <= now())
           or (status = 'sending' and claimed_at < now() - interval '10 minutes'))
      and ($1::text[] is null or id = any($1::text[]))`;

  if (!isResendConfigured()) {
    // Nothing is claimed: the rows stay where they are and the admin sees the backlog.
    const [row] = (await sql.query(`select count(*)::int as n from pw_notifications where ${due}`, [ids])) as { n: number }[];
    return { sent: 0, failed: 0, dead: 0, skipped: Math.min(Number(row?.n ?? 0), limit) };
  }

  const claimed = (await sql.query(
    `update pw_notifications set status = 'sending', claimed_at = now()
     where id in (select id from pw_notifications where ${due} order by created_at limit $2 for update skip locked)
     returning id, recipient, subject, body, attempts`,
    [ids, limit]
  )) as Claimed[];

  let sent = 0;
  let failed = 0;
  let dead = 0;

  for (const row of claimed) {
    if (Date.now() > until) break; // left pending for the next run
    try {
      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
          "Content-Type": "application/json",
          "Idempotency-Key": row.id,
        },
        body: JSON.stringify({
          from: process.env.NOTIFY_FROM_EMAIL ?? "Artwall <onboarding@resend.dev>",
          to: [row.recipient],
          subject: row.subject,
          text: row.body,
        }),
        signal: AbortSignal.timeout(10_000),
      });
      if (!response.ok) throw new Error(`Resend responded ${response.status}`);

      await sql`
        update pw_notifications
        set status = 'sent', sent_at = now(), last_error = null, claimed_at = null
        where id = ${row.id} and status = 'sending'
      `;
      sent += 1;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const attempts = Number(row.attempts) + 1;
      const giveUp = attempts >= MAX_NOTIFICATION_ATTEMPTS;
      await sql`
        update pw_notifications
        set status = ${giveUp ? "dead" : "retrying"}, attempts = ${attempts},
            last_error = ${message.slice(0, 500)}, claimed_at = null,
            next_attempt_at = now() + make_interval(mins => ${retryDelayMinutes(attempts)})
        where id = ${row.id} and status = 'sending'
      `;
      if (giveUp) dead += 1;
      else failed += 1;
    }
  }

  return { sent, failed, dead, skipped: 0 };
}

/** Pending count for the admin badge / overview alert. */
export async function countPendingNotifications(): Promise<number> {
  try {
    const sql = getSql();
    const rows = (await sql`
      select count(*)::int as n from pw_notifications where status in ('pending', 'retrying', 'sending')
    `) as { n: number }[];
    return Number(rows[0]?.n ?? 0);
  } catch {
    return 0;
  }
}

/** The dead letter: messages that exhausted their attempts, newest first (admin overview). */
export async function listDeadNotifications(limit = 20) {
  const sql = getSql();
  return (await sql`
    select id, kind, recipient, subject, attempts, last_error, created_at
    from pw_notifications where status = 'dead'
    order by created_at desc limit ${limit}
  `) as { id: string; kind: string; recipient: string; subject: string; attempts: number; last_error: string | null; created_at: string }[];
}

/**
 * Tell the admins something needs a person (BE-2.11). Queued as a system.notice
 * to every admin (role or ADMIN_EMAILS), once per `key` per admin, and logged as
 * a structured line for log-based alerting. Never throws.
 */
export async function alertAdmins(key: string, subject: string, body: string): Promise<void> {
  console.error(JSON.stringify({ level: "alert", key, subject }));
  try {
    const rows = (await getSql()`select id, email from "user" where role = 'admin'`) as { id: string; email: string }[];
    const to = new Map<string, string | null>(rows.map((r) => [r.email.toLowerCase(), r.id]));
    for (const email of (process.env.ADMIN_EMAILS ?? "").split(",")) {
      const e = email.trim().toLowerCase();
      if (e && !to.has(e)) to.set(e, null);
    }
    for (const [email, userId] of to) {
      await notify("system.notice", { userId, email, dedupeKey: `${key}:${email}` }, { subject, body });
    }
  } catch (error) {
    console.error("[physical-wall] Could not alert admins", key, error);
  }
}
