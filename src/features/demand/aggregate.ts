import "server-only";

import { getSql } from "@/lib/db";

/**
 * Demand Engine aggregation job (PERF-3.04).
 *
 * PERF-3.04 requires "the Demand Engine aggregation runs as a scheduled or
 * incremental job, not per request, and demand reads are served from the
 * aggregate." DB-3.14 (migration 0045_db3_demand_engine.sql, branch
 * database-phase3-complete) landed the tables this job needs:
 * `demand_signals` (event-level, append-only) and `demand_aggregates` (one
 * row per artwork, upserted here) — same column names this file's own
 * "ASSUMED SCHEMA" comment guessed, so no interface change was needed, only
 * un-stubbing the query below.
 *
 * Wired into `src/app/api/cron/demand-aggregate/route.ts` (PERF-3.04, same
 * `runCron` pattern as every other job in that directory), scheduled daily
 * in `vercel.json`.
 *
 * The artist unlock threshold (see `content.ts`'s "Demand-Triggered Sale"
 * copy) is not yet a stored per-artwork column anywhere in this codebase;
 * `threshold_crossed_at` is left null until a real threshold source exists,
 * rather than hardcoding a guessed number into this job.
 */

export interface DemandAggregateRow {
  artworkId: string;
  score: number;
  /** Whatever DB-3.14 defines as the unlock threshold check; recomputed here so a stale aggregate never reports "unlocked" past a raised threshold. */
  thresholdCrossedAt: string | null;
  computedAt: string;
}

/**
 * Runs the aggregation and upserts one row per artwork into demand_aggregates
 * (DB-3.14), the table demand reads should be served from instead of
 * computing live.
 *
 * threshold_crossed_at is preserved once set (coalesce against the existing
 * row) — a stale aggregate must never un-cross a threshold just because this
 * job re-ran before a real per-artist threshold config exists; it also never
 * sets it in the first place yet (no threshold column exists anywhere to
 * compare against), so it stays null until that lands.
 */
export async function runDemandAggregation(): Promise<{ processed: number }> {
  const rows = (await getSql()`
    insert into demand_aggregates (artwork_id, score, threshold_crossed_at, computed_at)
    select
      artwork_id,
      sum(weight * value) as score,
      null::timestamptz as threshold_crossed_at,
      now()
    from demand_signals
    group by artwork_id
    on conflict (artwork_id) do update set
      score = excluded.score,
      threshold_crossed_at = coalesce(demand_aggregates.threshold_crossed_at, excluded.threshold_crossed_at),
      computed_at = excluded.computed_at
    returning artwork_id
  `) as { artworkId: string }[];
  return { processed: rows.length };
}
