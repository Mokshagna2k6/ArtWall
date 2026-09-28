"use server";

import { recordAudit } from "@/features/physical-wall/audit";
import { requireRole } from "@/features/physical-wall/authorize";
import { formatINR } from "@/features/physical-wall/money";
import {
  fail,
  newId,
  ok,
  toActionError,
  type ActionState,
} from "@/features/physical-wall/actions/shared";
import { getSql } from "@/lib/db";

const HSN_WALL_RENTAL = "997212";
const GSTIN_SUPPLIER = process.env.ARTWALL_GSTIN ?? "NOT_REGISTERED";

function nextInvoiceNumber(count: number): string {
  const fy = fiscalYear();
  return `AW/${fy}/${String(count + 1).padStart(4, "0")}`;
}

function fiscalYear(): string {
  const now = new Date();
  const year = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
  return `${year}-${String(year + 1).slice(2)}`;
}

export async function generateInvoice(
  _previous: ActionState,
  formData: FormData
): Promise<ActionState> {
  try {
    const actor = await requireRole("admin");
    const bookingId = String(formData.get("bookingId") ?? "");
    if (!bookingId) return fail("Which booking?");

    const sql = getSql();

    const existing = (await sql`
      select id from pw_invoices where booking_id = ${bookingId} limit 1
    `) as { id: string }[];
    if (existing.length > 0) return fail("An invoice already exists for this booking.");

    const bookings = (await sql`
      select b.id, b.total_amount_paise, b.gst_amount_paise, b.artist_id,
             u.name as artist_name, ap.location as artist_city
      from pw_bookings b
      join "user" u on u.id = b.artist_id
      left join artist_profiles ap on ap."userId" = b.artist_id
      where b.id = ${bookingId} and b.status in ('paid', 'completed')
      limit 1
    `) as {
      id: string;
      total_amount_paise: number;
      gst_amount_paise: number;
      artist_name: string;
      artist_city: string | null;
    }[];

    if (bookings.length === 0) return fail("No paid booking found with that id.");

    const booking = bookings[0];
    const totalPaise = booking.total_amount_paise;
    const gstPaise = booking.gst_amount_paise;
    const netPaise = totalPaise - gstPaise;
    const isIntraState = (booking.artist_city ?? "").toLowerCase().includes("rajasthan");
    // Intra-state: CGST + SGST. Inter-state: IGST. Never both (DB CHECK, 0016).
    const cgstPaise = isIntraState ? Math.round(gstPaise / 2) : 0;
    const sgstPaise = isIntraState ? gstPaise - cgstPaise : 0;
    const igstPaise = isIntraState ? 0 : gstPaise;

    const countRows = (await sql`
      select count(*)::int as n from pw_invoices
      where number like ${"AW/" + fiscalYear() + "/%"}
    `) as { n: number }[];
    const invoiceNumber = nextInvoiceNumber(countRows[0]?.n ?? 0);

    const lineItems = [
      {
        description: "Wall slot rental",
        hsn: HSN_WALL_RENTAL,
        net_paise: netPaise,
        cgst_paise: cgstPaise,
        sgst_paise: sgstPaise,
        igst_paise: igstPaise,
        total_paise: totalPaise,
      },
    ];

    const id = newId("inv");
    await sql`
      insert into pw_invoices
        (id, booking_id, number, issue_date, place_of_supply, hsn_sac,
         gstin_supplier, net_paise, cgst_paise, sgst_paise, igst_paise, total_paise,
         line_items, created_by)
      values (
        ${id}, ${bookingId}, ${invoiceNumber}, ${new Date().toISOString().slice(0, 10)},
        ${isIntraState ? "Rajasthan" : booking.artist_city ?? "Other"},
        ${HSN_WALL_RENTAL}, ${GSTIN_SUPPLIER},
        ${netPaise}, ${cgstPaise}, ${sgstPaise}, ${igstPaise}, ${totalPaise},
        ${JSON.stringify(lineItems)}::jsonb, ${actor.id}
      )
    `;

    await recordAudit({
      actor,
      action: "invoice.generated",
      subjectType: "invoice",
      subjectId: id,
      after: { number: invoiceNumber, totalPaise },
    });

    return ok(`Invoice ${invoiceNumber} generated — ${formatINR(totalPaise)}.`);
  } catch (error) {
    return toActionError("generateInvoice", error);
  }
}

export async function getInvoice(invoiceId: string) {
  const sql = getSql();
  const rows = (await sql`
    select i.*, u.name as artist_name, u.email as artist_email
    from pw_invoices i
    join pw_bookings b on b.id = i.booking_id
    join "user" u on u.id = b.artist_id
    where i.id = ${invoiceId}
    limit 1
  `) as Record<string, unknown>[];
  return rows[0] ?? null;
}
