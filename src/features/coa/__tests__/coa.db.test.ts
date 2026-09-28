import { afterAll, afterEach, describe, expect, it } from "vitest";

import { actAs } from "@/test/db-setup";
import { makeArtwork, makeProfile, makeUser, purgeTestData, q } from "@/test/fixtures";
import {
  addProvenanceEvent,
  createEdition,
  createMintCommitment,
  getProvenanceTimeline,
  issueCertificate,
  verifyCertificateByHash,
} from "@/features/coa/actions";

afterAll(purgeTestData);
afterEach(() => {
  delete process.env.MINT_ROYALTY_BPS;
});

const WALLET = "0x1111111111111111111111111111111111111111";

describe("COA / provenance (BE-1.17 – 1.20)", () => {
  it("issue → provenance → edition; /verify returns every event for the certificate's artwork", async () => {
    const artist = await makeUser();
    await makeProfile(artist.id, { wallet: WALLET });
    const art = await makeArtwork(artist.id);
    actAs(artist);

    const edition = await createEdition({ artworkId: art, editionType: "limited", totalEditions: 5 });
    const { hash } = await issueCertificate(art, edition);
    await addProvenanceEvent({ artworkId: art, eventType: "exhibited", label: "Shown at the wall" });

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
    await expect(issueCertificate(art)).rejects.toThrow();
    await expect(addProvenanceEvent({ artworkId: art, eventType: "x", label: "x" })).rejects.toThrow();
  });

  it("mint commitment reads royalty bps from MINT_ROYALTY_BPS and refuses a missing/zero wallet", async () => {
    const noWallet = await makeUser();
    await makeProfile(noWallet.id, { wallet: null });
    const art1 = await makeArtwork(noWallet.id);
    actAs(noWallet);
    await issueCertificate(art1);
    await expect(createMintCommitment(art1)).rejects.toThrow(/wallet/i);

    const zero = await makeUser();
    await makeProfile(zero.id, { wallet: "0x0000000000000000000000000000000000000000" });
    const art2 = await makeArtwork(zero.id);
    actAs(zero);
    await issueCertificate(art2);
    await expect(createMintCommitment(art2)).rejects.toThrow(/wallet/i);

    const ok = await makeUser();
    await makeProfile(ok.id, { wallet: WALLET });
    const art3 = await makeArtwork(ok.id);
    actAs(ok);
    await issueCertificate(art3);
    process.env.MINT_ROYALTY_BPS = "750";
    const { id } = await createMintCommitment(art3);
    const [row] = await q<{ erc2981_royalty_bps: number; wallet_address: string }>(
      `select erc2981_royalty_bps, wallet_address from mint_commitments where id = $1`,
      [id]
    );
    expect(row).toEqual({ erc2981_royalty_bps: 750, wallet_address: WALLET });

    process.env.MINT_ROYALTY_BPS = "20000";
    await expect(createMintCommitment(art3)).rejects.toThrow(/MINT_ROYALTY_BPS/);
  });
});
