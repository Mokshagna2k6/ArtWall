"use client";

import { useActionState, useState } from "react";

import { IDLE } from "@/features/physical-wall/action-state";
import { addLedgerEntry, exportLedgerCsv } from "@/features/physical-wall/actions/ledger";
import {
  Field,
  FormStatus,
  inputClass,
  SubmitButton,
} from "@/features/physical-wall/components/form-bits";
import { formatINR } from "@/features/physical-wall/money";
import type { LedgerEntry } from "@/features/physical-wall/types";
import type { LedgerSummary } from "@/features/physical-wall/data/ledger";

const CATEGORIES = {
  revenue: ["booking", "addon", "coffee", "commission", "other"],
  expense: ["venue-share", "ops", "platter-perk", "refund", "misc"],
} as const;

/**
 * The ledger (F18, F19-lite).
 *
 * Entries with a source reference were written by the system — a captured
 * payment, a refund, a Platter perk — and are shown but not editable. Hand
 * entries are for what no system knows about: the venue share, a trip to buy
 * hanging wire.
 *
 * Corrections are new entries with a note, never edits. There are no periods to
 * lock and an accountant can see what changed and why.
 */
export function LedgerPanel({
  entries,
  summary,
  month,
}: {
  entries: LedgerEntry[];
  summary: LedgerSummary;
  month: string;
}) {
  const [state, action] = useActionState(addLedgerEntry, IDLE);
  const [type, setType] = useState<"revenue" | "expense">("expense");
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  async function download() {
    setExporting(true);
    setExportError(null);
    const result = await exportLedgerCsv(month);
    setExporting(false);

    if (!result.ok) {
      setExportError(result.message);
      return;
    }

    // Built in the browser from a string the action returned, so the download
    // is covered by the action's admin check rather than by a separate route
    // that would need guarding all over again.
    const blob = new Blob([result.csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = result.filename;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="flex flex-col gap-10">
      <div className="grid gap-4 sm:grid-cols-3">
        <Total label="Revenue" value={formatINR(summary.revenuePaise)} />
        <Total label="Expenses" value={formatINR(summary.expensePaise)} />
        <Total label="Net" value={formatINR(summary.netPaise)} emphasis />
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={download}
          disabled={exporting}
          className="border-hairline-strong hover:border-ink text-small inline-flex h-10 items-center rounded-md border px-4 disabled:opacity-60"
        >
          {exporting ? "Building…" : `Export ${month} as CSV`}
        </button>
        {exportError && (
          <span className="text-destructive text-small">{exportError}</span>
        )}
      </div>

      <section>
        <h2 className="font-heading text-section">Add an entry</h2>
        <form
          action={action}
          className="border-hairline mt-4 grid max-w-4xl items-end gap-4 rounded-md border p-5 sm:grid-cols-5"
        >
          <Field label="Type" htmlFor="type">
            <select
              id="type"
              name="type"
              value={type}
              onChange={(event) =>
                setType(event.target.value as "revenue" | "expense")
              }
              className={inputClass}
            >
              <option value="expense">Expense</option>
              <option value="revenue">Revenue</option>
            </select>
          </Field>
          <Field label="Category" htmlFor="category">
            <select id="category" name="category" className={inputClass}>
              {CATEGORIES[type].map((category) => (
                <option key={category} value={category}>
                  {category}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Amount (₹)" htmlFor="amount">
            <input
              id="amount"
              name="amount"
              type="number"
              step="0.01"
              min="0"
              required
              className={inputClass}
            />
          </Field>
          <Field label="Date" htmlFor="entryDate">
            <input
              id="entryDate"
              name="entryDate"
              type="date"
              required
              defaultValue={new Date().toISOString().slice(0, 10)}
              className={inputClass}
            />
          </Field>
          <SubmitButton>Record</SubmitButton>
          <div className="sm:col-span-3">
            <Field label="Note" htmlFor="note">
              <input id="note" name="note" maxLength={280} className={inputClass} />
            </Field>
          </div>
          <div className="sm:col-span-5">
            <FormStatus state={state} />
          </div>
        </form>
      </section>

      <section>
        <h2 className="font-heading text-section">Entries</h2>
        {entries.length === 0 ? (
          <p className="border-hairline text-ink-muted mt-4 rounded-md border border-dashed p-6 text-center text-sm">
            Nothing recorded for {month}.
          </p>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[40rem] text-sm">
              <thead>
                <tr className="border-hairline text-ink-muted border-b text-left">
                  <Th>Date</Th>
                  <Th>Type</Th>
                  <Th>Category</Th>
                  <Th>Note</Th>
                  <Th align="right">Amount</Th>
                </tr>
              </thead>
              <tbody>
                {entries.map((entry) => (
                  <tr key={entry.id} className="border-hairline border-b">
                    <Td>{entry.entryDate}</Td>
                    <Td>{entry.type}</Td>
                    <Td>{entry.category}</Td>
                    <Td>
                      {entry.note ?? "—"}
                      {entry.sourceRef && (
                        <span className="text-ink-muted block text-xs">
                          automatic · {entry.sourceRef}
                        </span>
                      )}
                    </Td>
                    <Td align="right">
                      <span className="tabular-nums">
                        {entry.type === "expense" ? "− " : ""}
                        {formatINR(entry.amountPaise)}
                      </span>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

function Total({
  label,
  value,
  emphasis,
}: {
  label: string;
  value: string;
  emphasis?: boolean;
}) {
  return (
    <div
      className={`rounded-md border p-5 ${emphasis ? "border-ink" : "border-hairline"}`}
    >
      <p className="text-label text-ink-muted tracking-wider uppercase">{label}</p>
      <p className="font-heading text-section mt-2 tabular-nums">{value}</p>
    </div>
  );
}

function Th({
  children,
  align,
}: {
  children: React.ReactNode;
  align?: "right";
}) {
  return (
    <th
      scope="col"
      className={`text-label px-2 py-2 font-normal tracking-wider uppercase ${align === "right" ? "text-right" : ""}`}
    >
      {children}
    </th>
  );
}

function Td({
  children,
  align,
}: {
  children: React.ReactNode;
  align?: "right";
}) {
  return (
    <td className={`px-2 py-3 align-top ${align === "right" ? "text-right" : ""}`}>
      {children}
    </td>
  );
}
