import { afterAll, describe, expect, it, vi } from "vitest";

import { actAs } from "@/test/db-setup";
import { makeBooking, makeSlots, makeUser, purgeTestData, q, tid } from "@/test/fixtures";

vi.mock("@/features/physical-wall/razorpay", async (orig) => ({
  ...(await orig<object>()),
  createRefund: vi.fn(async (paymentId: string, amount: number) => ({ id: `rfnd_${crypto.randomUUID()}`, payment_id: paymentId, amount })),
  findRefund: vi.fn(async () => null),
}));

import { cancelBooking } from "@/features/physical-wall/actions/booking";
import { generateInvoice } from "@/features/physical-wall/actions/invoice";
import { inTransaction } from "@/features/physical-wall/actions/shared";
import { fiscalYear } from "@/features/physical-wall/gst";
import { allocateInvoiceNumber } from "@/features/physical-wall/invoice-number";
import { settleFromWebhook } from "@/features/physical-wall/settlement";

afterAll(purgeTestData);

function invoiceForm(bookingId: string, gstin?: string) {
  const f = new FormData();
  f.set("bookingId", bookingId);
  if (gstin) f.set("customerGstin", gstin);
  return f;
}

async function paid(artistId: string, totalPaise = 11801) {
  const bk = await makeBooking(artistId, await makeSlots(1), { totalPaise, orderId: tid("order") });
  const paymentId = tid("pay");
  await settleFromWebhook({ bookingId: bk, eventId: paymentId, paymentId, orderId: null, amountPaise: totalPaise });
  return bk;
}

type Inv = { number: string; net_paise: number; cgst_paise: number; sgst_paise: number; igst_paise: number; total_paise: number; place_of_supply: string; gstin_customer: string | null };

const seq = (number: string) => Number(number.split("/")[2]);
const istToday = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date());

describe("GST invoices (BE-1.06 / 1.07 / 2.04)", () => {
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
    expect(inv.number).toMatch(new RegExp(`^AW/${fiscalYear(istToday())}/\\d{4,}$`));

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

  it("an IGST invoice row satisfies the database's own split check", async () => {
    const bk = await paid((await makeUser()).id, 11800);
    // The DB constraint must accept the inter-state shape, and reject a bad split.
    const insert = (igst: number) =>
      q(
        `insert into pw_invoices (id, booking_id, number, issue_date, place_of_supply, hsn_sac, gstin_supplier,
           net_paise, cgst_paise, sgst_paise, igst_paise, total_paise, line_items)
         values ($1, $2, $1, current_date, '27-Maharashtra', '997212', 'X', 10000, 0, 0, $3, 11800, '[]')`,
        [tid("inv"), bk, igst]
      );
    await expect(insert(1799)).rejects.toThrow();
    await insert(1800);
  });

  it("rejects a malformed GSTIN, a non-admin, and a refunded booking", async () => {
    const admin = await makeUser("admin");
    const artist = await makeUser();
    const bk = await paid(artist.id);
    actAs(admin);
    expect((await generateInvoice({ status: "idle" } as never, invoiceForm(bk, "NOTAGSTIN"))).status).toBe("error");
    expect((await generateInvoice({ status: "idle" } as never, invoiceForm(""))).status).toBe("error");
    actAs(artist);
    expect((await generateInvoice({ status: "idle" } as never, invoiceForm(bk))).status).toBe("error");
    const f = new FormData();
    f.set("bookingId", bk);
    expect((await cancelBooking({ status: "idle" } as never, f)).status).toBe("ok");
    actAs(admin);
    expect((await generateInvoice({ status: "idle" } as never, invoiceForm(bk))).status).toBe("error");
  });
});

describe("invoice numbering: sequential, unique, gap-free (BE-2.04 / 2.05)", () => {
  it("six concurrent generations get six distinct numbers with no gap between them", async () => {
    const admin = await makeUser("admin");
    const artist = await makeUser();
    const bookings = await Promise.all(Array.from({ length: 6 }, () => paid(artist.id, 11800)));
    actAs(admin);
    const results = await Promise.all(bookings.map((bk) => generateInvoice({ status: "idle" } as never, invoiceForm(bk))));
    expect(results.map((r) => r.status)).toEqual(Array(6).fill("ok"));

    const mine = await q<{ number: string }>(`select number from pw_invoices where booking_id = any($1)`, [bookings]);
    const nums = mine.map((r) => seq(r.number)).sort((a, b) => a - b);
    expect(new Set(nums).size).toBe(6);
    // Every number between our lowest and highest exists: nothing was skipped.
    // (Anyone else invoicing concurrently fills the same range, never a hole.)
    const fy = fiscalYear(istToday());
    const window = await q<{ number: string }>(`select number from pw_invoices where number like $1`, [`AW/${fy}/%`]);
    const issued = new Set(window.map((r) => seq(r.number)));
    for (let n = nums[0]; n <= nums[5]; n++) expect(issued.has(n), `AW/${fy}/${n}`).toBe(true);
  });

  it("a rolled-back invoice transaction does not burn its number", async () => {
    const fy = "2091-92"; // a year no real invoice uses
    await q(`delete from pw_invoice_counters where fiscal_year = $1`, [fy]);
    try {
      expect(await inTransaction((c) => allocateInvoiceNumber(c, fy))).toBe(`AW/${fy}/0001`);
      await expect(
        inTransaction(async (c) => {
          expect(await allocateInvoiceNumber(c, fy)).toBe(`AW/${fy}/0002`);
          throw new Error("invoice insert failed");
        })
      ).rejects.toThrow("invoice insert failed");
      expect(await inTransaction((c) => allocateInvoiceNumber(c, fy))).toBe(`AW/${fy}/0002`);

      // And ten concurrent allocations are exactly 3..12.
      const got = await Promise.all(Array.from({ length: 10 }, () => inTransaction((c) => allocateInvoiceNumber(c, fy))));
      expect(got.map(seq).sort((a, b) => a - b)).toEqual([3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
    } finally {
      await q(`delete from pw_invoice_counters where fiscal_year = $1`, [fy]);
    }
  });
});
