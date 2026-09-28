import type { Metadata } from "next";

import { requireRolePage } from "@/features/physical-wall/authorize";
import { getRevenueReport } from "@/features/physical-wall/data/ledger";
import { formatINR } from "@/features/physical-wall/money";

export const metadata: Metadata = {
  title: "Revenue",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function RevenuePage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string }>;
}) {
  await requireRolePage("admin", "/physical-wall/admin/revenue");
  const params = await searchParams;
  const range = params.range ?? "month";

  const trunc = range === "day" ? "day" : range === "week" ? "week" : "month";
  const report = await getRevenueReport(trunc);
  const { rows, totals, awaitingInvoice, unreconciled } = report;

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="font-heading text-display">Revenue</h1>
        <p className="text-ink-muted mt-2 text-sm">
          Booking revenue from the ledger, net of refunds, by accounting date.
        </p>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div className="border-hairline rounded-md border p-5">
          <p className="text-ink-muted text-xs uppercase tracking-wider">Net revenue</p>
          <p className="font-heading text-section mt-1">{formatINR(totals.netPaise)}</p>
          <p className="text-ink-muted mt-1 text-xs">
            {formatINR(totals.grossPaise)} gross − {formatINR(totals.refundPaise)} refunds
          </p>
        </div>
        <div className="border-hairline rounded-md border p-5">
          <p className="text-ink-muted text-xs uppercase tracking-wider">Paid bookings</p>
          <p className="font-heading text-section mt-1">{totals.bookings}</p>
        </div>
        <div className="border-hairline rounded-md border p-5">
          <p className="text-ink-muted text-xs uppercase tracking-wider">Awaiting invoice</p>
          <p className="font-heading text-section mt-1">
            {formatINR(awaitingInvoice.paise)} ({awaitingInvoice.count})
          </p>
        </div>
        <div className="border-hairline rounded-md border p-5">
          <p className="text-ink-muted text-xs uppercase tracking-wider">Unreconciled</p>
          <p className="font-heading text-section mt-1">
            {formatINR(unreconciled.paise)} ({unreconciled.count})
          </p>
          <p className="text-ink-muted mt-1 text-xs">Paid, but no ledger entry. Should be 0.</p>
        </div>
      </div>

      {/* Range selector */}
      <form method="get" className="flex gap-2">
        {(["day", "week", "month"] as const).map((r) => (
          <button
            key={r}
            type="submit"
            name="range"
            value={r}
            className={`border-hairline rounded-md border px-4 py-2 text-sm capitalize ${
              range === r ? "bg-ink text-paper" : "hover:bg-band"
            }`}
          >
            {r}
          </button>
        ))}
      </form>

      {/* Revenue table */}
      {rows.length === 0 ? (
        <p className="text-ink-muted border-hairline rounded-md border border-dashed p-10 text-center text-sm">
          No revenue recorded yet.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-hairline border-b text-left">
                <th className="pb-3 pr-4 font-medium">Period</th>
                <th className="pb-3 pr-4 text-right font-medium">Gross</th>
                <th className="pb-3 pr-4 text-right font-medium">Refunds</th>
                <th className="pb-3 pr-4 text-right font-medium">Net</th>
                <th className="pb-3 text-right font-medium">Bookings</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.period} className="border-hairline border-b">
                  <td className="py-3 pr-4 tabular-nums">
                    {new Date(`${row.period}T00:00:00`).toLocaleDateString("en-IN", {
                      year: "numeric",
                      month: "short",
                      day: trunc === "day" ? "numeric" : undefined,
                    })}
                  </td>
                  <td className="py-3 pr-4 text-right tabular-nums">
                    {formatINR(row.grossPaise)}
                  </td>
                  <td className="py-3 pr-4 text-right tabular-nums">
                    {formatINR(row.refundPaise)}
                  </td>
                  <td className="py-3 pr-4 text-right tabular-nums">
                    {formatINR(row.netPaise)}
                  </td>
                  <td className="py-3 text-right tabular-nums">{row.bookings}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
