import { afterAll, afterEach, describe, expect, it, vi } from "vitest";

import { makeBooking, makeSlots, makeUser, purgeTestData, q, tid } from "@/test/fixtures";
import {
  deliverPendingNotifications,
  notify,
  queueScheduledNotifications,
  TEMPLATES,
  type NotificationKind,
} from "@/features/physical-wall/notifications";

afterAll(purgeTestData);

// Stub only Resend; the Neon HTTP driver also uses fetch.
const realFetch = globalThis.fetch;
function stubResend(handler: (init: RequestInit) => Response) {
  vi.stubGlobal("fetch", (url: string | URL, init?: RequestInit) =>
    String(url).startsWith("https://api.resend.com") ? Promise.resolve(handler(init!)) : realFetch(url, init)
  );
}
afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.RESEND_API_KEY;
});

// Sample data for every kind. A Record over NotificationKind, so a 14th kind
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
};

describe("notification templates (BE-1.34)", () => {
  it("there are exactly 13 kinds and each renders a non-empty subject and body", () => {
    const kinds = Object.keys(TEMPLATES) as NotificationKind[];
    expect(kinds).toHaveLength(13);
    for (const kind of kinds) {
      const { subject, body } = (TEMPLATES[kind] as (d: unknown) => { subject: string; body: string })(SAMPLES[kind]);
      expect(subject.length, kind).toBeGreaterThan(3);
      expect(body, kind).toContain("Artwall Labs");
    }
    expect(TEMPLATES["booking.confirmed"](SAMPLES["booking.confirmed"]).body).toContain("11,800");
  });

  it("every kind is queued and delivered through Resend", async () => {
    const user = await makeUser();
    const ids: string[] = [];
    for (const kind of Object.keys(TEMPLATES) as NotificationKind[]) {
      const id = await notify(kind, { userId: user.id, email: user.email }, SAMPLES[kind] as never);
      expect(id, kind).toBeTruthy();
      ids.push(id!);
    }
    expect(await notify("ugc.approved", { email: "not-an-email" }, SAMPLES["ugc.approved"])).toBeNull();

    process.env.RESEND_API_KEY = "re_test";
    const sent: { to: string[]; subject: string }[] = [];
    stubResend((init) => {
      sent.push(JSON.parse(String(init.body)));
      return new Response("{}", { status: 200 });
    });

    expect(await deliverPendingNotifications(50, ids)).toEqual({ sent: 13, failed: 0, skipped: 0 });
    expect(sent.every((m) => m.to[0] === user.email)).toBe(true);
    const rows = await q<{ status: string; kind: string }>(`select status, kind from pw_notifications where id = any($1)`, [ids]);
    expect(new Set(rows.map((r) => r.kind)).size).toBe(13);
    expect(rows.every((r) => r.status === "sent")).toBe(true);
  });

  it("a Resend failure leaves the row pending with the error, then failed after 3 attempts", async () => {
    const user = await makeUser();
    const id = (await notify("system.notice", { email: user.email }, SAMPLES["system.notice"]))!;
    process.env.RESEND_API_KEY = "re_test";
    stubResend(() => new Response("nope", { status: 500 }));
    for (let i = 0; i < 3; i++) await deliverPendingNotifications(5, [id]);
    const [row] = await q<{ status: string; attempts: number; last_error: string }>(
      `select status, attempts, last_error from pw_notifications where id = $1`,
      [id]
    );
    expect(row).toMatchObject({ status: "failed", attempts: 3 });
    expect(row.last_error).toContain("500");
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
