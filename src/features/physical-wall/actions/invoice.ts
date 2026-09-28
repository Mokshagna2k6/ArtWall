"use server";

import { recordAuditIn } from "@/features/physical-wall/audit";
import { getActor, hasRole, requireRole } from "@/features/physical-wall/authorize";
import { formatINR } from "@/features/physical-wall/money";
import {
  GST_STATES,
  PlaceOfSupplyError,
  resolvePlaceOfSupply,
  splitGst,
  supplierStateCode,
} from "@/features/physical-wall/gst";
import {
  fail,
  inTransaction,
  newId,
  ok,
  PreconditionError,
  toActionError,
  type ActionState,
} from "@/features/physical-wall/actions/shared";
import { getSql } from "@/lib/db";

const HSN_WALL_RENTAL = "997212";

/** Today in IST as YYYY-MM-DD — invoices are dated in India, not in UTC. */
function istDate(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date());
}

/** Indian fiscal year (April–March) of an IST date, e.g. "2026-27". */
function fiscalYear(isoDate: string): string {
  const [y, m] = isoDate.split("-").map(Number);
  const year = m >= 4 ? y : y - 1;
  return `${year}-${String(year + 1).slice(2)}`;
}

/**
 * Issue a GST tax invoice for a paid booking. Admin only.
 *
 * Form fields: bookingId (required); placeOfSupply (optional: 2-digit GST
 * state code or state name — needed when the artist's location names no
 * state); customerGstin (optional, B2B — decides the place of supply).
 *
 * Amounts come from pw_bookings.total_amount_paise / gst_amount_paise, which
 * were fixed server-side when the booking was quoted. One transaction with an
 * advisory lock: sequential invoice numbers are a legal requirement, and two
 * concurrent generations must not both read the same count.
 */
export async function generateInvoice(
  _previous: ActionState,
  formData: FormData
): Promise<ActionState> {
  try {
    const actor = await requireRole("admin");
    const bookingId = String(formData.get("bookingId") ?? "");
    const explicitState = String(formData.get("placeOfSupply") ?? "").trim() || null;
    const customerGstin = String(formData.get("customerGstin") ?? "").trim().toUpperCase() || null;
    if (!bookingId) return fail("Which booking?");

    const result = await inTransaction(async (client) => {
      await client.query(`select pg_advisory_xact_lock(hashtext('pw_invoices.number'))`);

      const existing = await client.query(`select 1 from pw_invoices where booking_id = $1`, [bookingId]);
      if (existing.rowCount) throw new PreconditionError("An invoice already exists for this booking.");

      const { rows } = await client.query<{
        total_amount_paise: number;
        gst_amount_paise: number;
        artist_location: string | null;
      }>(
        `select b.total_amount_paise, b.gst_amount_paise, ap.location as artist_location
         from pw_bookings b
         left join artist_profiles ap on ap."userId" = b.artist_id
         where b.id = $1 and b.status in ('paid', 'completed')`,
        [bookingId]
      );
      const booking = rows[0];
      if (!booking) throw new PreconditionError("No paid booking found with that id.");

      const totalPaise = Number(booking.total_amount_paise);
      const gstPaise = Number(booking.gst_amount_paise);
      const netPaise = totalPaise - gstPaise;
      if (netPaise < 0 || gstPaise < 0) throw new Error(`Booking ${bookingId} has inconsistent amounts`);

      const supplierState = supplierStateCode();
      const placeOfSupply = resolvePlaceOfSupply({
        supplierState,
        customerGstin,
        explicitState,
        profileLocation: booking.artist_location,
      });
      const { cgstPaise, sgstPaise, igstPaise } = splitGst(gstPaise, supplierState, placeOfSupply);

      const issueDate = istDate();
      const fy = fiscalYear(issueDate);
      const count = await client.query<{ n: number }>(
        `select count(*)::int as n from pw_invoices where number like $1`,
        [`AW/${fy}/%`]
      );
      const number = `AW/${fy}/${String((count.rows[0]?.n ?? 0) + 1).padStart(4, "0")}`;

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
      await client.query(
        `insert into pw_invoices
           (id, booking_id, number, issue_date, place_of_supply, hsn_sac, gstin_supplier,
            gstin_customer, net_paise, cgst_paise, sgst_paise, igst_paise, total_paise,
            line_items, created_by)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14::jsonb, $15)`,
        [
          id,
          bookingId,
          number,
          issueDate,
          `${placeOfSupply}-${GST_STATES[placeOfSupply]}`,
          HSN_WALL_RENTAL,
          process.env.ARTWALL_GSTIN ?? "NOT_REGISTERED",
          customerGstin,
          netPaise,
          cgstPaise,
          sgstPaise,
          igstPaise,
          totalPaise,
          JSON.stringify(lineItems),
          actor.id,
        ]
      );

      await recordAuditIn(client, {
        actor,
        action: "invoice.generated",
        subjectType: "invoice",
        subjectId: id,
        after: { number, bookingId, totalPaise, placeOfSupply, cgstPaise, sgstPaise, igstPaise },
      });

      return { id, number, totalPaise };
    });

    return ok(`Invoice ${result.number} generated — ${formatINR(result.totalPaise)}.`, result);
  } catch (error) {
    if (error instanceof PlaceOfSupplyError) return fail(error.message);
    return toActionError("generateInvoice", error);
  }
}

export interface InvoiceRow {
  id: string;
  booking_id: string;
  number: string;
  issue_date: string;
  place_of_supply: string;
  hsn_sac: string;
  gstin_supplier: string;
  gstin_customer: string | null;
  net_paise: number;
  cgst_paise: number;
  sgst_paise: number;
  igst_paise: number;
  total_paise: number;
  line_items: unknown;
  status: string;
  artist_id: string;
  artist_name: string;
  artist_email: string;
}

/**
 * An invoice, for the person entitled to see it: the artist it was issued to,
 * or staff/admin. Anyone else — including signed-out callers — gets null, the
 * same answer as "no such invoice", so ids cannot be probed.
 */
export async function getInvoice(invoiceId: string): Promise<InvoiceRow | null> {
  const actor = await getActor();
  if (!actor) return null;

  const sql = getSql();
  const rows = (await sql`
    select i.*, b.artist_id, u.name as artist_name, u.email as artist_email
    from pw_invoices i
    join pw_bookings b on b.id = i.booking_id
    join "user" u on u.id = b.artist_id
    where i.id = ${invoiceId}
    limit 1
  `) as InvoiceRow[];
  const invoice = rows[0];
  if (!invoice) return null;
  if (invoice.artist_id !== actor.id && !hasRole(actor, "staff")) return null;
  return invoice;
}
