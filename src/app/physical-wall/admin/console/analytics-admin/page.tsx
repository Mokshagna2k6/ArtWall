import type { Metadata } from "next";
import Link from "next/link";
import { IndianRupee, LayoutGrid, TrendingUp } from "lucide-react";

import { requireAnyAdminRolePage } from "@/features/physical-wall/authorize";

export const metadata: Metadata = {
  title: "Analytics Admin",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

/**
 * FE-3.18: `analytics_admin` is `readonly_admin` renamed by migration 0059
 * (same permissions — a read-only dashboard, no write actions — just the
 * Bible's name). These three links go to pages this role can already read;
 * none of them gate a write action behind analytics_admin specifically, so
 * nothing changed about what the role can *do*, only what it's called.
 */
export default async function AnalyticsAdminConsolePage() {
  await requireAnyAdminRolePage(["analytics_admin"], "/physical-wall/admin/console/analytics-admin");

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-heading text-display">Analytics Admin</h1>
        <p className="text-ink-muted mt-2 max-w-2xl text-sm leading-6">
          Read-only dashboard access. Renamed from <code>readonly_admin</code>{" "}
          — same permissions, the Bible&rsquo;s name.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Link href="/physical-wall/admin" className="border-hairline hover:bg-band flex items-center gap-3 rounded-md border p-5 transition-colors">
          <TrendingUp className="size-5 shrink-0" aria-hidden />
          <div>
            <p className="text-sm font-medium">Overview</p>
            <p className="text-ink-muted mt-1 text-xs">Occupancy, revenue, alerts</p>
          </div>
        </Link>
        <Link href="/physical-wall/admin/revenue" className="border-hairline hover:bg-band flex items-center gap-3 rounded-md border p-5 transition-colors">
          <IndianRupee className="size-5 shrink-0" aria-hidden />
          <div>
            <p className="text-sm font-medium">Revenue report</p>
            <p className="text-ink-muted mt-1 text-xs">By day, week, or month</p>
          </div>
        </Link>
        <Link href="/physical-wall/admin/grid" className="border-hairline hover:bg-band flex items-center gap-3 rounded-md border p-5 transition-colors">
          <LayoutGrid className="size-5 shrink-0" aria-hidden />
          <div>
            <p className="text-sm font-medium">Wall map</p>
            <p className="text-ink-muted mt-1 text-xs">Occupancy by slot</p>
          </div>
        </Link>
      </div>
    </div>
  );
}
