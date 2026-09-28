import { createHmac } from "node:crypto";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

import { actAs } from "@/test/db-setup";
import { makeBooking, makeSlots, makeUser, purgeTestData, q, tid } from "@/test/fixtures";

// Razorpay HTTP is faked: a real captured payment needs a human at Checkout.
// (createOrder against the real test API is exercised in razorpay-live below.)
const rp = vi.hoisted(() => ({
  payments: new Map<string, { id: string; order_id: string; amount: number; status: string; currency: string }>(),
  refunds: [] as { id: string; payment_id: string; amount: number; notes: { refundId: string } }[],
  failNextRefund: false,
  createRefundCalls: 0,
}));

vi.mock("@/features/physical-wall/razorpay", async (orig) => {
  const real = await orig<typeof import("@/features/physical-wall/razorpay")>();
  return {
    ...real,
    fetchPayment: vi.fn(async (id: string) => {
      const p = rp.payments.get(id);
      if (!p) throw new Error("no such payment");
      return p;
    }),
    fetchOrder: vi.fn(async (id: string) => ({ id, amount: 0, currency: "INR", status: "created", amount_paid: 0 })),
    findRefund: vi.fn(async (paymentId: string, refundId: string) =>
      rp.refunds.find((r) => r.payment_id === paymentId && r.notes.refundId === refundId) ?? null
    ),
    createRefund: vi.fn(async (paymentId: string, amount: number, refs: { refundId: string }) => {
      rp.createRefundCalls += 1;
      if (rp.failNextRefund) {
        rp.failNextRefund = false;
        throw new Error("Razorpay 502");
      }
      const refund = { id: `rfnd_${rp.refunds.length}`, payment_id: paymentId, amount, status: "processed", notes: refs };
      rp.refunds.push(refund);
      return refund;
    }),
  };
});

import { cancelBooking } from "@/features/physical-wall/actions/booking";
import { markBookingPaid, settleFromWebhook, verifyPayment } from "@/features/physical-wall/actions/payment";
import { processOpenRefunds, processRefund } from "@/features/physical-wall/refunds";

const sign = (orderId: string, paymentId: string) =>
  createHmac("sha256", process.env.RAZORPAY_KEY_SECRET!).update(`${orderId}|${paymentId}`).digest("hex");

function capture(orderId: string, amount = 11800) {
  const id = tid("rzpay");
  rp.payments.set(id, { id, order_id: orderId, amount, status: "captured", currency: "INR" });
  return id;
}

const bookingRow = async (id: string) =>
  (await q<{ status: string }>(`select status from pw_bookings where id = $1`, [id]))[0];

afterAll(purgeTestData);
beforeEach(() => {
  rp.createRefundCalls = 0;
  rp.failNextRefund = false;
});

describe("payments (BE-1.11 / 1.12 / 1.13)", () => {
  it("client verify + webhook for one payment settle once: one payment row, one ledger row", async () => {
    const artist = await makeUser();
    const slots = await makeSlots(2);
    const orderId = tid("order");
    const booking = await makeBooking(artist.id, slots, { orderId });
    const paymentId = capture(orderId);

    actAs(artist);
    const verified = await verifyPayment({
      razorpay_order_id: orderId,
      razorpay_payment_id: paymentId,
      razorpay_signature: sign(orderId, paymentId),
    });
    expect(verified.status).toBe("ok");
    expect(await settleFromWebhook({ bookingId: null, eventId: paymentId, paymentId, orderId, amountPaise: 11800 })).toBe(
      "already-settled"
    );

    expect((await bookingRow(booking)).status).toBe("paid");
    expect(await q(`select 1 from pw_payments where payment_id = $1`, [paymentId])).toHaveLength(1);
    expect(await q(`select 1 from pw_ledger where booking_id = $1 and type = 'revenue'`, [booking])).toHaveLength(1);
    const states = await q<{ state: string }>(`select state from pw_slots where id = any($1::text[])`, [slots]);
    expect(states.every((s) => s.state === "booked")).toBe(true);
    // Settled once, so the artist is told once.
    expect(await q(`select 1 from pw_notifications where user_id = $1 and kind = 'booking.confirmed'`, [artist.id])).toHaveLength(1);
  });

  it("webhook alone settles (client never came back), booking found via our order row", async () => {
    const artist = await makeUser();
    const orderId = tid("order");
    const booking = await makeBooking(artist.id, await makeSlots(1), { orderId });
    const paymentId = capture(orderId);
    expect(await settleFromWebhook({ bookingId: null, eventId: paymentId, paymentId, orderId, amountPaise: 11800 })).toBe(
      "settled"
    );
    expect((await bookingRow(booking)).status).toBe("paid");
  });

  it("rejects a forged signature and someone else's order", async () => {
    const artist = await makeUser();
    const other = await makeUser();
    const orderId = tid("order");
    await makeBooking(artist.id, await makeSlots(1), { orderId });
    const paymentId = capture(orderId);

    actAs(artist);
    expect(
      (await verifyPayment({ razorpay_order_id: orderId, razorpay_payment_id: paymentId, razorpay_signature: "00" })).status
    ).toBe("error");
    actAs(other);
    const r = await verifyPayment({
      razorpay_order_id: orderId,
      razorpay_payment_id: paymentId,
      razorpay_signature: sign(orderId, paymentId),
    });
    expect(r.status).toBe("error");
  });

  it("a capture for an expired booking whose slot was re-taken is recorded and fully refunded", async () => {
    const [slot] = await makeSlots(1);
    const a = await makeUser();
    const b = await makeUser();
    const orderId = tid("order");
    const late = await makeBooking(a.id, [slot], { status: "expired", orderId });
    await makeBooking(b.id, [slot], { status: "paid" });
    const paymentId = capture(orderId);

    expect(await settleFromWebhook({ bookingId: late, eventId: paymentId, paymentId, orderId, amountPaise: 11800 })).toBe(
      "refund-queued"
    );
    expect((await bookingRow(late)).status).toBe("expired");
    const [refund] = await q<{ status: string; amount_paise: number; payment_id: string }>(
      `select status, amount_paise, payment_id from pw_refunds where booking_id = $1`,
      [late]
    );
    expect(refund).toMatchObject({ status: "processed", amount_paise: 11800, payment_id: paymentId });
    // Redelivery: still one payment, one refund.
    expect(await settleFromWebhook({ bookingId: late, eventId: paymentId, paymentId, orderId, amountPaise: 11800 })).toBe(
      "already-settled"
    );
    expect(await q(`select 1 from pw_refunds where booking_id = $1`, [late])).toHaveLength(1);
  });

  it("an expired booking whose slots are still free is confirmed on late capture", async () => {
    const a = await makeUser();
    const orderId = tid("order");
    const slots = await makeSlots(1);
    const late = await makeBooking(a.id, slots, { status: "expired", orderId });
    const paymentId = capture(orderId);
    expect(await settleFromWebhook({ bookingId: late, eventId: paymentId, paymentId, orderId, amountPaise: 11800 })).toBe(
      "settled"
    );
    expect((await q<{ state: string }>(`select state from pw_slots where id = $1`, [slots[0]]))[0].state).toBe("booked");
  });

  it("wrong amount is refunded, not confirmed", async () => {
    const a = await makeUser();
    const orderId = tid("order");
    const bk = await makeBooking(a.id, await makeSlots(1), { orderId });
    const paymentId = capture(orderId, 100);
    expect(await settleFromWebhook({ bookingId: bk, eventId: paymentId, paymentId, orderId, amountPaise: 100 })).toBe(
      "refund-queued"
    );
    expect((await bookingRow(bk)).status).toBe("held");
  });

  it("admin mark-paid needs an offline method + reference, and is audited with the actor", async () => {
    const admin = await makeUser("admin");
    const a = await makeUser();
    const bk = await makeBooking(a.id, await makeSlots(1));
    actAs(admin);
    const f = new FormData();
    f.set("bookingId", bk);
    f.set("note", "UTR 12345");
    expect((await markBookingPaid({ status: "idle" } as never, f)).status).toBe("error");
    f.set("method", "bank_transfer");
    expect((await markBookingPaid({ status: "idle" } as never, f)).status).toBe("ok");
    const [audit] = await q<{ actor_id: string; after: { note: string } }>(
      `select actor_id, after from pw_audit_log where subject_id = $1 and action = 'booking.paid'`,
      [bk]
    );
    expect(audit.actor_id).toBe(admin.id);
    expect(audit.after.note).toBe("bank_transfer: UTR 12345");
    actAs(a);
    expect((await markBookingPaid({ status: "idle" } as never, f)).status).toBe("error"); // artists can't
  });
});

describe("durable refunds (BE-1.14)", () => {
  async function paidBooking() {
    const artist = await makeUser();
    const orderId = tid("order");
    const booking = await makeBooking(artist.id, await makeSlots(1), { orderId });
    const paymentId = capture(orderId);
    await settleFromWebhook({ bookingId: booking, eventId: paymentId, paymentId, orderId, amountPaise: 11800 });
    return { artist, booking, paymentId };
  }

  function cancelForm(bookingId: string) {
    const f = new FormData();
    f.set("bookingId", bookingId);
    return f;
  }

  it("cancel commits a pending refund, then Razorpay is called and it is processed", async () => {
    const { artist, booking, paymentId } = await paidBooking();
    actAs(artist);
    expect((await cancelBooking({ status: "idle" } as never, cancelForm(booking))).status).toBe("ok");
    const [r] = await q<{ status: string; amount_paise: number; provider_refund_id: string }>(
      `select status, amount_paise, provider_refund_id from pw_refunds where booking_id = $1`,
      [booking]
    );
    expect(r.status).toBe("processed");
    expect(r.amount_paise).toBe(5900); // 50% policy
    expect(rp.refunds.find((x) => x.id === r.provider_refund_id)?.payment_id).toBe(paymentId);
    expect((await bookingRow(booking)).status).toBe("refunded");
  });

  it("a Razorpay failure leaves the cancel committed and the refund 'failed'; the cron retries it", async () => {
    const { artist, booking } = await paidBooking();
    rp.failNextRefund = true;
    actAs(artist);
    expect((await cancelBooking({ status: "idle" } as never, cancelForm(booking))).status).toBe("ok");
    let [r] = await q<{ id: string; status: string; last_error: string }>(
      `select id, status, last_error from pw_refunds where booking_id = $1`,
      [booking]
    );
    expect(r.status).toBe("failed");
    expect(r.last_error).toContain("502");
    expect((await bookingRow(booking)).status).toBe("refunded");

    await processOpenRefunds();
    [r] = await q(`select id, status, last_error from pw_refunds where booking_id = $1`, [booking]);
    expect(r.status).toBe("processed");
  });

  it("crash after Razorpay accepted but before the DB update: retry finds it, never refunds twice", async () => {
    const { artist, booking, paymentId } = await paidBooking();
    rp.failNextRefund = true; // keep the in-request attempt from finishing
    actAs(artist);
    await cancelBooking({ status: "idle" } as never, cancelForm(booking));
    const [{ id }] = await q<{ id: string }>(`select id from pw_refunds where booking_id = $1`, [booking]);

    // Simulate: a worker claimed it, Razorpay created the refund, then the process died.
    rp.refunds.push({ id: "rfnd_crash", payment_id: paymentId, amount: 5900, notes: { refundId: id } });
    await q(`update pw_refunds set status = 'processing', updated_at = now() - interval '11 minutes' where id = $1`, [id]);

    expect(await processRefund(id)).toBe("processed");
    const [r] = await q<{ provider_refund_id: string }>(`select provider_refund_id from pw_refunds where id = $1`, [id]);
    expect(r.provider_refund_id).toBe("rfnd_crash");
    expect(rp.refunds.filter((x) => x.notes.refundId === id)).toHaveLength(1);
    expect(rp.createRefundCalls).toBe(1); // only the failed in-request attempt
  });

  it("a fresh 'processing' row (another worker mid-flight) is not touched", async () => {
    const { artist, booking } = await paidBooking();
    rp.failNextRefund = true;
    actAs(artist);
    await cancelBooking({ status: "idle" } as never, cancelForm(booking));
    const [{ id }] = await q<{ id: string }>(`select id from pw_refunds where booking_id = $1`, [booking]);
    await q(`update pw_refunds set status = 'processing', updated_at = now() where id = $1`, [id]);
    expect(await processRefund(id)).toBe("skipped");
  });

  it("offline-paid bookings get a 'manual' refund row, never a Razorpay call", async () => {
    const admin = await makeUser("admin");
    const artist = await makeUser();
    const booking = await makeBooking(artist.id, await makeSlots(1));
    actAs(admin);
    const f = new FormData();
    f.set("bookingId", booking);
    f.set("method", "cash");
    f.set("note", "cash at venue");
    await markBookingPaid({ status: "idle" } as never, f);
    actAs(artist);
    await cancelBooking({ status: "idle" } as never, cancelForm(booking));
    const [r] = await q<{ status: string }>(`select status from pw_refunds where booking_id = $1`, [booking]);
    expect(r.status).toBe("manual");
    expect(rp.createRefundCalls).toBe(0);
  });
});
