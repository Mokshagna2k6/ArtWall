import { afterAll, describe, expect, it } from "vitest";

import { makeArtwork, makeUser, purgeTestData, q, tid } from "@/test/fixtures";
import { loadTrustDimensionLevels } from "@/features/policy/trust";

afterAll(purgeTestData);

/**
 * DB-3.01: the graded trust-dimension levels (artist_verification_status,
 * coa_level, provenance_level, binding_level, transaction_eligibility) — the
 * trust-panel UI's "level N of M" view, distinct from loadTrustDimensions'
 * plain booleans. See migration 0052 for the derivation of each column.
 */
describe("loadTrustDimensionLevels", () => {
  it("starts every level at its zero/unverified state for a fresh artwork", async () => {
    const artist = await makeUser();
    const art = await makeArtwork(artist.id);
    expect(await loadTrustDimensionLevels(art)).toEqual({
      artistVerificationStatus: "unverified",
      coaLevel: 0,
      coaTier: 0,
      certificationPath: "lazy",
      provenanceLevel: 0,
      bindingLevel: 0,
      transactionEligible: false,
    });
  });

  /**
   * Bible section 7 rule 7: HOLOGRAPHIC COA != BLOCKCHAIN PROVENANCE. coa_tier
   * (0076) and coa_level (0046/0052) are separate trust dimensions, so both
   * directions of "one without the other" must survive a round trip, and the
   * 0052 status trigger must never write coa_tier.
   */
  it("coa_tier is independent of coa_level in both directions (Bible s7 rule 7)", async () => {
    const artist = await makeUser();
    const art = await makeArtwork(artist.id);
    const institutional = tid("coa");

    // COA-3 institutional, never minted: high tier, zero mint progress.
    await q(
      `insert into coa_certificates (id, artwork_id, user_id, metadata_hash, status, coa_tier)
         values ($1, $2, $3, $1, 'draft', 3)`,
      [institutional, art, artist.id]
    );
    let levels = await loadTrustDimensionLevels(art);
    expect(levels.coaTier).toBe(3);
    expect(levels.coaLevel).toBe(0);

    // Driving the mint flow moves coa_level and must leave coa_tier alone.
    await q(`update coa_certificates set status = 'issued', issued_at = now() where id = $1`, [institutional]);
    levels = await loadTrustDimensionLevels(art);
    expect(levels.coaTier).toBe(3);
    expect(levels.coaLevel).toBe(1);

    // The inverse: a minted certificate carrying no holographic COA at all.
    const art2 = await makeArtwork(artist.id);
    const noCoa = tid("coa");
    await q(
      `insert into coa_certificates (id, artwork_id, user_id, metadata_hash, status)
         values ($1, $2, $3, $1, 'metadata_pinned')`,
      [noCoa, art2, artist.id]
    );
    levels = await loadTrustDimensionLevels(art2);
    expect(levels.coaTier).toBe(0);
    expect(levels.coaLevel).toBe(2);
  });

  it("certification_path reports the minting path the work was registered through", async () => {
    const artist = await makeUser();
    const art = await makeArtwork(artist.id);
    expect((await loadTrustDimensionLevels(art)).certificationPath).toBe("lazy");

    await q(`update artworks set certification_path = 'base_nft' where id = $1`, [art]);
    expect((await loadTrustDimensionLevels(art)).certificationPath).toBe("base_nft");

    await expect(
      q(`update artworks set certification_path = 'ethereum' where id = $1`, [art])
    ).rejects.toThrow();
  });

  it("artist_verification_status follows the same reviewIdentity write path as identity_verified", async () => {
    const artist = await makeUser();
    const art = await makeArtwork(artist.id);
    await q(`update "user" set artist_verification_status = 'approved', identity_verified = true where id = $1`, [
      artist.id,
    ]);
    expect((await loadTrustDimensionLevels(art)).artistVerificationStatus).toBe("approved");
  });

  it("coa_level stays in sync with status via trigger across every transition, including failed retaining its level", async () => {
    const artist = await makeUser();
    const art = await makeArtwork(artist.id);
    const coaId = tid("coa");

    await q(
      `insert into coa_certificates (id, artwork_id, user_id, metadata_hash, status) values ($1, $2, $3, $1, 'metadata_pinned')`,
      [coaId, art, artist.id]
    );
    expect((await loadTrustDimensionLevels(art)).coaLevel).toBe(2);

    await q(`update coa_certificates set status = 'minting', "txHash" = '0xdead' where id = $1`, [coaId]);
    expect((await loadTrustDimensionLevels(art)).coaLevel).toBe(2);

    // failed is an off-ramp, not a level of its own — it keeps level 2, not 1.
    await q(`update coa_certificates set status = 'failed' where id = $1`, [coaId]);
    expect((await loadTrustDimensionLevels(art)).coaLevel).toBe(2);
  });

  it("provenance_level escalates P0 -> P1 (COA issued) -> P3 (commitment committed) -> P4 (minted)", async () => {
    const artist = await makeUser();
    const art = await makeArtwork(artist.id);
    expect((await loadTrustDimensionLevels(art)).provenanceLevel).toBe(0);

    const coaId = tid("coa");
    await q(
      `insert into coa_certificates (id, artwork_id, user_id, metadata_hash, status, issued_at) values ($1, $2, $3, $1, 'issued', now())`,
      [coaId, art, artist.id]
    );
    expect((await loadTrustDimensionLevels(art)).provenanceLevel).toBe(1);

    const mintId = tid("mint");
    await q(
      `insert into mint_commitments (id, artwork_id, user_id, leaf_hash, status) values ($1, $2, $3, $1, 'committed')`,
      [mintId, art, artist.id]
    );
    expect((await loadTrustDimensionLevels(art)).provenanceLevel).toBe(3);

    await q(
      `update mint_commitments set status = 'minted', token_id = '1', mint_tx_hash = '0xabc' where id = $1`,
      [mintId]
    );
    expect((await loadTrustDimensionLevels(art)).provenanceLevel).toBe(4);
  });

  it("binding_level is generated from the same row's binding_status/key_reference/sun_counter_last_seen", async () => {
    const artist = await makeUser();
    const art = await makeArtwork(artist.id);
    const tagId = tid("tag");

    await q(`insert into art_tags (id, tag_uid) values ($1, $1)`, [tagId]);
    expect((await loadTrustDimensionLevels(art)).bindingLevel).toBe(0);

    await q(
      `update art_tags set artwork_id = $2, bound_at = now(), bound_by = $3, binding_status = 'bound' where id = $1`,
      [tagId, art, artist.id]
    );
    expect((await loadTrustDimensionLevels(art)).bindingLevel).toBe(1);

    await q(`update art_tags set key_reference = 'kref-1' where id = $1`, [tagId]);
    expect((await loadTrustDimensionLevels(art)).bindingLevel).toBe(2);

    await q(`update art_tags set sun_counter_last_seen = 3 where id = $1`, [tagId]);
    expect((await loadTrustDimensionLevels(art)).bindingLevel).toBe(3);
  });

  it("transaction_eligible is true only once published + identity verified + COA issued, mirroring canSecondarySell", async () => {
    const artist = await makeUser();
    const art = await makeArtwork(artist.id);
    expect((await loadTrustDimensionLevels(art)).transactionEligible).toBe(false);

    await q(`update "user" set identity_verified = true where id = $1`, [artist.id]);
    await q(`update artworks set lifecycle_status = 'published' where id = $1`, [art]);
    expect((await loadTrustDimensionLevels(art)).transactionEligible).toBe(false); // no COA yet

    const coaId = tid("coa");
    await q(
      `insert into coa_certificates (id, artwork_id, user_id, metadata_hash, status, issued_at) values ($1, $2, $3, $1, 'issued', now())`,
      [coaId, art, artist.id]
    );
    expect((await loadTrustDimensionLevels(art)).transactionEligible).toBe(true);
  });
});
