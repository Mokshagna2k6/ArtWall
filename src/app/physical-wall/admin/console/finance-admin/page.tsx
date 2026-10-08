import type { Metadata } from "next";
import Link from "next/link";
import { ClipboardCheck, IndianRupee, Wallet } from "lucide-react";

import { requireAnyAdminRolePage } from "@/features/physical-wall/authorize";
import { formatINR } from "@/features/physical-wall/money";
import { getMonthlySummary } from "@/features/physical-wall/data/ledger";
import { AdminNotAvailable } from "@/features/physical-wall/components/admin-not-available";

export const metadata: Metadata = {
  title: "Finance Admin",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

/**
 * FE-3.18: Finance Admin's domain today is wall-rental booking revenue —
 * pw_ledger, pw_bookings — NOT artwork/marketplace sales. There is no real
 * buyer-purchase/checkout flow and no real marketplace GMV in this codebase
 * (confirmed by reading the payment code), so a "GMV dashboard" is an
 * honest placeholder below, not a renamed version of the booking revenue
 * this page already surfaces correctly.
 */
export default async function FinanceAdminConsolePage() {
  await requireAnyAdminRolePage(["finance_admin"], "/physical-wall/admin/console/finance-admin");

  const month = new Date().toISOString().slice(0, 7);
  const summary = await getMonthlySummary(month);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-heading text-display">Finance Admin</h1>
        <p className="text-ink-muted mt-2 max-w-2xl text-sm leading-6">
          Ledger, payouts, commission policy, and wall-rental revenue. This
          measures booking revenue — rent paid for wall space — not
          marketplace artwork sales; there is no real buyer-purchase flow in
          this codebase yet.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="border-hairline rounded-md border p-5">
          <p className="text-label text-ink-muted tracking-wider uppercase">Revenue this month</p>
          <p className="font-heading text-section mt-3 tabular-nums">{formatINR(summary.revenuePaise)}</p>
          <p className="text-ink-muted mt-2 text-xs">Net {formatINR(summary.netPaise)} after expenses</p>
        </div>
        <Link href="/physical-wall/admin/revenue" className="border-hairline hover:bg-band flex items-center gap-3 rounded-md border p-5 transition-colors">
          <IndianRupee className="size-5 shrink-0" aria-hidden />
          <div>
            <p className="text-sm font-medium">Full revenue report</p>
            <p className="text-ink-muted mt-1 text-xs">By day, week, or month</p>
          </div>
        </Link>
        <Link href="/physical-wall/admin/ledger" className="border-hairline hover:bg-band flex items-center gap-3 rounded-md border p-5 transition-colors">
          <ClipboardCheck className="size-5 shrink-0" aria-hidden />
          <div>
            <p className="text-sm font-medium">Ledger</p>
            <p className="text-ink-muted mt-1 text-xs">Line-item income and expenses</p>
          </div>
        </Link>
        <Link href="/physical-wall/admin/catalogs" className="border-hairline hover:bg-band flex items-center gap-3 rounded-md border p-5 transition-colors">
          <Wallet className="size-5 shrink-0" aria-hidden />
          <div>
            <p className="text-sm font-medium">Pricing &amp; refund policy</p>
            <p className="text-ink-muted mt-1 text-xs">Commission and catalog settings</p>
          </div>
        </Link>
      </div>

      <div>
        <p className="text-label text-ink-muted tracking-wider uppercase">Bible-described, not built</p>
        <div className="mt-3">
          <AdminNotAvailable what="A marketplace GMV dashboard (artwork sales, not wall-rental revenue)" />
        </div>
      </div>
    </div>
  );
}
