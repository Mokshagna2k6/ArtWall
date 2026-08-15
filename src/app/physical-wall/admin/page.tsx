import type { Metadata } from "next";
import Link from "next/link";
import {
  AlertTriangle,
  Clock,
  LayoutGrid,
  TrendingUp,
  Wallet,
} from "lucide-react";

import { formatINR } from "@/features/physical-wall/money";
import { listInstallQueue } from "@/features/physical-wall/data/bookings";
import { getCurrentRefundPolicy, getSettings } from "@/features/physical-wall/data/catalogs";
import { getMonthlySummary, getPerkSummary } from "@/features/physical-wall/data/ledger";
import { getActiveGrid, listSlots } from "@/features/physical-wall/data/wall";
import { isRazorpayConfigured } from "@/features/physical-wall/razorpay";

export const metadata: Metadata = {
  title: "Wall overview",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function AdminOverviewPage() {
  const grid = await getActiveGrid();
  const month = new Date().toISOString().slice(0, 7);

  const [slots, summary, perks, policy, settings, queue] = await Promise.all([
    grid ? listSlots(grid.id) : Promise.resolve([]),
    getMonthlySummary(month),
    getPerkSummary(month),
    getCurrentRefundPolicy(),
    getSettings(),
    listInstallQueue(),
  ]);

  const live = slots.filter((slot) => slot.state === "live").length;
  const available = slots.filter((slot) => slot.state === "available").length;
  const outOfService = slots.filter((slot) =>
    ["maintenance", "blocked"].includes(slot.state)
  ).length;
  const occupancy =
    slots.length === 0
      ? 0
      : Math.round(((slots.length - available) / slots.length) * 100);

  // Things that need a person today, computed rather than decorative. The
  // prototype showed a hard-coded alert list; this one is either empty or true.
  const alerts = [
    queue.length > 0 && {
      text: `${queue.length} booking${queue.length === 1 ? "" : "s"} waiting to be installed`,
      href: "/physical-wall/ops",
    },
    perks.flagged > 0 && {
      text: `${perks.flagged} Platter redemption${perks.flagged === 1 ? "" : "s"} flagged — a bill amount is missing`,
      href: "/physical-wall/admin/ledger",
    },
    outOfService > 0 && {
      text: `${outOfService} slot${outOfService === 1 ? "" : "s"} out of service`,
      href: "/physical-wall/admin/grid",
    },
    !policy && {
      text: "No refund policy is published — bookings cannot state their terms",
      href: "/physical-wall/admin/catalogs",
    },
  ].filter(Boolean) as { text: string; href: string }[];

  return (
    <div className="flex flex-col gap-10">
      <div>
        <h1 className="font-heading text-display">Overview</h1>
        <p className="text-ink-muted mt-2 text-sm">
          {grid ? grid.name : "No layout published"} ·{" "}
          {new Date().toLocaleDateString("en-IN", {
            weekday: "long",
            day: "numeric",
            month: "long",
            year: "numeric",
          })}
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Metric
          icon={LayoutGrid}
          label="On the wall"
          value={`${live}`}
          detail={`${occupancy}% occupancy · ${available} free`}
        />
        <Metric
          icon={Wallet}
          label="Revenue this month"
          value={formatINR(summary.revenuePaise)}
          detail={`Net ${formatINR(summary.netPaise)} after expenses`}
        />
        <Metric
          icon={TrendingUp}
          label="Platter spend attributed"
          value={formatINR(perks.attributedBillPaise)}
          detail={`${perks.redemptions} redemption${perks.redemptions === 1 ? "" : "s"}${perks.flagged > 0 ? `, ${perks.flagged} flagged` : ""}`}
        />
        <Metric
          icon={Clock}
          label="Refund policy"
          value={policy ? `${policy.percentage}%` : "Not set"}
          detail={
            policy
              ? `Version ${policy.version} in force`
              : "Set one before taking bookings"
          }
        />
      </div>

      {alerts.length > 0 && (
        <section>
          <h2 className="text-label text-ink-muted tracking-wider uppercase">
            Needs you
          </h2>
          <ul className="border-hairline mt-3 flex flex-col rounded-md border">
            {alerts.map((alert, index) => (
              <li
                key={alert.text}
                className={index > 0 ? "border-hairline border-t" : undefined}
              >
                <Link
                  href={alert.href}
                  className="hover:bg-band flex items-center gap-3 px-4 py-3 text-sm transition-colors"
                >
                  <AlertTriangle
                    className="text-terracotta size-4 shrink-0"
                    aria-hidden
                  />
                  {alert.text}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Things that will bite at launch if nobody looks at them. Stated here
          rather than buried in a settings page, because an unset refund policy
          is a legal problem and a placeholder discount is a money problem. */}
      <section className="border-terracotta rounded-md border border-dashed p-5">
        <h2 className="font-heading text-card">Before you take real money</h2>
        <ul className="text-ink-muted mt-3 flex flex-col gap-2 text-sm leading-6">
          {!isRazorpayConfigured() && (
            <li>
              <strong className="text-ink">Razorpay isn&rsquo;t configured.</strong>{" "}
              Bookings can only be confirmed by hand from the bookings tab. Add
              the keys to switch online payment on.
            </li>
          )}
          {policy?.note?.includes("PLACEHOLDER") && (
            <li>
              <strong className="text-ink">
                The refund policy is still the seeded placeholder ({policy.percentage}%).
              </strong>{" "}
              Whatever is set here is what the agreement promises.{" "}
              <Link href="/physical-wall/admin/catalogs" className="underline underline-offset-4">
                Set it properly
              </Link>
              .
            </li>
          )}
          {settings.groupDiscountTiers.length > 0 && (
            <li>
              <strong className="text-ink">Group discounts are invented numbers.</strong>{" "}
              The spec names 5+/10+/full-wall tiers but gives no percentages;
              they are seeded at{" "}
              {settings.groupDiscountTiers
                .map((tier) => `${tier.percentBp / 100}%`)
                .join(" / ")}
              .
            </li>
          )}
          <li>
            <strong className="text-ink">GST is set to {settings.gstRateBp / 100}%</strong>{" "}
            with no SAC code recorded. Confirm both with your accountant — every
            invoice carries them.
          </li>
          {settings.surgeEnabled && (
            <li>
              <strong className="text-ink">Demand pricing is ON.</strong> It is
              in the prototype but not in the written spec. Bookings above{" "}
              {settings.surgeThresholdPct}% occupancy cost{" "}
              {settings.surgeMultiplierBp / 100}% of list.
            </li>
          )}
        </ul>
      </section>
    </div>
  );
}

function Metric({
  icon: Icon,
  label,
  value,
  detail,
}: {
  icon: typeof Wallet;
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <div className="border-hairline rounded-md border p-5">
      <div className="flex items-start justify-between gap-3">
        <p className="text-label text-ink-muted tracking-wider uppercase">
          {label}
        </p>
        <Icon className="text-ink-muted size-4 shrink-0" aria-hidden />
      </div>
      <p className="font-heading text-section mt-3 tabular-nums">{value}</p>
      <p className="text-ink-muted mt-2 text-xs leading-5">{detail}</p>
    </div>
  );
}
