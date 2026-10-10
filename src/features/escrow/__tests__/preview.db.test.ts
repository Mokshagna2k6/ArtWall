import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";

import { loadEscrowSplitPreview } from "@/features/escrow/preview";
import { computeEscrowSplit } from "@/features/escrow/split";
import { makeArtwork, makeUser, purgeTestData, q, tid } from "@/test/fixtures";

/**
 * FE-3.14: loadEscrowSplitPreview against a real database. Opens a real
 * commission_policy_versions row (closing/restoring whatever was open,
 * same safe pattern as escrow.db.test.ts's beforeEach/afterEach) and a real
 * priced artwork, then proves the loader's returned numbers equal what
 * computeEscrowSplit itself returns for the same inputs — i.e. the preview
 * is not reinventing the split math, it is calling the real function.
 */
describe("loadEscrowSplitPreview (FE-3.14)", () => {
  let testPolicyId: string;
  let previousOpenId: string | null;

  beforeEach(async () => {
    const [open] = await q<{ id: string }>(`select id from commission_policy_versions where effective_to is null`);
    previousOpenId = open?.id ?? null;
    if (previousOpenId) {
      await q(`update commission_policy_versions set effective_to = now() where id = $1`, [previousOpenId]);
    }
    testPolicyId = tid("cpv");
    await q(
      `insert into commission_policy_versions (id, version, platform_bps, artist_bps, curator_bps, venue_bps, royalty_bps)
       values ($1, (select coalesce(max(version), 0) + 1 from commission_policy_versions), 500, 8100, 1000, 0, 400)`,
      [testPolicyId]
    );
  });

  afterEach(async () => {
    await q(`update commission_policy_versions set effective_to = now() where id = $1`, [testPolicyId]);
    if (previousOpenId) {
      await q(`update commission_policy_versions set effective_to = null where id = $1`, [previousOpenId]);
    }
  });

  afterAll(purgeTestData);

  it("returns the real computeEscrowSplit result for a real priced artwork, no curator pick", async () => {
    const artist = await makeUser("artist");
    const artworkId = await makeArtwork(artist.id, { pricePaise: 250_000 });

    const preview = await loadEscrowSplitPreview(artworkId, 250_000);
    expect(preview).not.toBeNull();

    const expected = computeEscrowSplit(
      250_000,
      { platformBps: 500, artistBps: 8100, curatorBps: 1000, venueBps: 0 },
      false
    );
    expect(preview!.platformPaise).toBe(expected.platformPaise);
    expect(preview!.artistPaise).toBe(expected.artistPaise);
    expect(preview!.curatorVenuePaise).toBe(expected.curatorVenuePaise);
    expect(preview!.hasCuratorVenue).toBe(false);
    expect(preview!.platformPaise + preview!.artistPaise + preview!.curatorVenuePaise).toBe(250_000);
    // Real numbers for this policy (500bps/8100bps/1000bps, no curator):
    // platform 12,500p, curator folds into artist -> artist 237,500p, curator 0p.
    expect(preview!.platformPaise).toBe(12_500);
    expect(preview!.artistPaise).toBe(237_500);
    expect(preview!.curatorVenuePaise).toBe(0);
  });

  it("includes the curator/venue share when the artwork has a curator pick", async () => {
    const artist = await makeUser("artist");
    const curatorUser = await makeUser("staff");
    const curatorId = tid("curator");
    await q(`insert into curators (id, user_id, display_name, status) values ($1, $2, 'Test Curator', 'active')`, [
      curatorId,
      curatorUser.id,
    ]);
    const artworkId = await makeArtwork(artist.id, { pricePaise: 100_000 });
    await q(`insert into curator_picks (id, curator_id, artwork_id) values ($1, $2, $3)`, [
      tid("pick"),
      curatorId,
      artworkId,
    ]);

    const preview = await loadEscrowSplitPreview(artworkId, 100_000);
    expect(preview).not.toBeNull();
    expect(preview!.hasCuratorVenue).toBe(true);

    const expected = computeEscrowSplit(
      100_000,
      { platformBps: 500, artistBps: 8100, curatorBps: 1000, venueBps: 0 },
      true
    );
    expect(preview!.platformPaise).toBe(expected.platformPaise);
    expect(preview!.artistPaise).toBe(expected.artistPaise);
    expect(preview!.curatorVenuePaise).toBe(expected.curatorVenuePaise);
    // Real numbers: platform 5,000p, curator/venue 10,000p, artist 85,000p remainder.
    expect(preview!.platformPaise).toBe(5_000);
    expect(preview!.curatorVenuePaise).toBe(10_000);
    expect(preview!.artistPaise).toBe(85_000);
  });

  it("returns null when the artwork has no price", async () => {
    const artist = await makeUser("artist");
    const artworkId = await makeArtwork(artist.id, { pricePaise: null });

    const preview = await loadEscrowSplitPreview(artworkId, null);
    expect(preview).toBeNull();
  });
});
