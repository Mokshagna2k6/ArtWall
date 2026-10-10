import type { Metadata } from "next";
import Link from "next/link";
import { MessageSquareWarning } from "lucide-react";

import { requireAnyAdminRolePage } from "@/features/physical-wall/authorize";
import { getSql } from "@/lib/db";

export const metadata: Metadata = {
  title: "Support Admin",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

/** FE-3.18: support_admin's one real count — open grievances past due. */
async function countOpenGrievances(): Promise<number> {
  const sql = getSql();
  const rows = (await sql`select count(*)::int as n from pw_grievances where status = 'open'`) as { n: number }[];
  return rows[0]?.n ?? 0;
}

export default async function SupportAdminConsolePage() {
  await requireAnyAdminRolePage(["support_admin"], "/physical-wall/admin/console/support-admin");
  const open = await countOpenGrievances();

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-heading text-display">Support Admin</h1>
        <p className="text-ink-muted mt-2 max-w-2xl text-sm leading-6">
          Grievances and customer support actions.
        </p>
      </div>

      <Link href="/physical-wall/admin/grievances" className="border-hairline hover:bg-band flex items-center gap-3 rounded-md border p-5 transition-colors">
        <MessageSquareWarning className="size-5 shrink-0" aria-hidden />
        <div>
          <p className="text-sm font-medium">Grievance inbox</p>
          <p className="text-ink-muted mt-1 text-xs">
            {open} open grievance{open === 1 ? "" : "s"}
          </p>
        </div>
      </Link>
    </div>
  );
}
