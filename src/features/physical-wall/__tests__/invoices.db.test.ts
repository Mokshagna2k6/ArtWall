import { afterAll, describe, expect, it, vi } from "vitest";

import { actAs } from "@/test/db-setup";
import { makeBooking, makeSlots, makeUser, purgeTestData, q } from "@/test/fixtures";

vi.mock("@/features/physical-wall/razorpay", async (orig) => ({
  ...(await orig<object>()),
  createRefund: vi.fn(async (paymentId: string, amount: number) => ({ id: `rfnd_${Date.now()}`, payment_id: paymentId, amount })),
  findRefund: vi.fn(async () => null),
}));

import { cancelBooking } from "@/features/physical-wall/actions/booking";
import { generateInvoice } from "@/features/physical-wall/actions/invoice";
import { settleFromWebhook } from "@/features/physical-wall/actions/payment";
import { getRevenueReport } from "@/features/physical-wall/data/ledger";

afterAll(purgeTestData);

function invoiceForm(bookingId: string, gstin?: string) {
  const f = new FormData();
  f.set("bookingId", bookingId);
  if (gstin) f.set("customerGstin", gstin);
  return f;
}

async function paid(artistId: string, totalPaise = 11801) {
  const bk = await makeBooking(artistId, await makeSlots(1), { totalPaise, orderId: `betest_order_${Date.now()}` });
  const paymentId = `betest_pay_${Date.now()}_${Math.random()}`;
  await settleFromWebhook({ bookingId: bk, eventId: paymentId, paymentId, orderId: null, amountPaise: totalPaise });
  return bk;
}

type Inv = { number: string; net_paise: number; cgst_paise: number; sgst_paise: number; igst_paise: number; total_paise: number; place_of_supply: string; gstin_customer: string | null };

describe("GST invoices (BE-1.06 / 1.07)", () => {
  it("paid booking → intra-state CGST+SGST at the venue, odd paisa split, sequential number", async () => {
    const admin = await makeUser("admin");
    const artist = await makeUser();
    const bk = await paid(artist.id);
    actAs(admin);
    const r = await generateInvoice({ status: "idle" } as never, invoiceForm(bk));
    expect(r.status).toBe("ok");
    const [inv] = await q<Inv>(`select * from pw_invoices where booking_id = $1`, [bk]);
    const [b] = await q<{ gst_amount_paise: number }>(`select gst_amount_paise from pw_bookings where id = $1`, [bk]);
    expect(inv.total_paise).toBe(11801);
    expect(inv.cgst_paise + inv.sgst_paise).toBe(b.gst_amount_paise);
    expect(Math.abs(inv.cgst_paise - inv.sgst_paise)).toBeLessThanOrEqual(1);
    expect(inv.igst_paise).toBe(0);
    expect(inv.net_paise + inv.cgst_paise + inv.sgst_paise).toBe(inv.total_paise);
    expect(inv.place_of_supply).toBe("08-Rajasthan");
    expect(inv.number).toMatch(/^AW\/\d{4}-\d{2}\/\d{4}$/);

    // Second invoice for the same booking is refused.
    expect((await generateInvoice({ status: "idle" } as never, invoiceForm(bk))).status).toBe("error");
  });

  it("an out-of-state B2B GSTIN is printed but does not switch to IGST (s.12(3))", async () => {
    const admin = await makeUser("admin");
    const bk = await paid((await makeUser()).id);
    actAs(admin);
    expect((await generateInvoice({ status: "idle" } as never, invoiceForm(bk, "27AAPFU0939F1ZV"))).status).toBe("ok");
    const [inv] = await q<Inv>(`select * from pw_invoices where booking_id = $1`, [bk]);
    expect(inv.gstin_customer).toBe("27AAPFU0939F1ZV");
    expect(inv.igst_paise).toBe(0);
    expect(inv.cgst_paise).toBeGreaterThan(0);
  });

  it("rejects a malformed GSTIN, a non-admin, and a refunded booking", async () => {
    const admin = await makeUser("admin");
    const artist = await makeUser();
    const bk = await paid(artist.id);
    actAs(admin);
    expect((await generateInvoice({ status: "idle" } as never, invoiceForm(bk, "NOTAGSTIN"))).status).toBe("error");
    actAs(artist);
    expect((await generateInvoice({ status: "idle" } as never, invoiceForm(bk))).status).toBe("error");
    const f = new FormData();
    f.set("bookingId", bk);
    expect((await cancelBooking({ status: "idle" } as never, f)).status).toBe("ok");
    actAs(admin);
    expect((await generateInvoice({ status: "idle" } as never, invoiceForm(bk))).status).toBe("error");
  });
});

describe("revenue report (BE-1.08 / 1.09)", () => {
  it("gross, refunds and net move by exactly what was paid and refunded", async () => {
    const before = await getRevenueReport("month");
    const artist = await makeUser();
    await paid(artist.id, 20000);
    const refunded = await paid(artist.id, 10000);
    actAs(artist);
    const f = new FormData();
    f.set("bookingId", refunded);
    await cancelBooking({ status: "idle" } as never, f); // 50% policy → 5000 refund

    const after = await getRevenueReport("month");
    expect(after.totals.grossPaise - before.totals.grossPaise).toBe(30000);
    expect(after.totals.refundPaise - before.totals.refundPaise).toBe(5000);
    expect(after.totals.netPaise - before.totals.netPaise).toBe(25000);
    expect(after.totals.bookings - before.totals.bookings).toBe(2);
    expect(after.unreconciled.count).toBe(before.unreconciled.count);
    expect(after.awaitingInvoice.count - before.awaitingInvoice.count).toBe(1); // the refunded one isn't awaiting
  });
});
