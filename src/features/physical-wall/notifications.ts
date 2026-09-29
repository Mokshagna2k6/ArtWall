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
  "system.notice": (d: { subject: string; body: string }) => ({
    subject: d.subject,
    body: `${d.body}${SIGN_OFF}`,
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

/** Queue a notification. Never throws into the caller's flow. */
export async function queueNotification(input: QueueInput): Promise<string | null> {
  try {
    const sql = getSql();
    const id = newId("ntf");
    const rows = (await sql`
      insert into pw_notifications (id, user_id, recipient, subject, body, kind, channel, dedupe_key)
      values (${id}, ${input.userId ?? null}, ${input.recipient}, ${input.subject},
              ${input.body}, ${input.kind}, ${input.channel ?? "email"}, ${input.dedupeKey ?? null})
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

/**
 * Deliver pending notifications.
 *
 * Called by the cron route (`/api/cron/deliver-notifications`) and by the
 * admin notifications page ("Send pending now"). Batched, capped, and honest:
 * each row records its own outcome, and a failure marks the row rather than
 * aborting the batch.
 */
export async function deliverPendingNotifications(
  limit = 25,
  /** Restrict to these rows (tests; admin "send this one"). */
  onlyIds?: string[],
  /** Epoch ms after which no new row is started (lib/cron.ts deadline). */
  until = Infinity
): Promise<{
  sent: number;
  failed: number;
  skipped: number;
}> {
  const sql = getSql();
  const pending = (await sql`
    select id, recipient, subject, body, attempts
    from pw_notifications
    where status = 'pending' and channel = 'email'
      and (${onlyIds ?? null}::text[] is null or id = any(${onlyIds ?? null}::text[]))
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
    if (Date.now() > until) break; // left pending for the next run
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