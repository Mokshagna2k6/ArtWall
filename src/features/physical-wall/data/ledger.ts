import "server-only";

import type { LedgerEntry } from "@/features/physical-wall/types";
import { getSql } from "@/lib/db";

/**
 * The minimal revenue and expenditure ledger (F18, C07).
 *
 * Two lists and a monthly total. Not a P&L engine — the spec is explicit that
 * heavy accounting is deferred until volume justifies Tally or Zoho Books, and
 * building it here would be building the wrong thing well.
 */

export async function listLedgerEntries(
  month?: string
): Promise<LedgerEntry[]> {
  try {
    const sql = getSql();
    const rows = (await sql.query(
      `select id, type, category, amount_paise, note,
              entry_date::text as entry_date, source_ref
       from pw_ledger
       where ($1::text is null or to_char(entry_date, 'YYYY-MM') = $1::text)
       order by entry_date desc, created_at desc
       limit 500`,
      [month ?? null]
    )) as Record<string, unknown>[];

    return rows.map((row) => ({
      id: String(row.id),
      type: row.type as LedgerEntry["type"],
      category: String(row.category),
      amountPaise: Number(row.amount_paise),
      note: (row.note as string) ?? null,
      entryDate: String(row.entry_date),
      sourceRef: (row.source_ref as string) ?? null,
    }));
  } catch (error) {
    console.error("[physical-wall] Could not read ledger", error);
    return [];
  }
}

export interface LedgerSummary {
  month: string;
  revenuePaise: number;
  expensePaise: number;
  netPaise: number;
  byCategory: { type: string; category: string; amountPaise: number }[];
}

/**
 * A month's totals, grouped by category.
 *
 * Aggregated in Postgres rather than in JavaScript: the ledger is the one table
 * here that grows without bound, and summing a year of it into memory to
 * display twelve numbers would be the wrong shape from the first month.
 */
export async function getMonthlySummary(month: string): Promise<LedgerSummary> {
  const empty: LedgerSummary = {
    month,
    revenuePaise: 0,
    expensePaise: 0,
    netPaise: 0,
    byCategory: [],
  };

  try {
    const sql = getSql();
    const rows = (await sql`
      select type, category, sum(amount_paise)::bigint as amount
      from pw_ledger
      where to_char(entry_date, 'YYYY-MM') = ${month}
      group by type, category
      order by type asc, amount desc
    `) as Record<string, unknown>[];

    const byCategory = rows.map((row) => ({
      type: String(row.type),
      category: String(row.category),
      amountPaise: Number(row.amount),
    }));

    const revenuePaise = byCategory
      .filter((row) => row.type === "revenue")
      .reduce((sum, row) => sum + row.amountPaise, 0);
    const expensePaise = byCategory
      .filter((row) => row.type === "expense")
      .reduce((sum, row) => sum + row.amountPaise, 0);

    return {
      month,
      revenuePaise,
      expensePaise,
      netPaise: revenuePaise - expensePaise,
      byCategory,
    };
  } catch (error) {
    console.error("[physical-wall] Could not summarise ledger", error);
    return empty;
  }
}

export interface PerkSummary {
  redemptions: number;
  attributedBillPaise: number;
  discountGivenPaise: number;
  flagged: number;
}

/**
 * What the Platter partnership has actually driven (RP01).
 *
 * `attributedBillPaise` is the number the whole partnership argument rests on:
 * total restaurant spend traceable to the wall. Shared with Platter in
 * aggregate only — never per visitor, which is the data-sharing scope the
 * partnership agreement fixes.
 */
export async function getPerkSummary(month?: string): Promise<PerkSummary> {
  try {
    const sql = getSql();
    const rows = (await sql.query(
      `select count(*)::int as redemptions,
              coalesce(sum(bill_amount_paise), 0)::bigint as bill_total,
              coalesce(sum(discount_amount_paise), 0)::bigint as discount_total,
              count(*) filter (where flagged)::int as flagged
       from pw_perk_redemptions
       where ($1::text is null or to_char(redeemed_at, 'YYYY-MM') = $1::text)`,
      [month ?? null]
    )) as Record<string, unknown>[];

    const row = rows[0] ?? {};
    return {
      redemptions: Number(row.redemptions ?? 0),
      attributedBillPaise: Number(row.bill_total ?? 0),
      discountGivenPaise: Number(row.discount_total ?? 0),
      flagged: Number(row.flagged ?? 0),
    };
  } catch (error) {
    console.error("[physical-wall] Could not summarise perks", error);
    return {
      redemptions: 0,
      attributedBillPaise: 0,
      discountGivenPaise: 0,
      flagged: 0,
    };
  }
}

export interface RevenueRow {
  period: string;
  grossPaise: number;
  refundPaise: number;
  netPaise: number;
  bookings: number;
}

export interface RevenueReport {
  rows: RevenueRow[];
  totals: { grossPaise: number; refundPaise: number; netPaise: number; bookings: number };
  /** Paid/completed bookings with no GST invoice yet — the admin's to-do. */
  awaitingInvoice: { count: number; paise: number };
  /** Paid/completed bookings with no revenue ledger row. Should be 0; anything else is a bug. */
  unreconciled: { count: number; paise: number };
}

/**
 * Booking revenue by period, from pw_ledger joined on its real booking_id FK.
 *
 * Only the two real ledger types exist ('revenue', 'expense' — docs/db/ledger.md).
 * Gross = booking revenue rows; refunds = expense/refund rows for a booking;
 * dated by entry_date (the accounting date), not created_at. Manual founder
 * entries (booking_id null) are excluded: this is booking revenue, the ledger
 * page shows everything.
 *
 * There is no settlement signal in the schema (Razorpay payouts are not
 * recorded), so the old "pending settlement" card is replaced by two derived
 * figures that are real: bookings awaiting an invoice, and unreconciled ones.
 */
export async function getRevenueReport(range: "day" | "week" | "month"): Promise<RevenueReport> {
  const sql = getSql();

  const rows = (await sql.query(
    `select to_char(date_trunc($1, l.entry_date), 'YYYY-MM-DD') as period,
            coalesce(sum(l.amount_paise) filter (where l.type = 'revenue'), 0)::bigint as gross,
            coalesce(sum(l.amount_paise) filter (where l.type = 'expense' and l.category = 'refund'), 0)::bigint as refunds,
            count(distinct l.booking_id) filter (where l.type = 'revenue')::int as bookings
     from pw_ledger l
     join pw_bookings b on b.id = l.booking_id
     where l.type = 'revenue' or (l.type = 'expense' and l.category = 'refund')
     group by 1
     order by 1 desc
     limit 24`,
    [range]
  )) as { period: string; gross: string; refunds: string; bookings: number }[];

  const [open] = (await sql`
    select
      count(*) filter (where i.id is null)::int as awaiting_n,
      coalesce(sum(b.total_amount_paise) filter (where i.id is null), 0)::bigint as awaiting_paise,
      count(*) filter (where l.id is null)::int as unrec_n,
      coalesce(sum(b.total_amount_paise) filter (where l.id is null), 0)::bigint as unrec_paise
    from pw_bookings b
    left join pw_invoices i on i.booking_id = b.id
    left join pw_ledger l on l.booking_id = b.id and l.type = 'revenue'
    where b.status in ('paid', 'completed')
  `) as { awaiting_n: number; awaiting_paise: string; unrec_n: number; unrec_paise: string }[];

  const mapped = rows.map((r) => ({
    period: r.period,
    grossPaise: Number(r.gross),
    refundPaise: Number(r.refunds),
    netPaise: Number(r.gross) - Number(r.refunds),
    bookings: Number(r.bookings),
  }));

  return {
    rows: mapped,
    totals: mapped.reduce(
      (t, r) => ({
        grossPaise: t.grossPaise + r.grossPaise,
        refundPaise: t.refundPaise + r.refundPaise,
        netPaise: t.netPaise + r.netPaise,
        bookings: t.bookings + r.bookings,
      }),
      { grossPaise: 0, refundPaise: 0, netPaise: 0, bookings: 0 }
    ),
    awaitingInvoice: { count: open.awaiting_n, paise: Number(open.awaiting_paise) },
    unreconciled: { count: open.unrec_n, paise: Number(open.unrec_paise) },
  };
}
