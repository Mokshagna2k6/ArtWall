import { NextResponse } from "next/server";

import { deadline, isCronAuthorized } from "@/lib/cron";
import { getSql } from "@/lib/db";
import { newId } from "@/features/physical-wall/actions/shared";
import { processAssetDeletions } from "@/features/physical-wall/data-rights";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const BATCH = 5_000;

const RETENTION_DAYS: Record<string, number> = {
  pw_search_log: 90,
  pw_scans: 180,
};

export async function GET(request: Request) {
  if (!isCronAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const until = deadline(maxDuration);
  const sql = getSql();
  const results: Record<string, number> = {};

  /**
   * Delete in chunks of BATCH rows (PERF-2.09): one statement never holds locks
   * on, or builds a WAL burst for, more than BATCH rows, and a big backlog is
   * worked off across runs instead of blowing the function timeout.
   */
  async function sweep(from: string, where: string, params: unknown[]): Promise<number> {
    let total = 0;
    while (Date.now() < until) {
      const [{ n }] = (await sql.query(
        `with d as (
           delete from ${from} where ctid in (select ctid from ${from} where ${where} limit ${BATCH})
           returning 1
         ) select count(*)::int as n from d`,
        params
      )) as { n: number }[];
      total += n;
      if (n < BATCH) break;
    }
    return total;
  }

  for (const [table, days] of Object.entries(RETENTION_DAYS)) {
    const cutoff = new Date(Date.now() - days * 86_400_000).toISOString();
    const count = await sweep(table, "created_at < $1", [cutoff]);
    results[table] = count;

    if (count > 0) {
      await sql`
        insert into pw_retention_runs (id, target, deleted, details)
        values (${newId("ret")}, ${table}, ${count},
                ${JSON.stringify({ cutoff, days })}::jsonb)
      `;
    }
  }

  // Expired rate-limit windows (lib/rate-limit.ts). Live rows are reused in
  // place, so this only bounds the table to about a day of distinct keys.
  results.rate_limits = await sweep("rate_limits", "reset_at < now()", []);

  // Retry Cloudinary deletions queued by DPDP erasure (BE-1.32).
  const assetDeletions = await processAssetDeletions(50, until);

  return NextResponse.json({ results, assetDeletions });
}
