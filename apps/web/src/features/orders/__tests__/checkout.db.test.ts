import { createHmac } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { actAs, type TestUser } from "@/test/db-setup";
import { grantTestAdminRole, makeArtwork, makeProfile, makeUser, purgeTestData, q, tid } from "@/test/fixtures";

/**
 * Marketplace checkout, end to end against the real database: cart, a
 * multi-seller checkout paid with ONE Razorpay payment, the shared webhook
 * (idempotency, amount mismatch, late capture), per-seller acceptance /
 * decline / refund / release, partial-refund math, escrow ledger balance,
 * payouts, and the oversell race. Razorpay's HTTP API is faked.
 */
const rp = vi.hoisted(() => ({
  orders: [] as { id: string; amount: number; orderId: string }[],
  payments: new Map<string, { id: string; order_id: string; amount: number; status: string; currency: string }>(),
  refunds: [] as { id: string; payment_id: string; amount: number; notes: { refundId: string } }[],
  createRefundCalls: 0,
  failNextRefund: false,
}));

vi.mock("@/features/physical-wall/razorpay", async (orig) => ({
  ...(await orig<object>()),
  createMarketplaceOrder: vi.fn(async (orderId: string, _receipt: string, amount: number) => {
    const o = { id: `order_${crypto.randomUUID().slice(0, 12)}`, amount, currency: "INR", orderId };
    rp.orders.push(o);
    return o;
  }),
  fetchPayment: vi.fn(async (id: string) => {
    const p = rp.payments.get(id);
    if (!p) throw new Error("no such payment");
    return p;
  }),
  findRefund: vi.fn(async (paymentId: string, refundId: string) =>
    rp.refunds.find((r) => r.payment_id === paymentId && r.notes.refundId === refundId) ?? null
  ),
  createRefund: vi.fn(async (paymentId: string, amount: number, refs: { refundId: string }) => {
    rp.createRefundCalls += 1;
    const refund = { id: `rfnd_${rp.refunds.length}_${crypto.randomUUID().slice(0, 8)}`, payment_id: paymentId, amount, status: "processed", notes: refs };
    rp.refunds.push(refund);
    if (rp.failNextRefund) {
      rp.failNextRefund = false;
      throw new Error("network died after Razorpay accepted the refund");
    }
    return refund;
  }),
}));

import { POST as webhook } from "@/app/api/physical-wall/razorpay/webhook/route";
import { addCollectionToCart, addToCart, removeFromCart, removeUnavailableFromCart } from "@/features/orders/actions/cart";
import { cancelCheckout, placeCheckout, verifyCheckoutPayment } from "@/features/orders/actions/checkout";
import { acceptOrder, adminMarkDelivered, adminRefundOrder, cancelOrder, confirmDelivery, declineOrder, markPayoutPaid, markShipped } from "@/features/orders/actions/orders";
import { loadCart } from "@/features/orders/cart";
import { processOpenOrderRefunds, processOrderRefund } from "@/features/orders/refunds";
import { runOrderSweep } from "@/features/orders/fulfilment";

afterAll(purgeTestData);
// Other suites close the seeded commission version and purge their own; make sure one is open.
beforeAll(async () => {
  if ((await q(`select 1 from commission_policy_versions where effective_to is null`)).length === 0) {
    await q(
      `insert into commission_policy_versions (id, version, platform_bps, artist_bps, curator_bps, venue_bps, royalty_bps)
       values ($1, (select coalesce(max(version), 0) + 1 from commission_policy_versions), 500, 8100, 1000, 0, 400)`,
      [tid("cpv")]
    );
  }
});
beforeEach(() => {
  rp.createRefundCalls = 0;
  rp.failNextRefund = false;
});

const secret = process.env.RAZORPAY_WEBHOOK_SECRET!;
const address = { name: "Asha Rao", phone: "9876543210", line1: "12 MG Road", city: "Jaipur", state: "Rajasthan", pincode: "302001" };

async function artist(pricePaise = 500_000) {
  const user = await makeUser();
  await makeProfile(user.id, { published: true });
  const art = await makeArtwork(user.id, { pricePaise });
  return { user, art };
}

function capturedEvent(o: { id: string; providerOrderId: string; amount: number }, paymentId: string, orderId?: string) {
  return JSON.stringify({
    event: "payment.captured",
    created_at: Math.floor(Date.now() / 1000),
    payload: { payment: { entity: { id: paymentId, order_id: o.providerOrderId, amount: o.amount, currency: "INR", notes: orderId ? { orderId } : {} } } },
  });
}

function deliver(body: string, eventId: string) {
  return webhook(
    new Request("http://x/api/physical-wall/razorpay/webhook", {
      method: "POST",
      body,
      headers: { "x-razorpay-signature": createHmac("sha256", secret).update(body).digest("hex"), "x-razorpay-event-id": eventId },
    })
  );
}

async function startCheckout(buyer: TestUser, artworkIds: string[], key = tid("key")) {
  actAs(buyer);
  for (const id of artworkIds) {
    const r = await addToCart({ artworkId: id });
    expect(r.ok, JSON.stringify(r)).toBe(true);
  }
  const r = await placeCheckout({ address, idempotencyKey: key });
  if (!r.ok) throw new Error(`placeCheckout failed: ${r.error}`);
  return { ...r.data, id: r.data.orderId, providerOrderId: r.data.providerOrderId!, amount: r.data.amountPaise };
}

async function pay(o: Awaited<ReturnType<typeof startCheckout>>, paymentId = tid("pay")) {
  const res = await deliver(capturedEvent(o, paymentId, o.id), tid("evt"));
  expect(res.status).toBe(200);
  return { paymentId, body: (await res.json()) as { status: string } };
}

const sellerOrders = (orderId: string) =>
  q<{ id: string; seller_id: string; status: string; total_paise: number; refunded_paise: number }>(
    `select id, seller_id, status, total_paise, refunded_paise from seller_orders where order_id = $1 order by seller_id`,
    [orderId]
  );
const artStatus = async (id: string) => (await q<{ status: string }>(`select status from artworks where id = $1`, [id]))[0].status;
const ledgerSum = async (holdId: string) =>
  Number(
    (
      await q<{ s: string }>(
        `select coalesce(sum(case when type = 'revenue' then amount_paise else -amount_paise end), 0)::text as s from pw_ledger where source_ref like $1`,
        [`escrow:${holdId}:%`]
      )
    )[0].s
  );

describe("cart", () => {
  it("adds, dedupes and removes; refuses own work, sold work and unpriced work", async () => {
    const a = await artist();
    const buyer = await makeUser();
    actAs(buyer);
    expect((await addToCart({ artworkId: a.art })).ok).toBe(true);
    expect((await addToCart({ artworkId: a.art })).ok).toBe(true);
    expect(await q(`select 1 from cart_items where user_id = $1`, [buyer.id])).toHaveLength(1);
    expect((await removeFromCart({ artworkId: a.art })).ok).toBe(true);
    expect(await q(`select 1 from cart_items where user_id = $1`, [buyer.id])).toHaveLength(0);

    actAs(a.user);
    expect(await addToCart({ artworkId: a.art })).toMatchObject({ ok: false, error: expect.stringContaining("your own work") });
    const unpriced = await makeArtwork(a.user.id, { pricePaise: null });
    actAs(buyer);
    expect(await addToCart({ artworkId: unpriced })).toMatchObject({ ok: false });
    await q(`update artworks set status = 'sold' where id = $1`, [a.art]);
    expect(await addToCart({ artworkId: a.art })).toMatchObject({ ok: false, error: expect.stringContaining("Sold") });
    expect(await addToCart({ artworkId: "" })).toMatchObject({ ok: false });
  });

  it("flags works that went stale while in the cart, blocks checkout, and removeUnavailable clears them", async () => {
    const a = await artist();
    const b = await artist(300_000);
    const buyer = await makeUser();
    actAs(buyer);
    await addToCart({ artworkId: a.art });
    await addToCart({ artworkId: b.art });
    await q(`update artworks set status = 'sold' where id = $1`, [a.art]); // someone else bought it
    const view = await loadCart(buyer.id);
    expect(view.hasIssues).toBe(true);
    expect(view.lines.find((l) => l.artworkId === a.art)?.issue).toBe("sold");
    // only the buyable work is priced
    expect(view.totals.subtotalPaise).toBe(300_000);

    const blocked = await placeCheckout({ address, idempotencyKey: tid("key") });
    expect(blocked).toMatchObject({ ok: false, error: expect.stringContaining("Remove them from your cart") });
    expect(await artStatus(b.art)).toBe("available"); // nothing was reserved by the failed attempt

    expect(await removeUnavailableFromCart({})).toEqual({ ok: true, data: { removed: 1 } });
    expect((await placeCheckout({ address, idempotencyKey: tid("key") })).ok).toBe(true);
  });

  it("buys a whole collection, crediting the curator only for a public curator collection", async () => {
    const a = await artist(200_000);
    const b = await artist(400_000);
    const curator = await makeUser();
    await q(`insert into curators (id, user_id, display_name, status) values ($1, $2, 'Cur', 'active')`, [tid("cur"), curator.id]);
    const colId = tid("col");
    await q(`insert into collections (id, owner_id, type, title, visibility, slug) values ($1, $2, 'CURATOR', 'Show', 'public', $1)`, [colId, curator.id]);
    await q(`insert into collection_artworks (collection_id, artwork_id, position) values ($1, $2, 0), ($1, $3, 1)`, [colId, a.art, b.art]);
    const privateCol = tid("col");
    await q(`insert into collections (id, owner_id, type, title, visibility, slug) values ($1, $2, 'BUYER', 'Mine', 'private', $1)`, [privateCol, curator.id]);

    const buyer = await makeUser();
    actAs(buyer);
    expect(await addCollectionToCart({ collectionId: privateCol })).toMatchObject({ ok: false }); // not theirs, private
    const r = await addCollectionToCart({ collectionId: colId });
    expect(r).toMatchObject({ ok: true, data: { added: 2 } });
    expect((await q<{ curator_user_id: string }>(`select curator_user_id from cart_items where user_id = $1`, [buyer.id])).every((c) => c.curator_user_id === curator.id)).toBe(true);

    const o = await startCheckout(buyer, []);
    const items = await q<{ curator_fee_paise: number; unit_price_paise: number }>(`select curator_fee_paise, unit_price_paise from order_items where order_id = $1`, [o.id]);
    expect(items).toHaveLength(2);
    for (const i of items) expect(i.curator_fee_paise).toBe(Math.round(i.unit_price_paise * 0.1)); // cpv_v1: curator 10%
  });
});

describe("multi-seller checkout and the shared webhook", () => {
  it("one Razorpay payment, one sub-order per seller, totals recomputed from the database", async () => {
    const a = await artist(500_000);
    const a2 = await makeArtwork(a.user.id, { pricePaise: 250_000 });
    const b = await artist(120_000);
    const buyer = await makeUser();
    const o = await startCheckout(buyer, [a.art, a2, b.art]);

    // 870_000 of works + 25_000 flat shipping for each of the 2 sellers.
    expect(o.amount).toBe(870_000 + 2 * 25_000);
    expect(rp.orders.find((r) => r.id === o.providerOrderId)?.amount).toBe(o.amount);
    const sos = await sellerOrders(o.id);
    expect(sos).toHaveLength(2);
    expect(sos.reduce((s, x) => s + x.total_paise, 0)).toBe(o.amount);
    for (const art of [a.art, a2, b.art]) expect(await artStatus(art)).toBe("reserved");
    expect(sos.every((s) => s.status === "pending_payment")).toBe(true);
  });

  it("the client cannot influence the amount: unknown input keys carry no money", async () => {
    const a = await artist(500_000);
    const buyer = await makeUser();
    actAs(buyer);
    await addToCart({ artworkId: a.art });
    const r = await placeCheckout({ address, idempotencyKey: tid("key"), amountPaise: 1, totalPaise: 1, items: [{ pricePaise: 1 }] });
    expect(r.ok && r.data.amountPaise).toBe(500_000 + 25_000);
  });

  it("a double submit with the same key returns the same order and one Razorpay order", async () => {
    const a = await artist();
    const buyer = await makeUser();
    const key = tid("key");
    const first = await startCheckout(buyer, [a.art], key);
    const before = rp.orders.length;
    const again = await placeCheckout({ address, idempotencyKey: key });
    expect(again.ok && again.data.orderId).toBe(first.id);
    expect(rp.orders.length).toBe(before);
  });

  it("capture settles every sub-order, holds escrow per seller, balances the ledger; redelivery is a no-op", async () => {
    const a = await artist(500_000);
    const b = await artist(120_000);
    const buyer = await makeUser();
    const o = await startCheckout(buyer, [a.art, b.art]);

    const paymentId = tid("pay");
    const body = capturedEvent(o, paymentId, o.id);
    const eventId = tid("evt");
    // concurrent redelivery of the same event + a sequential one + a different event id for the same payment
    const results = await Promise.all([deliver(body, eventId), deliver(body, eventId), deliver(body, tid("evt2"))]);
    for (const r of results) expect(r.status).toBe(200);
    expect((await deliver(body, eventId)).status).toBe(200);

    expect(await q(`select 1 from order_payments where order_id = $1 and status = 'captured'`, [o.id])).toHaveLength(1);
    expect((await q<{ status: string }>(`select status from orders where id = $1`, [o.id]))[0].status).toBe("paid");
    const sos = await sellerOrders(o.id);
    expect(sos.every((s) => s.status === "paid")).toBe(true);
    expect(await artStatus(a.art)).toBe("sold");
    expect(await artStatus(b.art)).toBe("sold");

    const holds = await q<{ id: string; seller_order_id: string; amount_paise: number; status: string }>(
      `select id, seller_order_id, amount_paise, status from escrow_holds where seller_order_id = any($1::text[])`,
      [sos.map((s) => s.id)]
    );
    expect(holds).toHaveLength(2);
    expect(holds.reduce((s, h) => s + h.amount_paise, 0)).toBe(o.amount);
    for (const h of holds) expect(await ledgerSum(h.id)).toBe(0);
    expect(await q(`select 1 from cart_items where user_id = $1`, [buyer.id])).toHaveLength(0);
    expect(await q(`select 1 from pw_notifications where user_id = $1 and kind = 'order.confirmed'`, [buyer.id])).toHaveLength(1);
  });

  it("the client fast path and the webhook together record one payment", async () => {
    const a = await artist();
    const buyer = await makeUser();
    const o = await startCheckout(buyer, [a.art]);
    const paymentId = tid("pay");
    rp.payments.set(paymentId, { id: paymentId, order_id: o.providerOrderId, amount: o.amount, status: "captured", currency: "INR" });
    const signature = createHmac("sha256", process.env.RAZORPAY_KEY_SECRET!).update(`${o.providerOrderId}|${paymentId}`).digest("hex");

    actAs(buyer);
    const forged = await verifyCheckoutPayment({ razorpay_order_id: o.providerOrderId, razorpay_payment_id: paymentId, razorpay_signature: "0".repeat(64) });
    expect(forged.ok).toBe(false);
    expect(await verifyCheckoutPayment({ razorpay_order_id: o.providerOrderId, razorpay_payment_id: paymentId, razorpay_signature: signature })).toEqual({
      ok: true,
      data: { status: "paid" },
    });
    expect((await deliver(capturedEvent(o, paymentId, o.id), tid("evt"))).status).toBe(200);
    expect(await q(`select 1 from order_payments where order_id = $1 and status = 'captured'`, [o.id])).toHaveLength(1);
    expect(await q(`select 1 from escrow_holds where seller_order_id in (select id from seller_orders where order_id = $1)`, [o.id])).toHaveLength(1);

    // another buyer cannot claim this payment
    const other = await makeUser();
    actAs(other);
    expect((await verifyCheckoutPayment({ razorpay_order_id: o.providerOrderId, razorpay_payment_id: paymentId, razorpay_signature: signature })).ok).toBe(false);
  });

  it("rejects a bad webhook signature and an unsigned body", async () => {
    const res = await webhook(new Request("http://x/api/physical-wall/razorpay/webhook", { method: "POST", body: "{}", headers: { "x-razorpay-signature": "bad" } }));
    expect(res.status).toBe(401);
  });

  it("an amount mismatch confirms nothing and refunds the whole payment", async () => {
    const a = await artist();
    const buyer = await makeUser();
    const o = await startCheckout(buyer, [a.art]);
    const paymentId = tid("pay");
    const res = await deliver(capturedEvent({ ...o, amount: o.amount - 100 }, paymentId, o.id), tid("evt"));
    expect(await res.json()).toMatchObject({ status: "refund-queued" });
    expect((await q<{ status: string }>(`select status from orders where id = $1`, [o.id]))[0].status).toBe("pending_payment");
    expect(rp.refunds.find((r) => r.payment_id === paymentId)?.amount).toBe(o.amount - 100);
    expect(await artStatus(a.art)).toBe("reserved");
  });

  it("a capture that arrives after the hold expired is refunded, never resold", async () => {
    const a = await artist();
    const buyer = await makeUser();
    const o = await startCheckout(buyer, [a.art]);
    await q(`update orders set expires_at = now() - interval '1 minute' where id = $1`, [o.id]);
    await runOrderSweep(); // lapses the hold, frees the work
    expect(await artStatus(a.art)).toBe("available");
    expect((await q<{ status: string }>(`select status from orders where id = $1`, [o.id]))[0].status).toBe("expired");

    const paymentId = tid("pay");
    const res = await deliver(capturedEvent(o, paymentId, o.id), tid("evt"));
    expect(await res.json()).toMatchObject({ status: "refund-queued" });
    expect(rp.refunds.find((r) => r.payment_id === paymentId)?.amount).toBe(o.amount);
    expect(await artStatus(a.art)).toBe("available");
  });

  it("only one of two concurrent buyers can reserve the same 1-of-1 work", async () => {
    const a = await artist();
    const b1 = await makeUser();
    const b2 = await makeUser();
    for (const b of [b1, b2]) {
      await q(`insert into cart_items (user_id, artwork_id) values ($1, $2)`, [b.id, a.art]);
    }
    // placeCheckout resolves the buyer from the (single, test-global) session, so drive the two
    // checkouts through the lower layer with distinct buyers, concurrently.
    const { createPendingOrder } = await import("@/features/orders/checkout");
    const { inTransaction } = await import("@/features/physical-wall/actions/shared");
    const attemptFor = (b: TestUser) =>
      inTransaction((c) => createPendingOrder(c, { id: b.id, email: b.email }, address as never, tid("key"))).then(
        () => "won",
        () => "lost"
      );
    const outcomes = await Promise.all([attemptFor(b1), attemptFor(b2)]);
    expect(outcomes.sort()).toEqual(["lost", "won"]);
    expect(await artStatus(a.art)).toBe("reserved");
    expect(await q(`select 1 from order_items where artwork_id = $1 and active`, [a.art])).toHaveLength(1);
  });

  it("buyer can back out of an unpaid checkout and the work returns to sale", async () => {
    const a = await artist();
    const buyer = await makeUser();
    const o = await startCheckout(buyer, [a.art]);
    actAs(buyer);
    expect(await cancelCheckout({ orderId: o.id })).toEqual({ ok: true, data: null });
    expect(await artStatus(a.art)).toBe("available");
    expect((await q<{ status: string }>(`select status from orders where id = $1`, [o.id]))[0].status).toBe("cancelled");
  });
});

describe("per-seller fulfilment, refunds, escrow release and payouts", () => {
  async function paidTwoSellers() {
    const a = await artist(500_000);
    const b = await artist(120_000);
    const buyer = await makeUser();
    const o = await startCheckout(buyer, [a.art, b.art]);
    await pay(o);
    const sos = await sellerOrders(o.id);
    return { a, b, buyer, o, soA: sos.find((s) => s.seller_id === a.user.id)!, soB: sos.find((s) => s.seller_id === b.user.id)! };
  }

  it("one seller declining refunds only their part; the other seller's order is untouched", async () => {
    const { a, b, o, soA, soB } = await paidTwoSellers();
    actAs(b.user);
    expect((await declineOrder({ sellerOrderId: soB.id, reason: "damaged in studio" })).ok).toBe(true);

    const after = await sellerOrders(o.id);
    expect(after.find((s) => s.id === soB.id)).toMatchObject({ status: "refunded", refunded_paise: soB.total_paise });
    expect(after.find((s) => s.id === soA.id)).toMatchObject({ status: "paid", refunded_paise: 0 });
    expect(await artStatus(b.art)).toBe("available"); // back on sale
    expect(await artStatus(a.art)).toBe("sold");
    // exactly B's total went back, against the single payment
    const payment = (await q<{ provider_payment_id: string }>(`select provider_payment_id from order_payments where order_id = $1 and status = 'captured'`, [o.id]))[0].provider_payment_id;
    expect(rp.refunds.filter((r) => r.payment_id === payment).map((r) => r.amount)).toEqual([soB.total_paise]);
    // B's hold is closed and its ledger still balances to zero
    const holdB = (await q<{ id: string; status: string }>(`select id, status from escrow_holds where seller_order_id = $1`, [soB.id]))[0];
    expect(holdB.status).toBe("refunded");
    expect(await ledgerSum(holdB.id)).toBe(0);

    // another seller cannot decline or accept A's order
    actAs(b.user);
    expect((await declineOrder({ sellerOrderId: soA.id })).ok).toBe(false);
    expect((await acceptOrder({ sellerOrderId: soA.id })).ok).toBe(false);
  });

  it("buyer can cancel only until the artist accepts", async () => {
    const { a, buyer, soA } = await paidTwoSellers();
    actAs(a.user);
    expect((await acceptOrder({ sellerOrderId: soA.id })).ok).toBe(true);
    actAs(buyer);
    expect(await cancelOrder({ sellerOrderId: soA.id })).toMatchObject({ ok: false, error: expect.stringContaining("already been accepted") });
  });

  it("accept -> ship -> buyer confirms -> escrow releases to platform / artist, payouts created, ledger balances", async () => {
    const { a, buyer, soA } = await paidTwoSellers();
    actAs(a.user);
    expect((await acceptOrder({ sellerOrderId: soA.id })).ok).toBe(true);
    expect((await markShipped({ sellerOrderId: soA.id, courier: "Delhivery", awb: "DL123456", trackingUrl: "" })).ok).toBe(true);
    // not yet releasable
    expect((await q<{ status: string }>(`select status from seller_orders where id = $1`, [soA.id]))[0].status).toBe("shipped");

    actAs(buyer);
    expect((await confirmDelivery({ sellerOrderId: soA.id })).ok).toBe(true);
    const so = (await q<{ status: string; platform_fee_paise: number; seller_net_paise: number; shipping_paise: number }>(
      `select status, platform_fee_paise, seller_net_paise, shipping_paise from seller_orders where id = $1`,
      [soA.id]
    ))[0];
    expect(so.status).toBe("completed");

    const hold = (await q<{ id: string; status: string }>(`select id, status from escrow_holds where seller_order_id = $1`, [soA.id]))[0];
    expect(hold.status).toBe("released");
    expect(await ledgerSum(hold.id)).toBe(0);
    const releases = await q<{ released_to: string; amount_paise: number }>(`select released_to, amount_paise from escrow_releases where escrow_hold_id = $1`, [hold.id]);
    expect(releases.reduce((s, r) => s + r.amount_paise, 0)).toBe(soA.total_paise);
    expect(releases.find((r) => r.released_to === "platform")?.amount_paise).toBe(so.platform_fee_paise);
    expect(releases.find((r) => r.released_to === a.user.id)?.amount_paise).toBe(so.seller_net_paise + so.shipping_paise);

    const payouts = await q<{ id: string; payee_user_id: string; amount_paise: number; status: string }>(`select id, payee_user_id, amount_paise, status from payouts where seller_order_id = $1`, [soA.id]);
    expect(payouts).toEqual([expect.objectContaining({ payee_user_id: a.user.id, amount_paise: so.seller_net_paise + so.shipping_paise, status: "owed" })]);

    // Finance marks it paid only for a verified payee
    const finance = await makeUser("admin");
    await grantTestAdminRole(finance.id, "finance_admin");
    actAs(finance);
    expect(await markPayoutPaid({ payoutId: payouts[0].id, utr: "UTR123456789" })).toMatchObject({ ok: false, error: expect.stringContaining("identity") });
    await q(`update "user" set identity_verified = true where id = $1`, [a.user.id]);
    expect((await markPayoutPaid({ payoutId: payouts[0].id, utr: "UTR123456789" })).ok).toBe(true);
    expect((await markPayoutPaid({ payoutId: payouts[0].id, utr: "UTR123456789" })).ok).toBe(false); // not twice
    expect((await q<{ status: string; utr: string }>(`select status, utr from payouts where id = $1`, [payouts[0].id]))[0]).toEqual({ status: "paid", utr: "UTR123456789" });

    // a released order cannot be refunded as if the money were still held
    expect(await adminRefundOrder({ sellerOrderId: soA.id, reason: "late complaint" })).toMatchObject({ ok: false, error: expect.stringContaining("already been released") });
  });

  it("courier-confirmed delivery starts the dispute window; release waits for it, then the sweep releases", async () => {
    const { a, soA } = await paidTwoSellers();
    actAs(a.user);
    await acceptOrder({ sellerOrderId: soA.id });
    await markShipped({ sellerOrderId: soA.id, courier: "DTDC", awb: "DTDC001", trackingUrl: "https://track.example/D1" });
    const finance = await makeUser("admin");
    await grantTestAdminRole(finance.id, "finance_admin");
    actAs(finance);
    expect((await adminMarkDelivered({ sellerOrderId: soA.id })).ok).toBe(true);
    let sweep = await runOrderSweep();
    expect(sweep.released).toBeGreaterThanOrEqual(0);
    expect((await q<{ status: string }>(`select status from seller_orders where id = $1`, [soA.id]))[0].status).toBe("delivered"); // window still open

    await q(`update seller_orders set release_eligible_at = now() - interval '1 minute' where id = $1`, [soA.id]);
    sweep = await runOrderSweep();
    expect(sweep.released).toBeGreaterThanOrEqual(1);
    expect((await q<{ status: string }>(`select status from seller_orders where id = $1`, [soA.id]))[0].status).toBe("completed");
  });

  it("a partial refund before release shrinks the hold, reverses commission pro-rata, and the release still balances", async () => {
    const { a, buyer, o, soA } = await paidTwoSellers();
    actAs(a.user);
    await acceptOrder({ sellerOrderId: soA.id });
    await markShipped({ sellerOrderId: soA.id, courier: "DTDC", awb: "DTDC002", trackingUrl: "" });
    const finance = await makeUser("admin");
    await grantTestAdminRole(finance.id, "finance_admin");
    actAs(finance);

    const refundAmount = Math.floor(soA.total_paise / 2);
    expect(await adminRefundOrder({ sellerOrderId: soA.id, amountPaise: refundAmount, reason: "scratched frame, goodwill" })).toEqual({ ok: true, data: { full: false } });
    expect(await adminRefundOrder({ sellerOrderId: soA.id, amountPaise: soA.total_paise, reason: "too much" })).toMatchObject({ ok: false });
    const mid = (await sellerOrders(o.id)).find((s) => s.id === soA.id)!;
    expect(mid).toMatchObject({ status: "shipped", refunded_paise: refundAmount });
    expect(rp.refunds.some((r) => r.amount === refundAmount)).toBe(true);

    actAs(buyer);
    await confirmDelivery({ sellerOrderId: soA.id });
    const hold = (await q<{ id: string; status: string }>(`select id, status from escrow_holds where seller_order_id = $1`, [soA.id]))[0];
    expect(hold.status).toBe("released");
    expect(await ledgerSum(hold.id)).toBe(0);
    const rel = await q<{ released_to: string; amount_paise: number }>(`select released_to, amount_paise from escrow_releases where escrow_hold_id = $1`, [hold.id]);
    expect(rel.reduce((s, r) => s + r.amount_paise, 0)).toBe(soA.total_paise); // refund + release = hold, never more
    expect(rel.find((r) => r.released_to === "refund")?.amount_paise).toBe(refundAmount);
    const remaining = soA.total_paise - refundAmount;
    const platform = rel.find((r) => r.released_to === "platform")!.amount_paise;
    const artistShare = rel.find((r) => r.released_to === a.user.id)!.amount_paise;
    expect(platform + artistShare).toBe(remaining);
  });

  it("an artist who never accepts is timed out: the buyer is refunded and the work goes back on sale", async () => {
    const { a, o, soA } = await paidTwoSellers();
    await q(`update seller_orders set accept_by = now() - interval '1 minute' where id = $1`, [soA.id]);
    const sweep = await runOrderSweep();
    expect(sweep.timedOut).toBeGreaterThanOrEqual(1);
    expect((await sellerOrders(o.id)).find((s) => s.id === soA.id)?.status).toBe("refunded");
    expect(await artStatus(a.art)).toBe("available");
  });

  it("refund crash recovery: Razorpay accepted but we never recorded it -> the retry finds it and does not refund twice", async () => {
    const { b, soB } = await paidTwoSellers();
    rp.failNextRefund = true; // createRefund records the refund at Razorpay, then throws
    actAs(b.user);
    await declineOrder({ sellerOrderId: soB.id });
    const row = (await q<{ id: string; status: string; attempts: number }>(`select id, status, attempts from order_refunds where seller_order_id = $1`, [soB.id]))[0];
    expect(row.status).toBe("failed");
    const callsBefore = rp.createRefundCalls;
    expect(await processOrderRefund(row.id)).toBe("processed");
    expect(rp.createRefundCalls).toBe(callsBefore); // findRefund hit; no second refund created
    expect((await q<{ status: string }>(`select status from seller_orders where id = $1`, [soB.id]))[0].status).toBe("refunded");
    expect(await processOpenOrderRefunds()).toMatchObject({ failed: 0 });
  });
});

describe("database guards", () => {
  it("an escrow hold must belong to exactly one of a booking or a sub-order", async () => {
    await expect(q(`insert into escrow_holds (id, amount_paise) values ($1, 100)`, [tid("esc")])).rejects.toThrow(/escrow_holds_one_target/);
  });

  it("the release cap trigger still applies to sub-order holds", async () => {
    const a = await artist();
    const buyer = await makeUser();
    const o = await startCheckout(buyer, [a.art]);
    await pay(o);
    const so = (await sellerOrders(o.id))[0];
    const hold = (await q<{ id: string; amount_paise: number }>(`select id, amount_paise from escrow_holds where seller_order_id = $1`, [so.id]))[0];
    await expect(
      q(`insert into escrow_releases (id, escrow_hold_id, amount_paise, released_to) values ($1, $2, $3, 'x')`, [tid("escr"), hold.id, hold.amount_paise + 1])
    ).rejects.toThrow(/exceed/);
  });

  it("two active order lines for one artwork are impossible", async () => {
    const a = await artist();
    const buyer = await makeUser();
    await startCheckout(buyer, [a.art]);
    const item = (await q<{ order_id: string; seller_order_id: string }>(`select order_id, seller_order_id from order_items where artwork_id = $1`, [a.art]))[0];
    await expect(
      q(
        `insert into order_items (id, order_id, seller_order_id, artwork_id, seller_id, title_snapshot, unit_price_paise, platform_fee_paise, seller_net_paise)
         values ($1, $2, $3, $4, $5, 't', 100, 5, 95)`,
        [tid("oit"), item.order_id, item.seller_order_id, a.art, a.user.id]
      )
    ).rejects.toThrow(/order_items_one_active_per_artwork/);
  });

  it("order and sub-order money invariants are enforced by CHECK constraints", async () => {
    await expect(
      q(
        `insert into orders (id, order_number, buyer_id, buyer_email, buyer_phone, subtotal_paise, shipping_paise, total_paise, shipping_address, expires_at)
         values ($1, $1, 'x', 'x@example.test', '1', 100, 10, 999, '{}', now())`,
        [tid("ord")]
      )
    ).rejects.toThrow(/orders_total_sum/);
  });
});
