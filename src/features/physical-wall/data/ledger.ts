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
