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
 * Still not wired into a cron route (`src/app/api/cron/*`) — that is
 * PERF-3.04's own follow-up, not this migration's job; wire
 * `runDemandAggregation` into `src/app/api/cron/demand-aggregate/route.ts`
 * (same `runCron` pattern as every other job in that directory) when that
 * ticket is picked up.
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

/**
 * FE-3.06: the demand meter UI's read side. `demand_aggregates` has no
 * stored "max score" anywhere (no threshold config exists yet either — see
 * this file's header comment), so the meter is relative: this artwork's
 * score against the highest score currently in the table. A single
 * artwork's score with no context ("score: 11") tells a visitor nothing;
 * the max lets the UI draw a fill bar without inventing a scale the
 * database doesn't define.
 */
export interface DemandSignal {
  score: number;
  maxScore: number;
  thresholdCrossed: boolean;
}

export async function loadDemandSignal(artworkId: string): Promise<DemandSignal> {
  const rows = (await getSql()`
    select
      coalesce((select score from demand_aggregates where artwork_id = ${artworkId}), 0) as "score",
      coalesce((select max(score) from demand_aggregates), 0) as "maxScore",
      exists(
        select 1 from demand_aggregates
        where artwork_id = ${artworkId} and threshold_crossed_at is not null
      ) as "thresholdCrossed"
  `) as { score: number; maxScore: number; thresholdCrossed: boolean }[];
  const row = rows[0];
  return {
    score: row?.score ?? 0,
    maxScore: row?.maxScore ?? 0,
    thresholdCrossed: row?.thresholdCrossed ?? false,
  };
}
