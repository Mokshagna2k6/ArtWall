import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

import { loadEscrowSplitPreview } from "@/features/escrow/preview";
import { EscrowSplitBreakdown } from "@/features/escrow/split-breakdown";
import { formatINR } from "@/features/physical-wall/money";
import { makeArtwork, makeUser, purgeTestData, q, tid } from "@/test/fixtures";

/**
 * FE-3.14: proves the rendered HTML from EscrowSplitBreakdown, fed the real
 * loadEscrowSplitPreview result for a real artwork against a real open
 * commission policy, actually shows the correct paise amounts as rendered
 * text — not just that the data loader returns correct numbers (proven in
 * preview.db.test.ts) but that the component displays them.
 */
describe("EscrowSplitBreakdown renders real split data (FE-3.14)", () => {
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

  it("renders artist/platform shares matching the real computed split", async () => {
    const artist = await makeUser("artist");
    const artworkId = await makeArtwork(artist.id, { pricePaise: 250_000 });

    const split = await loadEscrowSplitPreview(artworkId, 250_000);
    expect(split).not.toBeNull();

    const html = renderToStaticMarkup(EscrowSplitBreakdown({ split: split! }));

    // Real expected amounts for 500/8100/1000/0 bps on 250,000 paise, no curator:
    // platform 12,500p (INR 125.00), artist 237,500p (INR 2,375.00).
    expect(html).toContain(formatINR(12_500));
    expect(html).toContain(formatINR(237_500));
    expect(html).toContain(formatINR(250_000));
    expect(html).toContain("commission policy v" + split!.commissionPolicyVersion);
    expect(html).not.toContain("Curator / venue share");
  });
});
