"use server";

import { updateTag } from "next/cache";

import { recordAudit } from "@/features/physical-wall/audit";
import { requireRole } from "@/features/physical-wall/authorize";
import { listLedgerEntries } from "@/features/physical-wall/data/ledger";
import { formatINR, toPaise } from "@/features/physical-wall/money";
import { ledgerEntrySchema } from "@/features/physical-wall/schema";
import {
  fail,
  firstIssue,
  LEDGER_TAG,
  newId,
  ok,
  toActionError,
  type ActionState,
} from "@/features/physical-wall/actions/shared";
import { getSql } from "@/lib/db";

/**
 * The founder's ledger (F18, C07).
 *
 * Two lists and a CSV button. Entries written by the system — a captured
 * payment, a refund, a Platter perk — arrive with a `source_ref` and are never
 * editable here; hand entries are for the things no system knows about, like
 * the venue share or a trip to buy hanging wire.
 *
 * Corrections are new entries with a note, not edits. There are no locked
 * periods to fight, and an accountant can see what was changed and why.
 */

const CATEGORIES = {
  revenue: ["booking", "addon", "coffee", "commission", "other"],
  expense: ["venue-share", "ops", "platter-perk", "refund", "misc"],
} as const;

export async function addLedgerEntry(
  _previous: ActionState,
  formData: FormData
): Promise<ActionState> {
  try {
    const actor = await requireRole("admin");

    const parsed = ledgerEntrySchema.safeParse({
      type: formData.get("type"),
      category: formData.get("category"),
      amount: formData.get("amount"),
      note: formData.get("note") || undefined,
      entryDate: formData.get("entryDate"),
    });
    if (!parsed.success) return fail(firstIssue(parsed.error));

    const input = parsed.data;
    const amountPaise = toPaise(input.amount);
    if (amountPaise === null || amountPaise === 0) {
      return fail("Enter an amount.");
    }

    const allowed: readonly string[] = CATEGORIES[input.type];
    if (!allowed.includes(input.category)) {
      return fail(`Pick one of: ${allowed.join(", ")}.`);
    }

    const id = newId("led");
    const sql = getSql();

    await sql`
      insert into pw_ledger
        (id, type, category, amount_paise, note, entry_date, created_by)
      values (${id}, ${input.type}, ${input.category}, ${amountPaise},
              ${input.note ?? null}, ${input.entryDate}::date, ${actor.id})
    `;

    await recordAudit({
      actor,
      action: "ledger.entry.created",
      subjectType: "ledger",
      subjectId: id,
      after: { ...input, amountPaise },
    });

    updateTag(LEDGER_TAG);
    return ok(
      `Recorded ${input.type} of ${formatINR(amountPaise)} under ${input.category}.`
    );
  } catch (error) {
    return toActionError("addLedgerEntry", error);
  }
}

/**
 * Export a month as CSV (F19-lite).
 *
 * Returned as a string for the client to turn into a download rather than
 * streamed as a file response: the ledger for a month is a few hundred rows at
 * most, and this keeps the whole thing inside the action's auth check instead of
 * needing a separately-guarded route.
 *
 * Fields are quoted and internal quotes doubled — a note containing a comma is
 * ordinary, and a CSV that breaks on one is worse than no CSV.
 */
export async function exportLedgerCsv(
  month: string
): Promise<{ ok: true; csv: string; filename: string } | { ok: false; message: string }> {
  try {
    await requireRole("admin");

    if (!/^\d{4}-\d{2}$/.test(month)) {
      return { ok: false, message: "Pick a month." };
    }

    const entries = await listLedgerEntries(month);
    const escape = (value: string) => `"${value.replace(/"/g, '""')}"`;

    const rows = [
      ["Date", "Type", "Category", "Amount (INR)", "Note", "Source"].join(","),
      ...entries.map((entry) =>
        [
          entry.entryDate,
          entry.type,
          entry.category,
          (entry.amountPaise / 100).toFixed(2),
          escape(entry.note ?? ""),
          escape(entry.sourceRef ?? "manual"),
        ].join(",")
      ),
    ];

    return {
      ok: true,
      csv: rows.join("\r\n"),
      filename: `artwall-wall-ledger-${month}.csv`,
    };
  } catch (error) {
    console.error("[physical-wall] exportLedgerCsv", error);
    return { ok: false, message: "Could not build the export." };
  }
}

/** The category lists, so the form and the validator cannot drift apart. */
export async function getLedgerCategories(): Promise<typeof CATEGORIES> {
  return CATEGORIES;
}
