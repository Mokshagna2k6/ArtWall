import { NextResponse } from "next/server";

import { getSql } from "@/lib/db";
import { newId } from "@/features/physical-wall/actions/shared";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const RETENTION_DAYS: Record<string, number> = {
  pw_search_log: 90,
  pw_scans: 180,
};

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const sql = getSql();
  const results: Record<string, number> = {};

  for (const [table, days] of Object.entries(RETENTION_DAYS)) {
    const cutoff = new Date(Date.now() - days * 86_400_000).toISOString();
    const deleted = (await sql.query(
      `with d as (
         delete from ${table} where created_at < $1 returning 1
       ) select count(*)::int as n from d`,
      [cutoff]
    )) as { n: number }[];

    const count = deleted[0]?.n ?? 0;
    results[table] = count;

    if (count > 0) {
      await sql`
        insert into pw_retention_runs (id, target, deleted, details)
        values (${newId("ret")}, ${table}, ${count},
                ${JSON.stringify({ cutoff, days })}::jsonb)
      `;
    }
  }

  return NextResponse.json({ results });
}
