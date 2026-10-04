import { afterAll, describe, expect, it } from "vitest";

import { purgeTestData, q, tid } from "@/test/fixtures";
import { runDemandAggregation } from "@/features/demand/aggregate";

afterAll(purgeTestData);

/**
 * DB-3.14: demand_signals (append-only event log) + demand_aggregates (one
 * row per artwork, upserted by this job). This replaces the old unit test
 * that asserted runDemandAggregation threw "blocked on DB-3.14" — the
 * tables it was blocked on now exist (0045_db3_demand_engine.sql), so the
 * real behavior to verify is the aggregation itself, against a real database.
 */
describe("runDemandAggregation (DB-3.14)", () => {
  it("sums weight*value per artwork into demand_aggregates", async () => {
    const artworkId = tid("art");
    await q(`insert into demand_signals (artwork_id, signal_type, weight, value) values ($1, 'view', 1, 5)`, [
      artworkId,
    ]);
    await q(`insert into demand_signals (artwork_id, signal_type, weight, value) values ($1, 'wishlist', 3, 2)`, [
      artworkId,
    ]);

    const result = await runDemandAggregation();
    expect(result.processed).toBeGreaterThan(0);

    const [row] = await q<{ score: number; threshold_crossed_at: string | null }>(
      `select score, threshold_crossed_at from demand_aggregates where artwork_id = $1`,
      [artworkId]
    );
    expect(row.score).toBe(11); // 1*5 + 3*2
    expect(row.threshold_crossed_at).toBeNull();

    await q(`delete from demand_aggregates where artwork_id = $1`, [artworkId]);
    await q(`alter table demand_signals disable trigger user`);
    await q(`delete from demand_signals where artwork_id = $1`, [artworkId]);
    await q(`alter table demand_signals enable trigger user`);
  });

  it("demand_signals rejects update/delete outside the privileged purge path", async () => {
    const artworkId = tid("art");
    await q(`insert into demand_signals (artwork_id, signal_type, weight, value) values ($1, 'view', 1, 1)`, [
      artworkId,
    ]);
    await expect(q(`update demand_signals set value = 99 where artwork_id = $1`, [artworkId])).rejects.toThrow(
      /append-only/
    );

    await q(`alter table demand_signals disable trigger user`);
    await q(`delete from demand_signals where artwork_id = $1`, [artworkId]);
    await q(`alter table demand_signals enable trigger user`);
  });

  it("preserves an already-crossed threshold across a re-run (never un-crosses it)", async () => {
    const artworkId = tid("art");
    await q(`insert into demand_signals (artwork_id, signal_type, weight, value) values ($1, 'view', 1, 1)`, [
      artworkId,
    ]);
    await runDemandAggregation();
    await q(`update demand_aggregates set threshold_crossed_at = now() where artwork_id = $1`, [artworkId]);

    await runDemandAggregation();
    const [row] = await q<{ threshold_crossed_at: string | null }>(
      `select threshold_crossed_at from demand_aggregates where artwork_id = $1`,
      [artworkId]
    );
    expect(row.threshold_crossed_at).not.toBeNull();

    await q(`delete from demand_aggregates where artwork_id = $1`, [artworkId]);
    await q(`alter table demand_signals disable trigger user`);
    await q(`delete from demand_signals where artwork_id = $1`, [artworkId]);
    await q(`alter table demand_signals enable trigger user`);
  });
});
