import "server-only";

/**
 * Demand Engine aggregation job (PERF-3.04) — INTERFACE ONLY, BLOCKED.
 *
 * PERF-3.04 requires "the Demand Engine aggregation runs as a scheduled or
 * incremental job, not per request, and demand reads are served from the
 * aggregate." That requires Database Phase 3's Demand Engine tables (DB-3.14),
 * which are being built in parallel in worktree `agent-database-phase3` /
 * branch `database-phase3-complete` and are NOT YET merged into this branch.
 *
 * Per the task's own dependency note: do not guess at Database Phase 3's real
 * table/column names. This file documents the shape the aggregation job and
 * its cron route should have, and stubs the one query that depends on the
 * unmerged schema against a clearly-marked ASSUMED table name. It is
 * deliberately NOT wired into a cron route (`src/app/api/cron/*`) — a route
 * that calls a query against a table that doesn't exist yet would 500 on
 * every invocation once deployed, which is worse than not shipping it. Wire
 * `runDemandAggregation` into `src/app/api/cron/demand-aggregate/route.ts`
 * (same `runCron` pattern as every other job in that directory) once DB-3.14
 * lands and the ASSUMED name below is corrected against the real migration.
 *
 * Five weighted demand signals accumulate per artwork until they cross the
 * artist's threshold (see `content.ts`'s "Demand-Triggered Sale" copy) — this
 * is presumably per-artwork composite score storage, but the exact signal
 * columns are DB-3.14's to define; this file assumes only the shape needed to
 * serve a read from an aggregate instead of computing it live.
 */

export interface DemandAggregateRow {
  artworkId: string;
  score: number;
  /** Whatever DB-3.14 defines as the unlock threshold check; recomputed here so a stale aggregate never reports "unlocked" past a raised threshold. */
  thresholdCrossedAt: string | null;
  computedAt: string;
}

/**
 * Runs the aggregation and upserts one row per artwork into the aggregate
 * table demand reads should be served from.
 *
 * ASSUMED SCHEMA (TODO: verify against DB-3.14's actual migration once
 * database-phase3-complete is merged):
 *   - source: a `demand_signals` table with columns `(artwork_id, weight,
 *     value, recorded_at)` — one row per raw signal event, per the "five
 *     weighted demand signals" product copy.
 *   - destination: a `demand_aggregates` table with columns `(artwork_id
 *     primary key, score, threshold_crossed_at, computed_at)`, read by
 *     whatever marketplace/discover query currently computes demand live
 *     (grep for that call site once DB-3.14 lands — none exists yet in this
 *     branch, per `docs/policy-engine.md`'s "no ledger-producing... flow
 *     exists yet" pattern for adjacent features).
 */
export async function runDemandAggregation(): Promise<{ processed: number }> {
  throw new Error(
    "runDemandAggregation is blocked on Database Phase 3's Demand Engine tables (DB-3.14) — " +
      "not yet merged into this branch. See the ASSUMED SCHEMA doc comment above before implementing."
  );

  // ASSUMED query shape once DB-3.14 lands (unreachable, kept for the shape
  // only — delete this comment block once the real table names are known):
  //
  // const rows = await getSql()`
  //   insert into demand_aggregates (artwork_id, score, threshold_crossed_at, computed_at)
  //   select
  //     artwork_id,
  //     sum(weight * value) as score,
  //     case when sum(weight * value) >= /* artist threshold column, TODO */ 1
  //          then now() else null end as threshold_crossed_at,
  //     now()
  //   from demand_signals
  //   group by artwork_id
  //   on conflict (artwork_id) do update set
  //     score = excluded.score,
  //     threshold_crossed_at = coalesce(demand_aggregates.threshold_crossed_at, excluded.threshold_crossed_at),
  //     computed_at = excluded.computed_at
  //   returning artwork_id
  // `;
  // return { processed: rows.length };
}
