import { createHmac } from "node:crypto";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

import { actAs } from "@/test/db-setup";
import { makeBooking, makeSlots, makeUser, purgeTestData, q, tid } from "@/test/fixtures";

/**
 * BE-2.02 (webhook replay idempotency, through the real route),
 * BE-2.03 (settlement: full payment, partial refund, full refund, failed payment),
 * BE-2.06 (revenue report totals, exact, against the real database).
 *
 * Razorpay HTTP is faked (a captured payment needs a human at Checkout). The
 * refund percentage is overridable so a 100% refund can be tested without
 * publishing a 100% policy version into the shared database.
 */
const rp = vi.hoisted(() => ({
  payments: new Map<string, { id: string; order_id: string; amount: number; status: string; currency: string }>(),
  refunds: [] as { id: string; payment_id: string; amount: number; notes: { refundId: string } }[],
  policyPct: null as number | null,
}));

vi.mock("@/features/physical-wall/razorpay", async (orig) => ({
  ...(await orig<object>()),
  fetchPayment: vi.fn(async (id: string) => {
    const p = rp.payments.get(id);
    if (!p) throw new Error("no such payment");
    return p;
  }),
  findRefund: vi.fn(async (paymentId: string, refundId: string) =>
    rp.refunds.find((r) => r.payment_id === paymentId && r.notes.refundId === refundId) ?? null
  ),
  createRefund: vi.fn(async (paymentId: string, amount: number, refs: { refundId: string }) => {
    const refund = { id: `rfnd_${rp.refunds.length}_${crypto.randomUUID().slice(0, 8)}`, payment_id: paymentId, amount, status: "processed", notes: refs };
    rp.refunds.push(refund);
    return refund;
  }),
}));

vi.mock("@/features/physical-wall/data/catalogs", async (orig) => {
  const real = await orig<typeof import("@/features/physical-wall/data/catalogs")>();
  return {
    ...real,
    getRefundPolicyVersion: vi.fn(async (v: number) => {
      const policy = await real.getRefundPolicyVersion(v);
      return policy && rp.policyPct !== null ? { ...policy, percentage: rp.policyPct } : policy;
    }),
  };
});

import { POST as webhook } from "@/app/api/physical-wall/razorpay/webhook/route";
import { cancelBooking } from "@/features/physical-wall/actions/booking";
import { verifyPayment } from "@/features/physical-wall/actions/payment";
import { getRevenueReport } from "@/features/physical-wall/data/ledger";

afterAll(purgeTestData);
beforeEach(() => {
  rp.policyPct = null;
});

const secret = process.env.RAZORPAY_WEBHOOK_SECRET!;

function event(kind: string, p: { id: string; order_id: string; amount: number; bookingId?: string }) {
  return JSON.stringify({
    event: kind,
    payload: {
      payment: {
        entity: { id: p.id, order_id: p.order_id, amount: p.amount, currency: "INR", notes: p.bookingId ? { bookingId: p.bookingId } : {} },
      },
    },
  });
}

function deliver(body: string, eventId: string) {
  return webhook(
    new Request("http://x/api/physical-wall/razorpay/webhook", {
      method: "POST",
      body,
      headers: {
        "x-razorpay-signature": createHmac("sha256", secret).update(body).digest("hex"),
        "x-razorpay-event-id": eventId,
      },
    })
  );
}

async function heldBooking(total = 11800) {
  const artist = await makeUser();
  const orderId = tid("order");
  const booking = await makeBooking(artist.id, await makeSlots(1), { orderId, totalPaise: total });
  const paymentId = tid("pay");
  rp.payments.set(paymentId, { id: paymentId, order_id: orderId, amount: total, status: "captured", currency: "INR" });
  return { artist, orderId, booking, paymentId, total };
}

async function payViaWebhook(b: Awaited<ReturnType<typeof heldBooking>>) {
  const res = await deliver(
    event("payment.captured", { id: b.paymentId, order_id: b.orderId, amount: b.total, bookingId: b.booking }),
    tid("evt")
  );
  expect(res.status).toBe(200);
  return (await res.json()) as { status: string };
}

const cancel = async (b: { artist: { id: string; name: string; email: string }; booking: string }) => {
  actAs(b.artist);
  const f = new FormData();
  f.set("bookingId", b.booking);
  return cancelBooking({ status: "idle" } as never, f);
};

const rows = {
  payments: (booking: string) => q<{ status: string; amount_paise: number }>(`select status, amount_paise from pw_payments where booking_id = $1 and payment_id is not null`, [booking]),
  ledger: (booking: string) =>
    q<{ type: string; category: string; amount_paise: number }>(
      `select type, category, amount_paise from pw_ledger where booking_id = $1 order by type desc`,
      [booking]
    ),
  refunds: (booking: string) => q<{ status: string; amount_paise: number }>(`select status, amount_paise from pw_refunds where booking_id = $1`, [booking]),
  status: async (booking: string) => (await q<{ status: string }>(`select status from pw_bookings where id = $1`, [booking]))[0].status,
};

describe("webhook replay is idempotent on the event id (BE-2.02)", () => {
  it("the same event delivered twice, then five times at once: one payment, one ledger entry, one notification", async () => {
    const b = await heldBooking();
    const body = event("payment.captured", { id: b.paymentId, order_id: b.orderId, amount: b.total, bookingId: b.booking });
    const eventId = tid("evt");

    expect(await (await deliver(body, eventId)).json()).toEqual({ status: "settled" });
    expect(await (await deliver(body, eventId)).json()).toEqual({ status: "already-settled" });
    const burst = await Promise.all(Array.from({ length: 5 }, () => deliver(body, eventId)));
    for (const res of burst) expect(await res.json()).toEqual({ status: "already-settled" });

    expect(await rows.payments(b.booking)).toHaveLength(1);
    expect(await rows.ledger(b.booking)).toEqual([{ type: "revenue", category: "booking", amount_paise: 11800 }]);
    expect(await q(`select 1 from pw_payments where event_id = $1`, [eventId])).toHaveLength(1);
    expect(await q(`select 1 from pw_notifications where user_id = $1 and kind = 'booking.confirmed'`, [b.artist.id])).toHaveLength(1);
  });

  it("a first delivery racing its own retry still settles exactly once", async () => {
    const b = await heldBooking();
    const body = event("payment.captured", { id: b.paymentId, order_id: b.orderId, amount: b.total });
    const eventId = tid("evt");
    const results = await Promise.all([deliver(body, eventId), deliver(body, eventId), deliver(body, eventId)]);
    const statuses = (await Promise.all(results.map((r) => r.json()))).map((r) => r.status).sort();
    expect(statuses).toEqual(["already-settled", "already-settled", "settled"]);
    expect(await rows.ledger(b.booking)).toHaveLength(1);
  });
});

describe("settlement (BE-2.03)", () => {
  it("full payment: booking paid, slot booked, captured payment and revenue ledger = total", async () => {
    const b = await heldBooking(23_600);
    expect((await payViaWebhook(b)).status).toBe("settled");
    expect(await rows.status(b.booking)).toBe("paid");
    expect(await rows.payments(b.booking)).toEqual([{ status: "captured", amount_paise: 23_600 }]);
    expect(await rows.ledger(b.booking)).toEqual([{ type: "revenue", category: "booking", amount_paise: 23_600 }]);
    const slot = await q<{ state: string }>(
      `select s.state from pw_slots s join pw_booking_slots bs on bs.slot_id = s.id where bs.booking_id = $1`,
      [b.booking]
    );
    expect(slot).toEqual([{ state: "booked" }]);
  });

  it("partial refund (50% policy): refund processed at Razorpay for half, expense ledger row, net = half", async () => {
    const b = await heldBooking(11_801); // odd total: 50% = 5900.5 → 5901 (half-up)
    await payViaWebhook(b);
    expect((await cancel(b)).status).toBe("ok");
    expect(await rows.status(b.booking)).toBe("refunded");
    expect(await rows.refunds(b.booking)).toEqual([{ status: "processed", amount_paise: 5901 }]);
    expect(rp.refunds.find((r) => r.payment_id === b.paymentId)?.amount).toBe(5901);
    expect(await rows.ledger(b.booking)).toEqual([
      { type: "revenue", category: "booking", amount_paise: 11_801 },
      { type: "expense", category: "refund", amount_paise: 5901 },
    ]);
  });

  it("full refund (100% policy): the whole amount goes back and the booking nets to zero", async () => {
    rp.policyPct = 100;
    const b = await heldBooking(11_800);
    await payViaWebhook(b);
    expect((await cancel(b)).status).toBe("ok");
    expect(await rows.refunds(b.booking)).toEqual([{ status: "processed", amount_paise: 11_800 }]);
    const ledger = await rows.ledger(b.booking);
    expect(ledger.reduce((n, l) => n + (l.type === "revenue" ? l.amount_paise : -l.amount_paise), 0)).toBe(0);
    // A second cancel is refused; still exactly one refund.
    expect((await cancel(b)).status).toBe("error");
    expect(await rows.refunds(b.booking)).toHaveLength(1);
  });

  it("failed payment: payment.failed is ignored and an uncaptured client verify does not settle", async () => {
    const b = await heldBooking();
    rp.payments.set(b.paymentId, { ...rp.payments.get(b.paymentId)!, status: "failed" });

    const res = await deliver(event("payment.failed", { id: b.paymentId, order_id: b.orderId, amount: b.total }), tid("evt"));
    expect(await res.json()).toEqual({ ignored: "payment.failed" });

    actAs(b.artist);
    const sig = createHmac("sha256", process.env.RAZORPAY_KEY_SECRET!).update(`${b.orderId}|${b.paymentId}`).digest("hex");
    const verified = await verifyPayment({ razorpay_order_id: b.orderId, razorpay_payment_id: b.paymentId, razorpay_signature: sig });
    expect(verified).toMatchObject({ status: "ok", data: { status: "pending" } });

    expect(await rows.status(b.booking)).toBe("held");
    expect(await rows.payments(b.booking)).toEqual([]);
    expect(await rows.ledger(b.booking)).toEqual([]);
  });
});

describe("revenue report totals (BE-2.06)", () => {
  it("one artist's paid, partially refunded and fully refunded bookings sum exactly", async () => {
    const artist = await makeUser();
    const book = async (total: number) => {
      const orderId = tid("order");
      const booking = await makeBooking(artist.id, await makeSlots(1), { orderId, totalPaise: total });
      const paymentId = tid("pay");
      rp.payments.set(paymentId, { id: paymentId, order_id: orderId, amount: total, status: "captured", currency: "INR" });
      await payViaWebhook({ artist, orderId, booking, paymentId, total });
      return { artist, booking };
    };

    const kept = await book(20_000);
    const half = await book(10_000);
    const full = await book(5_000);
    await book(7_000); // a fourth, never invoiced
    await cancel(half); // 50% → 5,000 back
    rp.policyPct = 100;
    await cancel(full); // 100% → 5,000 back

    const report = await getRevenueReport("month", { artistId: artist.id });
    expect(report.totals).toEqual({ grossPaise: 42_000, refundPaise: 10_000, netPaise: 32_000, bookings: 4 });
    expect(report.rows).toHaveLength(1); // all today → one period
    expect(report.rows[0]).toMatchObject({ grossPaise: 42_000, refundPaise: 10_000, netPaise: 32_000 });
    // Still-paid bookings with no invoice: kept (20,000) + the fourth (7,000).
    expect(report.awaitingInvoice).toEqual({ count: 2, paise: 27_000 });
    expect(report.unreconciled).toEqual({ count: 0, paise: 0 });

    const day = await getRevenueReport("day", { artistId: artist.id });
    expect(day.totals.netPaise).toBe(32_000);
    expect(kept.booking).toBeTruthy();

    // The unscoped report includes at least this artist's figures.
    const all = await getRevenueReport("month");
    expect(all.totals.grossPaise).toBeGreaterThanOrEqual(42_000);
  });
});
