import type { Metadata } from "next";

import { requireRolePage } from "@/features/physical-wall/authorize";
import {
  GrievanceInbox,
  type GrievanceRow,
} from "@/features/physical-wall/components/grievance-inbox";
import { getSql } from "@/lib/db";

export const metadata: Metadata = {
  title: "Grievances",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

/**
 * Grievance inbox (Phase 1, §5.3).
 *
 * Open grievances first (soonest deadline first), then answered/closed below.
 * The 30-day DPDP clock is shown per card — a grievance that slips its
 * deadline is a compliance failure, and this page is where that would be seen.
 */
export default async function GrievancesPage() {
  await requireRolePage("admin", "/physical-wall/admin/grievances");

  const sql = getSql();
  const rows = (await sql`
    select g.id, g.subject, g.body, g.contact, g.status,
           g.due_at as "dueAt", g.created_at as "createdAt",
           coalesce(
             (select json_agg(json_build_object(
                'id', r.id, 'body', r.body, 'createdAt', r.created_at
              ) order by r.created_at asc)
              from pw_grievance_responses r where r.grievance_id = g.id),
             '[]'::json
           ) as responses
    from pw_grievances g
    order by
      case when g.status = 'open' then 0 else 1 end,
      case when g.status = 'open' then g.due_at else g.created_at end asc
    limit 100
  `) as unknown as GrievanceRow[];

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-heading text-display">Grievances</h1>
        <p className="text-ink-muted mt-2 text-sm">
          Every complaint has a 30-day clock. Replies are queued to the
          complainant&rsquo;s contact automatically.
        </p>
      </div>

      <GrievanceInbox grievances={rows} />
    </div>
  );
}