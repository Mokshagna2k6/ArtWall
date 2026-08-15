import type { Metadata } from "next";

import { LedgerPanel } from "@/features/physical-wall/components/ledger-panel";
import { formatINR } from "@/features/physical-wall/money";
import {
  getMonthlySummary,
  getPerkSummary,
  listLedgerEntries,
} from "@/features/physical-wall/data/ledger";

export const metadata: Metadata = {
  title: "Ledger",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function AdminLedgerPage({
  searchParams,
}: PageProps<"/physical-wall/admin/ledger">) {
  const params = await searchParams;
  const requested = typeof params.month === "string" ? params.month : undefined;
  const month =
    requested && /^\d{4}-\d{2}$/.test(requested)
      ? requested
      : new Date().toISOString().slice(0, 7);

  const [entries, summary, perks] = await Promise.all([
    listLedgerEntries(month),
    getMonthlySummary(month),
    getPerkSummary(month),
  ]);

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="font-heading text-display">Ledger</h1>
        <p className="text-ink-muted mt-3 max-w-2xl text-sm leading-6">
          Two lists and a monthly total, for {month}. Deliberately not a P&amp;L
          engine — when the volume justifies it, the answer is Tally or Zoho
          Books, not more tables here.
        </p>
      </div>

      {perks.redemptions > 0 && (
        <div className="border-hairline rounded-md border p-5">
          <h2 className="font-heading text-card">Ric Platter attribution</h2>
          <p className="text-ink-muted mt-2 text-sm leading-6">
            {formatINR(perks.attributedBillPaise)} of restaurant spend traced to
            the wall across {perks.redemptions} redemption
            {perks.redemptions === 1 ? "" : "s"}, with{" "}
            {formatINR(perks.discountGivenPaise)} given away in discount.
            {perks.flagged > 0 &&
              ` ${perks.flagged} record(s) are flagged for reconciliation — a bill amount was missing.`}
          </p>
          <p className="text-ink-muted mt-2 text-xs leading-5">
            Shared with Platter in aggregate only, never per visitor.
          </p>
        </div>
      )}

      <LedgerPanel entries={entries} summary={summary} month={month} />
    </div>
  );
}
