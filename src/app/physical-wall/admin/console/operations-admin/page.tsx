import type { Metadata } from "next";
import Link from "next/link";
import { CalendarDays, FileText, IdCard, LayoutGrid, Users } from "lucide-react";

import { requireAnyAdminRolePage } from "@/features/physical-wall/authorize";
import { listInstallQueue } from "@/features/physical-wall/data/bookings";
import { getActiveGrid, listSlots } from "@/features/physical-wall/data/wall";

export const metadata: Metadata = {
  title: "Operations Admin",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

/**
 * FE-3.18: `operations_admin` is brand new (migration 0059) — day-to-day
 * wall operations had no dedicated role before, it just lived on the broad
 * requireRole("admin") catch-all. This landing page surfaces the real
 * existing operational pages (bookings, install queue, calendar, wall map)
 * rather than re-implementing any of them; those pages themselves are not
 * tightened to require operations_admin in this round (docs/policy-engine.md's
 * documented "broad catch-all for most sections" scope decision stands —
 * narrowing them is a separate, larger change this round doesn't make).
 *
 * Identity/KYC review (compliance_admin, not a Bible role) is linked here
 * too: it's operational work and has no better home among the 8.
 */
export default async function OperationsAdminConsolePage() {
  await requireAnyAdminRolePage(["operations_admin"], "/physical-wall/admin/console/operations-admin");

  const grid = await getActiveGrid();
  const [queue, slots] = await Promise.all([
    listInstallQueue(),
    grid ? listSlots(grid.id) : Promise.resolve([]),
  ]);
  const outOfService = slots.filter((s) => ["maintenance", "blocked"].includes(s.state)).length;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-heading text-display">Operations Admin</h1>
        <p className="text-ink-muted mt-2 max-w-2xl text-sm leading-6">
          Day-to-day wall operations: bookings, install queue, calendar, wall
          map. These pages already exist and already work — this is a front
          door to them, not a rebuild.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <ConsoleLink
          href="/physical-wall/admin/queue"
          icon={Users}
          label="Install queue"
          detail={`${queue.length} booking${queue.length === 1 ? "" : "s"} waiting`}
        />
        <ConsoleLink
          href="/physical-wall/admin/grid"
          icon={LayoutGrid}
          label="Wall map"
          detail={`${outOfService} slot${outOfService === 1 ? "" : "s"} out of service`}
        />
        <ConsoleLink href="/physical-wall/admin/bookings" icon={FileText} label="Bookings" detail="Full booking list" />
        <ConsoleLink href="/physical-wall/admin/calendar" icon={CalendarDays} label="Calendar" detail="Installs and deadlines" />
      </div>

      <div>
        <p className="text-label text-ink-muted tracking-wider uppercase">Not operations_admin-specific, but related</p>
        <ConsoleLink
          href="/physical-wall/admin/identity"
          icon={IdCard}
          label="Identity verification"
          detail="compliance_admin — a separate, non-Bible role"
          className="mt-3"
        />
      </div>
    </div>
  );
}

function ConsoleLink({
  href,
  icon: Icon,
  label,
  detail,
  className = "",
}: {
  href: string;
  icon: typeof Users;
  label: string;
  detail: string;
  className?: string;
}) {
  return (
    <Link
      href={href}
      className={`border-hairline hover:bg-band flex items-center gap-3 rounded-md border p-5 transition-colors ${className}`}
    >
      <Icon className="size-5 shrink-0" aria-hidden />
      <div>
        <p className="text-sm font-medium">{label}</p>
        <p className="text-ink-muted mt-1 text-xs">{detail}</p>
      </div>
    </Link>
  );
}
