import type { Metadata } from "next";
import Link from "next/link";
import { ShieldCheck } from "lucide-react";

import { BIBLE_ROLES, requireAnyAdminRolePage } from "@/features/physical-wall/authorize";
import { roleConsolePath } from "@/features/physical-wall/admin-console";
import { getSql } from "@/lib/db";

export const metadata: Metadata = {
  title: "Super Admin",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

const RECENT_ACTIVITY_LIMIT = 15;

/**
 * Problem #9b: "who did what, when" on the super admin dashboard, reading
 * the EXISTING pw_audit_log table — same columns, same `order by at desc`
 * shape as src/app/physical-wall/admin/audit/page.tsx's full log viewer,
 * just capped to the most recent rows instead of paginated. No new logging
 * mechanism: every admin mutation already writes here via recordAudit.
 *
 * "Real-time" here means `dynamic = "force-dynamic"` (already set on this
 * page) plus a normal page visit/navigation — the same near-real-time
 * pattern the audit log page itself already relies on for "did my last
 * action show up." A literal push/websocket feed would be new
 * infrastructure for a dashboard a super_admin re-visits, not something
 * left open in a background tab — out of scope per the task brief.
 */
async function getRecentAuditActivity() {
  const sql = getSql();
  return (await sql`
    select id, actor_label, action, subject_type, subject_id, at as created_at
    from pw_audit_log
    order by at desc
    limit ${RECENT_ACTIVITY_LIMIT}
  `) as {
    id: string;
    actor_label: string | null;
    action: string;
    subject_type: string;
    subject_id: string | null;
    created_at: Date;
  }[];
}

export default async function SuperAdminConsolePage() {
  await requireAnyAdminRolePage(["super_admin"], "/physical-wall/admin/console/super-admin");
  const recentActivity = await getRecentAuditActivity();

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-heading text-display">Super Admin</h1>
        <p className="text-ink-muted mt-2 max-w-2xl text-sm leading-6">
          Full platform control. Every other role&rsquo;s page below is
          already unlocked for you — super_admin bypasses every per-role
          check in this admin area, including ones added after this page
          shipped.
        </p>
      </div>

      <Link
        href="/physical-wall/admin/roles"
        className="border-hairline hover:bg-band flex items-center gap-3 rounded-md border p-5 transition-colors"
      >
        <ShieldCheck className="size-5 shrink-0" aria-hidden />
        <div>
          <p className="text-sm font-medium">Grant or revoke admin roles</p>
          <p className="text-ink-muted mt-1 text-xs">
            The console you already have for the 9 named roles.
          </p>
        </div>
      </Link>

      <div>
        <p className="text-label text-ink-muted tracking-wider uppercase">
          Every role, at a glance
        </p>
        <ul className="border-hairline mt-3 flex flex-col rounded-md border text-sm">
          {BIBLE_ROLES.map((r, i) => (
            <li
              key={r.role}
              className={i > 0 ? "border-hairline border-t px-4 py-3" : "px-4 py-3"}
            >
              <Link href={roleConsolePath(r.role)} className="underline underline-offset-4">
                {r.label}
              </Link>
            </li>
          ))}
        </ul>
      </div>

      <div>
        <div className="flex items-baseline justify-between">
          <p className="text-label text-ink-muted tracking-wider uppercase">
            Recent activity
          </p>
          <Link
            href="/physical-wall/admin/audit"
            className="text-ink-muted hover:text-ink text-xs underline underline-offset-4"
          >
            Full audit log
          </Link>
        </div>
        {recentActivity.length === 0 ? (
          <p className="text-ink-muted border-hairline mt-3 rounded-md border border-dashed p-6 text-center text-sm">
            No admin actions recorded yet.
          </p>
        ) : (
          <ul className="border-hairline mt-3 flex flex-col overflow-hidden rounded-md border text-sm">
            {recentActivity.map((entry, i) => (
              <li
                key={entry.id}
                className={i > 0 ? "border-hairline border-t px-4 py-3" : "px-4 py-3"}
              >
                <span className="font-medium">{entry.action}</span>
                <span className="text-ink-muted ml-2 text-xs">
                  {entry.actor_label ?? "system"}
                  {entry.subject_id ? ` · ${entry.subject_type} ${entry.subject_id}` : ""}
                </span>
                <time className="text-ink-muted float-right text-xs tabular-nums">
                  {new Date(entry.created_at).toLocaleString("en-IN")}
                </time>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
