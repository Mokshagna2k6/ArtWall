import type { Metadata } from "next";

import { requireRolePage } from "@/features/physical-wall/authorize";
import { getSql } from "@/lib/db";
import { formatINR } from "@/features/physical-wall/money";

export const metadata: Metadata = {
  title: "Revenue",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

interface RevRow {
  period: string;
  revenue_paise: number;
  bookings: number;
}

export default async function RevenuePage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string }>;
}) {
  await requireRolePage("admin", "/physical-wall/admin/revenue");
  const params = await searchParams;
  const range = params.range ?? "month";

  const sql = getSql();

  const trunc = range === "day" ? "day" : range === "week" ? "week" : "month";

  const rows = (await sql.query(
    `select date_trunc($1, l.created_at)::date as period,
            sum(l.amount_paise) as revenue_paise,
            count(distinct l.booking_id)::int as bookings
     from pw_ledger l
     where l.type = 'payment' and l.amount_paise > 0
     group by 1
     order by 1 desc
     limit 24`,
    [trunc]
  )) as RevRow[];

  const totalPaise = rows.reduce((sum, r) => sum + Number(r.revenue_paise), 0);
  const totalBookings = rows.reduce((sum, r) => sum + Number(r.bookings), 0);

  const pendingRows = (await sql`
    select count(*)::int as n, coalesce(sum(total_paise), 0)::int as paise
    from pw_bookings
    where status = 'paid' and id not in (
      select booking_id from pw_ledger where type = 'settlement'
    )
  `) as { n: number; paise: number }[];
  const pending = pendingRows[0] ?? { n: 0, paise: 0 };

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="font-heading text-display">Revenue</h1>
        <p className="text-ink-muted mt-2 text-sm">
          Wall rental revenue from the ledger. All amounts in paise, displayed as
          rupees.
        </p>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        <div className="border-hairline rounded-md border p-5">
          <p className="text-ink-muted text-xs uppercase tracking-wider">Total revenue</p>
          <p className="font-heading text-section mt-1">{formatINR(totalPaise)}</p>
        </div>
        <div className="border-hairline rounded-md border p-5">
          <p className="text-ink-muted text-xs uppercase tracking-wider">Bookings</p>
          <p className="font-heading text-section mt-1">{totalBookings}</p>
        </div>
        <div className="border-hairline rounded-md border p-5">
          <p className="text-ink-muted text-xs uppercase tracking-wider">Pending settlement</p>
          <p className="font-heading text-section mt-1">
            {formatINR(Number(pending.paise))} ({pending.n})
          </p>
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
                <th className="pb-3 pr-4 text-right font-medium">Revenue</th>
                <th className="pb-3 text-right font-medium">Bookings</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.period} className="border-hairline border-b">
                  <td className="py-3 pr-4 tabular-nums">
                    {new Date(row.period).toLocaleDateString("en-IN", {
                      year: "numeric",
                      month: "short",
                      day: trunc === "day" ? "numeric" : undefined,
                    })}
                  </td>
                  <td className="py-3 pr-4 text-right tabular-nums">
                    {formatINR(Number(row.revenue_paise))}
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
