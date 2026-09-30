import { afterAll, describe, expect, it } from "vitest";

import { actAs } from "@/test/db-setup";
import { makeArtwork, makeProfile, makeUser, purgeTestData, q, tid } from "@/test/fixtures";
import {
  addProvenanceEvent,
  createEdition,
  createMintCommitment,
  getProvenanceTimeline,
  issueCertificate,
  verifyCertificateByHash,
} from "@/features/coa/actions";

afterAll(purgeTestData);

const WALLET = "0x1111111111111111111111111111111111111111";

describe("COA / provenance (BE-1.17 – 1.20)", () => {
  it("issue → provenance → edition; /verify returns every event for the certificate's artwork", async () => {
    const artist = await makeUser();
    await makeProfile(artist.id, { wallet: WALLET });
    const art = await makeArtwork(artist.id);
    actAs(artist);

    const edition = await createEdition({ artworkId: art, editionType: "limited", totalEditions: 5 });
    if (!edition.ok) throw new Error(edition.error);
    const issued = await issueCertificate(art, edition.data);
    if (!issued.ok) throw new Error(issued.error);
    const { hash } = issued.data;
    expect((await addProvenanceEvent({ artworkId: art, eventType: "exhibited", label: "Shown at the wall" })).ok).toBe(true);

    actAs(null); // /verify is public
    const cert = await verifyCertificateByHash(hash);
    expect(cert?.artworkId).toBe(art);
    const events = await getProvenanceTimeline(cert!.artworkId);
    expect(events.map((e) => e.eventType).sort()).toEqual(["certified", "exhibited"]);
    expect(Object.keys(events[0])).not.toContain("actorId");
  });

  it("others can't issue for, or add provenance to, an artwork they don't own", async () => {
    const owner = await makeUser();
    const art = await makeArtwork(owner.id);
    actAs(await makeUser());
    expect(await issueCertificate(art)).toEqual({ ok: false, error: "Artwork not found" });
    expect(await addProvenanceEvent({ artworkId: art, eventType: "exhibited", label: "x" })).toEqual({ ok: false, error: "Artwork not found" });
    expect((await addProvenanceEvent({ artworkId: art, eventType: "x" as never, label: "x" })).ok).toBe(false);
  });

  it("mint commitment reads royalty bps from the active commission_policies row and refuses a missing/zero wallet", async () => {
    const noWallet = await makeUser();
    await makeProfile(noWallet.id, { wallet: null });
    const art1 = await makeArtwork(noWallet.id);
    actAs(noWallet);
    await issueCertificate(art1);
    expect(await createMintCommitment(art1)).toMatchObject({ ok: false, error: expect.stringMatching(/wallet/i) });

    const zero = await makeUser();
    await makeProfile(zero.id, { wallet: "0x0000000000000000000000000000000000000000" });
    const art2 = await makeArtwork(zero.id);
    actAs(zero);
    await issueCertificate(art2);
    expect(await createMintCommitment(art2)).toMatchObject({ ok: false, error: expect.stringMatching(/wallet/i) });

    const ok = await makeUser();
    await makeProfile(ok.id, { wallet: WALLET });
    const art3 = await makeArtwork(ok.id);
    actAs(ok);
    await issueCertificate(art3);

    // BE-3.09/3.10: the rate comes from the active commission_policies row,
    // not an env var. Swap "active" to a fresh betest rate, restore after.
    const policyId = tid("cpol");
    await q(`update commission_policies set active = false where kind = 'mint_royalty' and active`);
    await q(
      `insert into commission_policies (id, kind, rate_bps, active, note) values ($1, 'mint_royalty', 750, true, 'betest override')`,
      [policyId]
    );
    try {
      const created = await createMintCommitment(art3);
      if (!created.ok) throw new Error(created.error);
      const { id } = created.data;
      const [row] = await q<{ erc2981_royalty_bps: number; wallet_address: string }>(
        `select erc2981_royalty_bps, wallet_address from mint_commitments where id = $1`,
        [id]
      );
      expect(row).toEqual({ erc2981_royalty_bps: 750, wallet_address: WALLET });
    } finally {
      await q(`delete from commission_policies where id = $1`, [policyId]);
      await q(`update commission_policies set active = true where kind = 'mint_royalty' and id = 'cpol_mint_v1'`);
    }

    // No active policy at all -> refuses rather than minting an undefined royalty.
    await q(`update commission_policies set active = false where kind = 'mint_royalty' and active`);
    try {
      expect(await createMintCommitment(art3)).toMatchObject({
        ok: false,
        error: expect.stringMatching(/no active commission policy/i),
      });
    } finally {
      await q(`update commission_policies set active = true where kind = 'mint_royalty' and id = 'cpol_mint_v1'`);
    }
  });
});
