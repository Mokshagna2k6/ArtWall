import { afterAll, describe, expect, it } from "vitest";

import { makeArtwork, makeUser, purgeTestData, q, tid } from "@/test/fixtures";
import { loadTrustDimensions } from "@/features/policy/trust";
import { canExhibit } from "@/features/policy/engine";

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
      // BC-3.08/3.12: granular levels, absent any backing state.
      provenanceLevel: "P0",
      bindingLevel: "B0",
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
      provenanceLevel: "P0",
      bindingLevel: "B0",
    });
  });

  // BC-3.08/3.12: the granular provenance/binding levels advance through
  // their real intermediate states, not just the collapsed booleans.
  it("provenanceLevel climbs P0 -> P1 -> P2 -> P3, independent of a 1:1 NFT mint", async () => {
    const artist = await makeUser();
    const art = await makeArtwork(artist.id);

    expect((await loadTrustDimensions(art)).provenanceLevel).toBe("P0");

    const coaId = tid("coa");
    await q(
      `insert into coa_certificates (id, artwork_id, user_id, metadata_hash, status, issued_at) values ($1, $2, $3, $1, 'issued', now())`,
      [coaId, art, artist.id],
    );
    expect((await loadTrustDimensions(art)).provenanceLevel).toBe("P1");

    const mintId = tid("mint");
    await q(
      `insert into mint_commitments (id, artwork_id, user_id, leaf_hash, status) values ($1, $2, $3, $1, 'pending')`,
      [mintId, art, artist.id],
    );
    expect((await loadTrustDimensions(art)).provenanceLevel).toBe("P2");

    // A commitment's merkle root confirmed on-chain (gateway.ts's
    // recordOnChainProvenance) is P3 — anchored — even though no separate
    // ArtwallCOA NFT has been minted for this artwork yet.
    await q(`update mint_commitments set status = 'minted', token_id = '1', mint_tx_hash = '0xabc' where id = $1`, [
      mintId,
    ]);
    expect((await loadTrustDimensions(art)).provenanceLevel).toBe("P3");
  });

  it("provenanceLevel reaches P4 only when the COA certificate itself is minted", async () => {
    const artist = await makeUser();
    const art = await makeArtwork(artist.id);
    const coaId = tid("coa");
    await q(
      `insert into coa_certificates
         (id, artwork_id, user_id, metadata_hash, status, "txHash", "tokenId", "chainId", "contractAddr", "mintedAt")
       values ($1, $2, $3, $1, 'minted', '0xabc', '1', 84532, '0xcontract', now())`,
      [coaId, art, artist.id],
    );
    expect((await loadTrustDimensions(art)).provenanceLevel).toBe("P4");
  });

  it("bindingLevel climbs B0 -> B2 -> B3 as a tag is bound then actually scanned", async () => {
    const artist = await makeUser();
    const art = await makeArtwork(artist.id);

    expect((await loadTrustDimensions(art)).bindingLevel).toBe("B0");

    const tagId = tid("tag");
    await q(`insert into art_tags (id, tag_uid) values ($1, $1)`, [tagId]);
    await q(`update art_tags set artwork_id = $2, bound_at = now(), bound_by = $3 where id = $1`, [
      tagId,
      art,
      artist.id,
    ]);
    expect((await loadTrustDimensions(art)).bindingLevel).toBe("B2");

    // A scan row only ever exists after resolveTagScan's crypto verification
    // succeeded (BC-3.09/3.11) — its mere presence is what B3 means.
    await q(`insert into art_tag_scans (id, tag_id) values ($1, $2)`, [tid("tscan"), tagId]);
    expect((await loadTrustDimensions(art)).bindingLevel).toBe("B3");
  });

  // BC-3.15 end-to-end: canExhibit against loadTrustDimensions's real output
  // for an artwork that is genuinely bound AND anchored, vs. one that is
  // bound but NOT anchored (still P2, a pending commitment) — F71's hard
  // gate, driven by the real BC-3.08/3.12 levels instead of placeholder
  // booleans.
  it("canExhibit denies a bound-but-not-anchored artwork, then allows once anchored (end-to-end)", async () => {
    const artist = await makeUser();
    const art = await makeArtwork(artist.id);

    const tagId = tid("tag");
    await q(`insert into art_tags (id, tag_uid) values ($1, $1)`, [tagId]);
    await q(`update art_tags set artwork_id = $2, bound_at = now(), bound_by = $3 where id = $1`, [
      tagId,
      art,
      artist.id,
    ]);

    const mintId = tid("mint");
    await q(
      `insert into mint_commitments (id, artwork_id, user_id, leaf_hash, status) values ($1, $2, $3, $1, 'pending')`,
      [mintId, art, artist.id],
    );

    // Bound (B2) but only a pending commitment (P2) — the hard gate must
    // still deny: physical binding alone is not enough, same as before, but
    // now it's also checking that P2 does not pass as "anchored".
    let trust = await loadTrustDimensions(art);
    expect(trust.bindingLevel).toBe("B2");
    expect(trust.provenanceLevel).toBe("P2");
    expect(canExhibit({ trust }).allow).toBe(false);

    // Anchor the commitment on-chain (gateway.ts's recordOnChainProvenance
    // path) -> P3. Binding is still only B2 (no verified scan yet) -> still denied.
    await q(`update mint_commitments set status = 'minted', token_id = '1', mint_tx_hash = '0xabc' where id = $1`, [
      mintId,
    ]);
    trust = await loadTrustDimensions(art);
    expect(trust.provenanceLevel).toBe("P3");
    expect(canExhibit({ trust }).allow).toBe(true); // B2 + P3 already clears the bar

    // A real verified scan (BC-3.09/3.11's resolveTagScan) pushes binding to
    // B3 — exhibitable and at the strongest state on both dimensions.
    await q(`insert into art_tag_scans (id, tag_id) values ($1, $2)`, [tid("tscan"), tagId]);
    trust = await loadTrustDimensions(art);
    expect(trust.bindingLevel).toBe("B3");
    expect(canExhibit({ trust }).allow).toBe(true);
  });
});
