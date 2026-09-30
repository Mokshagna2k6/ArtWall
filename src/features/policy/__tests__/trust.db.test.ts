import { afterAll, describe, expect, it } from "vitest";

import { makeArtwork, makeUser, purgeTestData, q, tid } from "@/test/fixtures";
import { loadTrustDimensions } from "@/features/policy/trust";

afterAll(purgeTestData);

/** DB-3.01: the canonical TrustDimensions loader reads real rows, not a cache. */
describe("loadTrustDimensions", () => {
  it("starts every dimension false for a fresh artwork", async () => {
    const artist = await makeUser();
    const art = await makeArtwork(artist.id);
    expect(await loadTrustDimensions(art)).toEqual({
      identityVerified: false,
      physicalBindingVerified: false,
      blockchainAnchored: false,
      coaIssued: false,
      curationApproved: false,
    });
  });

  it("flips each dimension on as its real backing row appears", async () => {
    const artist = await makeUser();
    const art = await makeArtwork(artist.id);

    await q(`update "user" set identity_verified = true where id = $1`, [artist.id]);
    expect((await loadTrustDimensions(art)).identityVerified).toBe(true);

    const tagUnbound = tid("tag");
    await q(`insert into art_tags (id, tag_uid) values ($1, $1)`, [tagUnbound]);
    expect((await loadTrustDimensions(art)).physicalBindingVerified).toBe(false);
    await q(`update art_tags set artwork_id = $2, bound_at = now(), bound_by = $3 where id = $1`, [
      tagUnbound,
      art,
      artist.id,
    ]);
    expect((await loadTrustDimensions(art)).physicalBindingVerified).toBe(true);

    const coaId = tid("coa");
    await q(
      `insert into coa_certificates (id, artwork_id, user_id, metadata_hash, status) values ($1, $2, $3, 'h', 'draft')`,
      [coaId, art, artist.id]
    );
    expect((await loadTrustDimensions(art)).coaIssued).toBe(false);
    await q(`update coa_certificates set status = 'issued', issued_at = now() where id = $1`, [coaId]);
    expect((await loadTrustDimensions(art)).coaIssued).toBe(true);

    const mintId = tid("mint");
    await q(
      `insert into mint_commitments (id, artwork_id, user_id, leaf_hash, status) values ($1, $2, $3, $1, 'pending')`,
      [mintId, art, artist.id]
    );
    expect((await loadTrustDimensions(art)).blockchainAnchored).toBe(false);
    await q(`update mint_commitments set status = 'minted', token_id = '1', mint_tx_hash = '0xabc' where id = $1`, [
      mintId,
    ]);
    expect((await loadTrustDimensions(art)).blockchainAnchored).toBe(true);

    const curatorId = tid("cur");
    const curatorUser = await makeUser();
    await q(
      `insert into curators (id, user_id, display_name, status) values ($1, $2, 'Test Curator', 'active')`,
      [curatorId, curatorUser.id]
    );
    expect((await loadTrustDimensions(art)).curationApproved).toBe(false);
    await q(`insert into curator_picks (id, curator_id, artwork_id) values ($1, $2, $3)`, [tid("pick"), curatorId, art]);
    expect((await loadTrustDimensions(art)).curationApproved).toBe(true);
  });

  it("returns all-false for a non-existent artwork id, never throws", async () => {
    expect(await loadTrustDimensions("betest_does_not_exist")).toEqual({
      identityVerified: false,
      physicalBindingVerified: false,
      blockchainAnchored: false,
      coaIssued: false,
      curationApproved: false,
    });
  });
});
