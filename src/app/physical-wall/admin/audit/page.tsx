import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { requireRolePage } from "@/features/physical-wall/authorize";
import { getSql } from "@/lib/db";

export const metadata: Metadata = {
  title: "Audit log",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;

/**
 * Audit log viewer (Phase 1).
 *
 * Every force action, grid edit, catalog change and refund is already written
 * to `pw_audit_log`; this page makes it readable. Filterable by action prefix
 * (e.g. `slot.`, `booking.`, `grievance.`) because "show me everything anyone
 * did with slots this week" is the question that actually gets asked.
 */
export default async function AuditLogPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string; page?: string }>;
}) {
  await requireRolePage("admin", "/physical-wall/admin/audit");

  const params = await searchParams;
  const filter = (params.filter ?? "").trim().replace(/[%_]/g, "");
  const page = Math.max(1, Number(params.page ?? "1") || 1);
  const offset = (page - 1) * PAGE_SIZE;

  const sql = getSql();
  const where = filter ? { action: `${filter}%` } : null;

  const entries = (await sql`
    select id, actor_label, action, subject_type, subject_id, before, after, created_at
    from pw_audit_log
    ${where ? sql`where action like ${where.action}` : sql``}
    order by created_at desc
    limit ${PAGE_SIZE + 1} offset ${offset}
  `) as {
    id: string;
    actor_label: string | null;
    action: string;
    subject_type: string;
    subject_id: string | null;
    before: string | null;
    after: string | null;
    created_at: Date;
  }[];

  const hasNext = entries.length > PAGE_SIZE;
  const visible = entries.slice(0, PAGE_SIZE);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-heading text-display">Audit log</h1>
        <p className="text-ink-muted mt-2 text-sm">
          Append-only record of every privileged action. Nothing here can be
          edited or deleted.
        </p>
      </div>

      <form method="get" className="flex gap-2">
        <input
          type="search"
          name="filter"
          defaultValue={filter}
          placeholder="Filter by action — e.g. slot., booking., grievance."
          aria-label="Filter by action"
          className="border-hairline bg-surface flex-1 rounded-md border px-3 py-2 text-sm outline-none focus:border-terracotta"
        />
        <button
          type="submit"
          className="bg-ink text-paper hover:bg-ink/90 rounded-md px-4 py-2 text-sm font-medium transition-colors"
        >
          Filter
        </button>
      </form>

      {visible.length === 0 ? (
        <p className="text-ink-muted border-hairline rounded-md border border-dashed p-8 text-center text-sm">
          No audit entries{filter ? ` matching "${filter}"` : ""} yet.
        </p>
      ) : (
        <ul className="border-hairline flex flex-col overflow-hidden rounded-md border">
          {visible.map((entry, index) => (
            <li
              key={entry.id}
              className={index > 0 ? "border-hairline border-t" : undefined}
            >
              <details className="group px-4 py-3">
                <summary className="hover:bg-band -mx-4 cursor-pointer list-none px-4 py-1 transition-colors">
                  <span className="text-ink text-sm font-medium">{entry.action}</span>
                  <span className="text-ink-muted ml-2 text-xs">
                    {entry.actor_label ?? "system"}
                  </span>
                  <time className="text-ink-muted float-right text-xs tabular-nums">
                    {new Date(entry.created_at).toLocaleString("en-IN")}
                  </time>
                </summary>
                <dl className="text-ink-muted mt-2 space-y-1 pl-4 text-xs leading-5">
                  <div>
                    <dt className="inline font-medium">Subject: </dt>
                    <dd className="inline">
                      {entry.subject_type}
                      {entry.subject_id ? ` · ${entry.subject_id}` : ""}
                    </dd>
                  </div>
                  {entry.before && (
                    <div>
                      <dt className="inline font-medium">Before: </dt>
                      <dd className="inline break-all font-mono">{entry.before}</dd>
                    </div>
                  )}
                  {entry.after && (
                    <div>
                      <dt className="inline font-medium">After: </dt>
                      <dd className="inline break-all font-mono">{entry.after}</dd>
                    </div>
                  )}
                </dl>
              </details>
            </li>
          ))}
        </ul>
      )}

      {(page > 1 || hasNext) && (
        <nav className="flex items-center justify-between" aria-label="Pagination">
          {page > 1 ? (
            <Link
              href={`/physical-wall/admin/audit?${new URLSearchParams({
                ...(filter && { filter }),
                page: String(page - 1),
              })}`}
              className="border-hairline hover:bg-band flex items-center gap-1 rounded-md border px-3 py-2 text-sm transition-colors"
            >
              <ChevronLeft className="size-4" aria-hidden /> Newer
            </Link>
          ) : (
            <span />
          )}
          {hasNext ? (
            <Link
              href={`/physical-wall/admin/audit?${new URLSearchParams({
                ...(filter && { filter }),
                page: String(page + 1),
              })}`}
              className="border-hairline hover:bg-band flex items-center gap-1 rounded-md border px-3 py-2 text-sm transition-colors"
            >
              Older <ChevronRight className="size-4" aria-hidden />
            </Link>
          ) : (
            <span />
          )}
        </nav>
      )}
    </div>
  );
}