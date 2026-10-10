import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { features } from "@/config/site";
import { AdminOrderActions, PayoutForm } from "@/features/orders/components/order-actions";
import { getAdminOverview } from "@/features/orders/data";
import { requireAnyAdminRolePage } from "@/features/physical-wall/authorize";
import { formatINR } from "@/features/physical-wall/money";

export const metadata: Metadata = { title: "Marketplace orders", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

/**
 * Minimal Finance view of marketplace sales: seller sub-orders with escrow
 * state, refunds, and the manual payout queue (Finance pays out of band and
 * records the bank UTR). Read-heavy by design; the write actions are
 * audited and finance_admin-gated server-side (orders/actions/orders.ts).
 */
export default async function MarketplaceOrdersAdminPage() {
  if (!features.marketplaceCheckout) notFound();
  await requireAnyAdminRolePage(["finance_admin", "operations_admin"], "/physical-wall/admin/orders");
  const { orders, payouts, totals } = await getAdminOverview();

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="font-heading text-display">Marketplace orders</h1>
        <p className="text-ink-muted mt-2 max-w-2xl text-sm leading-6">
          One row per seller sub-order. A buyer who bought from several artists has one row for each; refunds, shipping and release are per row.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-4">
        {[
          ["Paid GMV", formatINR(totals.gmvPaise)],
          ["Held in escrow", formatINR(totals.heldPaise)],
          ["Payouts owed", formatINR(totals.owedPaise)],
          ["Stuck refunds", String(totals.stuckRefunds)],
        ].map(([label, value]) => (
          <div key={label} className="border-hairline rounded-md border p-4">
            <p className="text-label text-ink-muted tracking-wider uppercase">{label}</p>
            <p className="font-heading text-section mt-2 tabular-nums">{value}</p>
          </div>
        ))}
      </div>

      <section aria-label="Payouts">
        <h2 className="font-heading text-card">Payouts</h2>
        {payouts.length === 0 ? (
          <p className="text-ink-muted mt-2 text-sm">Nothing owed yet.</p>
        ) : (
          <table className="mt-3 w-full text-left text-sm">
            <thead className="text-ink-muted text-xs uppercase">
              <tr>
                <th className="py-2">Order</th>
                <th>Payee</th>
                <th>Amount</th>
                <th>Status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {payouts.map((p) => (
                <tr key={p.id} className="border-hairline border-t">
                  <td className="py-2">{p.orderNumber}</td>
                  <td>
                    {p.payeeName} ({p.payeeKind}){!p.identityVerified && <span className="text-destructive"> · identity not verified</span>}
                  </td>
                  <td>{formatINR(p.amountPaise)}</td>
                  <td>{p.status === "paid" ? `Paid · ${p.utr}` : p.status}</td>
                  <td>{p.status === "owed" && <PayoutForm payoutId={p.id} identityVerified={p.identityVerified} />}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section aria-label="Seller orders">
        <h2 className="font-heading text-card">Seller orders</h2>
        <table className="mt-3 w-full text-left text-sm">
          <thead className="text-ink-muted text-xs uppercase">
            <tr>
              <th className="py-2">Order</th>
              <th>Artist</th>
              <th>Status</th>
              <th>Total</th>
              <th>Refunded</th>
              <th>Commission</th>
              <th>Escrow</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {orders.map((o) => (
              <tr key={o.id} className="border-hairline border-t align-top">
                <td className="py-2">{o.orderNumber}</td>
                <td>{o.sellerName}</td>
                <td>{o.status}</td>
                <td>{formatINR(o.totalPaise)}</td>
                <td>{o.refundedPaise ? formatINR(o.refundedPaise) : "—"}</td>
                <td>{formatINR(o.platformFeePaise)}</td>
                <td>{o.holdStatus ?? "—"}</td>
                <td>
                  <AdminOrderActions sellerOrderId={o.id} status={o.status} totalPaise={o.totalPaise} refundedPaise={o.refundedPaise} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
