import { afterAll, describe, expect, it } from "vitest";

import { purgeTestData, q, tid } from "@/test/fixtures";

afterAll(purgeTestData);

/**
 * DB-3.04: commission_policy_versions — one versioned row with
 * platform/artist/curator/venue/royalty bps, shares summing to 10000,
 * immutable once effective, at most one open (effective_to null) row.
 */
describe("commission_policy_versions (DB-3.04)", () => {
  it("rejects a split that does not sum to 10000", async () => {
    const id = tid("cpv");
    await expect(
      q(
        `insert into commission_policy_versions (id, version, platform_bps, artist_bps, curator_bps, venue_bps, royalty_bps)
         values ($1, 999, 100, 100, 100, 100, 100)`,
        [id]
      )
    ).rejects.toThrow(/shares_sum_10000/);
  });

  it("is immutable once effective, except effective_to", async () => {
    const id = tid("cpv");
    await q(
      `insert into commission_policy_versions (id, version, effective_to, platform_bps, artist_bps, curator_bps, venue_bps, royalty_bps)
       values ($1, 998, now(), 500, 8100, 1000, 0, 400)`,
      [id]
    );
    // Already effective (effective_from defaults to now(), in the past by the time this runs).
    await expect(q(`update commission_policy_versions set platform_bps = 9999 where id = $1`, [id])).rejects.toThrow(
      /immutable/
    );
    // effective_to alone is allowed.
    await q(`update commission_policy_versions set effective_to = now() where id = $1`, [id]);
  });

  it("allows at most one open (effective_to null) row at a time", async () => {
    // Seed (0044) leaves cpv_v1 open, and other test files in this suite may
    // also leave a version open — close out whatever is currently open first
    // so this test owns a clean slate, same as it would in a real deployment
    // where opening a new version always closes the previous one first.
    await q(`update commission_policy_versions set effective_to = now() where effective_to is null`);

    const id1 = tid("cpv");
    const id2 = tid("cpv");
    await q(
      `insert into commission_policy_versions (id, version, platform_bps, artist_bps, curator_bps, venue_bps, royalty_bps)
       values ($1, 997, 500, 8100, 1000, 0, 400)`,
      [id1]
    );
    await expect(
      q(
        `insert into commission_policy_versions (id, version, platform_bps, artist_bps, curator_bps, venue_bps, royalty_bps)
         values ($1, 996, 500, 8100, 1000, 0, 400)`,
        [id2]
      )
    ).rejects.toThrow(/commission_policy_versions_one_open/);

    await q(`update commission_policy_versions set effective_to = now() where id = $1`, [id1]);
    await q(
      `insert into commission_policy_versions (id, version, platform_bps, artist_bps, curator_bps, venue_bps, royalty_bps)
       values ($1, 996, 500, 8100, 1000, 0, 400)`,
      [id2]
    );
    await q(`update commission_policy_versions set effective_to = now() where id = $1`, [id2]);
  });
});
