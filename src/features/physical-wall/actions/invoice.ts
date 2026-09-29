"use server";

import { z } from "zod";

import { recordAuditIn } from "@/features/physical-wall/audit";
import { getActor, hasRole, requireRole } from "@/features/physical-wall/authorize";
import { formatINR } from "@/features/physical-wall/money";
import {
  fiscalYear,
  GST_STATES,
  GstinError,
  invoiceAmounts,
  normaliseCustomerGstin,
  supplierStateCode,
  venuePlaceOfSupply,
} from "@/features/physical-wall/gst";
import { allocateInvoiceNumber } from "@/features/physical-wall/invoice-number";
import {
  type ActionState,
  fail,
  firstIssue,
  inTransaction,
  newId,
  ok,
  parseInput,
  PreconditionError,
  readSafely,
  toActionError,
} from "@/features/physical-wall/actions/shared";
import { getSql } from "@/lib/db";

const HSN_WALL_RENTAL = "997212";

/** Today in IST as YYYY-MM-DD — invoices are dated in India, not in UTC. */
function istDate(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date());
}

const generateInvoiceSchema = z.object({
  bookingId: z.string({ error: "Which booking?" }).trim().min(1, "Which booking?").max(64),
  customerGstin: z.string().trim().max(20, "That GSTIN is not valid.").optional(),
});

/**
 * Issue a GST tax invoice for a paid booking. Admin only.
 *
 * Form fields: bookingId (required); customerGstin (optional, B2B — printed
 * on the invoice for the artist's input tax credit). Place of supply is always
 * the venue's state (IGST Act s.12(3)(a), see gst.ts), so CGST + SGST.
 *
 * Amounts come from pw_bookings.total_amount_paise / gst_amount_paise, which
 * were fixed server-side when the booking was quoted. The number comes from
 * pw_invoice_counters (0028), incremented inside this transaction: the counter
 * row lock serialises concurrent generations and a rollback hands the number
 * back, so numbering is sequential and gap-free per financial year.
 */
export async function generateInvoice(
  _previous: ActionState,
  formData: FormData
): Promise<ActionState> {
  try {
    const parsed = generateInvoiceSchema.safeParse({
      bookingId: formData.get("bookingId") ?? "",
      customerGstin: formData.get("customerGstin") || undefined,
    });
    if (!parsed.success) return fail(firstIssue(parsed.error));
    const actor = await requireRole("admin");
    const { bookingId } = parsed.data;
    const customerGstin = normaliseCustomerGstin(parsed.data.customerGstin);

    const result = await inTransaction(async (client) => {
      // Two admins invoicing one booking: the second waits here, then sees the first's row.
      await client.query(`select 1 from pw_bookings where id = $1 for update`, [bookingId]);

      const existing = await client.query(`select 1 from pw_invoices where booking_id = $1`, [bookingId]);
      if (existing.rowCount) throw new PreconditionError("An invoice already exists for this booking.");

      const { rows } = await client.query<{ total_amount_paise: number; gst_amount_paise: number }>(
        `select total_amount_paise, gst_amount_paise from pw_bookings
         where id = $1 and status in ('paid', 'completed')`,
        [bookingId]
      );
      const booking = rows[0];
      if (!booking) throw new PreconditionError("No paid booking found with that id.");

      const supplierState = supplierStateCode();
      const placeOfSupply = venuePlaceOfSupply();
      const { netPaise, totalPaise, cgstPaise, sgstPaise, igstPaise } = invoiceAmounts(
        Number(booking.total_amount_paise),
        Number(booking.gst_amount_paise),
        supplierState,
        placeOfSupply
      );

      const issueDate = istDate();
      const number = await allocateInvoiceNumber(client, fiscalYear(issueDate));

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
    if (error instanceof GstinError) return fail(error.message);
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
  return readSafely("getInvoice", null, () => loadInvoice(parseInput(z.string().min(1).max(64), invoiceId)));
}

async function loadInvoice(invoiceId: string): Promise<InvoiceRow | null> {
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
