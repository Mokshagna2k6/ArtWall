import { SESClient } from "@aws-sdk/client-ses";
import { afterAll, afterEach, describe, expect, it, vi } from "vitest";

import { makeBooking, makeSlots, makeUser, purgeTestData, q, tid } from "@/test/fixtures";
import {
  deliverPendingNotifications,
  listDeadNotifications,
  MAX_NOTIFICATION_ATTEMPTS,
  notify,
  NOTIFICATION_SCHEMA_VERSION,
  retryDelayMinutes,
  queueScheduledNotifications,
  TEMPLATES,
  type NotificationKind,
} from "@/features/physical-wall/notifications";

afterAll(purgeTestData);

const SES_ENV = { SES_REGION: "us-east-1", SES_ACCESS_KEY_ID: "test", SES_SECRET_ACCESS_KEY: "test" };

// Stub the SES client's `.send`, since SES isn't a plain fetch call.
function stubSes(handler: (input: { Destination: { ToAddresses: string[] }; Subject?: unknown }) => void | Error) {
  vi.spyOn(SESClient.prototype, "send").mockImplementation(async (command: unknown) => {
    const result = handler((command as { input: { Destination: { ToAddresses: string[] } } }).input as never);
    if (result instanceof Error) throw result;
    return {} as never;
  });
}
afterEach(() => {
  vi.restoreAllMocks();
  delete process.env.SES_REGION;
  delete process.env.SES_ACCESS_KEY_ID;
  delete process.env.SES_SECRET_ACCESS_KEY;
});

// Sample data for every kind. A Record over NotificationKind, so a 15th kind
// without a sample here fails to compile.
const SAMPLES: { [K in NotificationKind]: Parameters<(typeof TEMPLATES)[K]>[0] } = {
  "waitlist.offer": { name: "Asha", slotLabel: "B3", expiresAt: "2031-01-01T10:00:00Z" },
  "booking.confirmed": { name: "Asha", bookingId: "bk_1", startDate: "2031-01-01", endDate: "2031-01-07", totalPaise: 1180000 },
  "install.scheduled": { name: "Asha", startsAt: "2031-01-01T10:00:00Z" },
  "install.reminder": { name: "Asha", startsAt: "2031-01-01T10:00:00Z" },
  "hold.expiring": { name: "Asha", bookingId: "bk_1", expiresAt: "2031-01-01T10:00:00Z" },
  "feedback.invite": { name: "Asha", bookingId: "bk_1" },
  "grievance.received": { subject: "Data", dueDays: 30 },
  "grievance.responded": { reply: "Fixed." },
  "identity.approved": { name: "Asha" },
  "identity.rejected": { name: "Asha", note: "Blurry" },
  "ugc.approved": { caption: "Me at the wall" },
  "ugc.removed": { caption: "Me at the wall" },
  "system.notice": { subject: "Account erased", body: "Done." },
  "auth.verify-email": { name: "Asha", url: "https://artwall.in/verify?token=x" },
};

describe("notification templates (BE-1.34)", () => {
  it("there are exactly 14 kinds and each renders a non-empty subject and body", () => {
    const kinds = Object.keys(TEMPLATES) as NotificationKind[];
    expect(kinds).toHaveLength(14);
    for (const kind of kinds) {
      const { subject, body } = (TEMPLATES[kind] as (d: unknown) => { subject: string; body: string })(SAMPLES[kind]);
      expect(subject.length, kind).toBeGreaterThan(3);
      expect(body, kind).toContain("Artwall Labs");
    }
    expect(TEMPLATES["booking.confirmed"](SAMPLES["booking.confirmed"]).body).toContain("11,800");
  });

  it("BE-3.22: every queued row carries the outbox schema_version, with no producer change needed", async () => {
    const user = await makeUser();
    const id = await notify("system.notice", { userId: user.id, email: user.email }, { subject: "x", body: "y" });
    const [row] = await q<{ schema_version: number }>(`select schema_version from pw_notifications where id = $1`, [id]);
    expect(row.schema_version).toBe(NOTIFICATION_SCHEMA_VERSION);
    expect(NOTIFICATION_SCHEMA_VERSION).toBe(1);
  });

  it("every kind is queued and delivered through SES", async () => {
    const user = await makeUser();
    const ids: string[] = [];
    for (const kind of Object.keys(TEMPLATES) as NotificationKind[]) {
      const id = await notify(kind, { userId: user.id, email: user.email }, SAMPLES[kind] as never);
      expect(id, kind).toBeTruthy();
      ids.push(id!);
    }
    expect(await notify("ugc.approved", { email: "not-an-email" }, SAMPLES["ugc.approved"])).toBeNull();

    Object.assign(process.env, SES_ENV);
    const sent: { to: string[] }[] = [];
    stubSes((input) => {
      sent.push({ to: input.Destination.ToAddresses });
    });

    expect(await deliverPendingNotifications(50, ids)).toEqual({ sent: 14, failed: 0, dead: 0, skipped: 0 });
    expect(sent.every((m) => m.to[0] === user.email)).toBe(true);
    const rows = await q<{ status: string; kind: string }>(`select status, kind from pw_notifications where id = any($1)`, [ids]);
    expect(new Set(rows.map((r) => r.kind)).size).toBe(14);
    expect(rows.every((r) => r.status === "sent")).toBe(true);
  });

  it("an SES failure goes to 'retrying' with backoff, then dead-letters after max attempts (BE-2.12)", async () => {
    const user = await makeUser();
    const id = (await notify("system.notice", { email: user.email }, SAMPLES["system.notice"]))!;
    Object.assign(process.env, SES_ENV);
    stubSes(() => new Error("500 nope"));

    expect(await deliverPendingNotifications(5, [id])).toMatchObject({ sent: 0, failed: 1, dead: 0 });
    let [row] = await q<{ status: string; attempts: number; last_error: string; wait: number }>(
      `select status, attempts, last_error, extract(epoch from next_attempt_at - now())::int as wait
       from pw_notifications where id = $1`,
      [id]
    );
    expect(row).toMatchObject({ status: "retrying", attempts: 1 });
    expect(row.last_error).toContain("500");
    expect(row.wait).toBeGreaterThan(0); // backing off: not due yet
    expect(await deliverPendingNotifications(5, [id])).toMatchObject({ sent: 0, failed: 0 }); // not retried early

    for (let i = 2; i <= MAX_NOTIFICATION_ATTEMPTS; i++) {
      await q(`update pw_notifications set next_attempt_at = now() where id = $1`, [id]);
      await deliverPendingNotifications(5, [id]);
    }
    [row] = await q(`select status, attempts from pw_notifications where id = $1`, [id]);
    expect(row).toMatchObject({ status: "dead", attempts: MAX_NOTIFICATION_ATTEMPTS });
    expect((await listDeadNotifications(500)).map((n) => n.id)).toContain(id);

    // Dead is final: no more attempts.
    await q(`update pw_notifications set next_attempt_at = now() where id = $1`, [id]);
    expect(await deliverPendingNotifications(5, [id])).toMatchObject({ sent: 0, failed: 0, dead: 0 });
    expect(retryDelayMinutes(1)).toBe(1);
    expect(retryDelayMinutes(3)).toBe(16);
  });

  it("overlapping delivery runs send each message exactly once (BE-2.13)", async () => {
    const user = await makeUser();
    const ids: string[] = [];
    for (let i = 0; i < 6; i++) {
      ids.push((await notify("system.notice", { email: user.email }, { subject: `betest ${i}`, body: "x" }))!);
    }
    Object.assign(process.env, SES_ENV);
    let calls = 0;
    stubSes(() => {
      calls++;
    });

    // Four runs at once (cron overlap + an admin click + a re-run).
    const runs = await Promise.all([1, 2, 3, 4].map(() => deliverPendingNotifications(50, ids)));
    expect(runs.reduce((n, r) => n + r.sent, 0)).toBe(6);
    expect(calls).toBe(6); // one provider call per message: the `for update skip locked` claim, not a provider key, is what dedupes.
    const rows = await q<{ status: string }>(`select status from pw_notifications where id = any($1)`, [ids]);
    expect(rows.every((r) => r.status === "sent")).toBe(true);

    // A re-run afterwards finds nothing to do.
    expect((await deliverPendingNotifications(50, ids)).sent).toBe(0);
    expect(calls).toBe(6);
  });

  it("a stale claim (run died mid-send) is retried", async () => {
    const user = await makeUser();
    const id = (await notify("system.notice", { email: user.email }, SAMPLES["system.notice"]))!;
    await q(`update pw_notifications set status = 'sending', claimed_at = now() - interval '11 minutes' where id = $1`, [id]);
    Object.assign(process.env, SES_ENV);
    let calls = 0;
    stubSes(() => {
      calls++;
    });
    expect((await deliverPendingNotifications(5, [id])).sent).toBe(1);
    expect(calls).toBe(1);

    // A fresh claim (another run is mid-send) is left alone.
    const other = (await notify("system.notice", { email: user.email }, SAMPLES["system.notice"]))!;
    await q(`update pw_notifications set status = 'sending', claimed_at = now() where id = $1`, [other]);
    expect((await deliverPendingNotifications(5, [other])).sent).toBe(0);
  });

  it("scheduled sweep queues install reminder, hold expiring and feedback invite once each", async () => {
    const artist = await makeUser();
    const held = await makeBooking(artist.id, await makeSlots(1));
    await q(`update pw_bookings set hold_expires_at = now() + interval '5 minutes' where id = $1`, [held]);
    const past = await makeBooking(artist.id, await makeSlots(1), {
      status: "paid",
      start: new Date(Date.now() - 10 * 86400_000).toISOString().slice(0, 10),
      days: 5,
    });
    const upcoming = await makeBooking(artist.id, await makeSlots(1), { status: "paid" });
    const iw = tid("iw");
    await q(
      `insert into pw_install_windows (id, booking_id, starts_at, ends_at, status)
       values ($1, $2, now() + interval '3 hours', now() + interval '4 hours', 'reserved')`,
      [iw, upcoming]
    );

    await queueScheduledNotifications();
    await queueScheduledNotifications(); // second run: nothing new
    const rows = await q<{ kind: string; dedupe_key: string }>(
      `select kind, dedupe_key from pw_notifications where user_id = $1 order by kind`,
      [artist.id]
    );
    expect(rows).toEqual([
      { kind: "feedback.invite", dedupe_key: `feedback.invite:${past}` },
      { kind: "hold.expiring", dedupe_key: `hold.expiring:${held}` },
      { kind: "install.reminder", dedupe_key: `install.reminder:${iw}` },
    ]);
  });
});
