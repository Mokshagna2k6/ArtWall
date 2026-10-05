import { NextRequest } from "next/server";
import { afterAll, describe, expect, it, vi } from "vitest";

import { actAs } from "@/test/db-setup";
import { makeArtwork, makeProfile, makeUser, purgeTestData, q, tid } from "@/test/fixtures";

/**
 * BE-3.03/BE-3.05: mint-voucher calls canMint, assembled from the real
 * trust dimensions (loadTrustDimensions) — never a shortcut like "certificate
 * exists". A pinned-but-unverified certificate must be refused; verifying
 * identity (and nothing else) must make the identical request succeed.
 */
vi.hoisted(() => {
  Object.assign(process.env, {
    MINT_SIGNER_PRIVATE_KEY: "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80",
    NEXT_PUBLIC_NFT_CONTRACT_ADDRESS: "0x5fbdb2315678afecb367f032d93f642f64180aa3",
    NEXT_PUBLIC_DEFAULT_CHAIN_ID: "84532",
  });
});

const { POST: voucher } = await import("@/app/api/blockchain/certificates/[id]/mint-voucher/route");

afterAll(purgeTestData);

const WALLET = "0x1111111111111111111111111111111111111111";
const post = (body: unknown) =>
  new NextRequest("http://localhost/api", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
const params = (id: string) => ({ params: Promise.resolve({ id }) });
const voucherBody = { to: WALLET, royaltyReceiver: WALLET, royaltyFeeBps: 500 };

describe("mint-voucher policy gate (BE-3.03/BE-3.05)", () => {
  it("rejects with IDENTITY_NOT_VERIFIED for a pinned certificate whose owner is unverified", async () => {
    const artist = await makeUser();
    const art = await makeArtwork(artist.id);
    const certId = tid("coa");
    await q(
      `insert into coa_certificates (id, artwork_id, user_id, metadata_hash, status, "metadataUri")
       values ($1, $2, $3, $1, 'metadata_pinned', 'ipfs://x')`,
      [certId, art, artist.id]
    );
    actAs(artist);

    const res = await voucher(post(voucherBody), params(certId));
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error.details).toMatch(/IDENTITY_NOT_VERIFIED/);

    const logged = await q<{ allowed: boolean; reasons: string[] }>(
      `select allowed, reasons from policy_decisions where gate = 'canMint' and subject_id = $1 order by decided_at desc limit 1`,
      [certId]
    );
    expect(logged[0]?.allowed).toBe(false);
    expect(logged[0]?.reasons).toContain("IDENTITY_NOT_VERIFIED");

    // Nothing was mutated: the certificate is still exactly as it was.
    const [row] = await q<{ status: string; mintNonce: string | null }>(
      `select status, "mintNonce" from coa_certificates where id = $1`,
      [certId]
    );
    expect(row).toMatchObject({ status: "metadata_pinned", mintNonce: null });
  });

  it("the identical request succeeds once identity is verified, and the allow is logged", async () => {
    const artist = await makeUser();
    // BC-1.15: mint-voucher now derives `to`/`royaltyReceiver` from the
    // certificate owner's own registered wallet (never the request body),
    // so this fixture needs an artist_profiles row with a wallet, same as
    // nft-routes.db.test.ts's pinnedCert helper.
    await makeProfile(artist.id, { wallet: WALLET });
    const art = await makeArtwork(artist.id);
    const certId = tid("coa");
    await q(
      `insert into coa_certificates (id, artwork_id, user_id, metadata_hash, status, "metadataUri")
       values ($1, $2, $3, $1, 'metadata_pinned', 'ipfs://x')`,
      [certId, art, artist.id]
    );
    await q(`update "user" set identity_verified = true where id = $1`, [artist.id]);
    actAs(artist);

    const res = await voucher(post(voucherBody), params(certId));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.voucher).toBeTruthy();

    const logged = await q<{ allowed: boolean }>(
      `select allowed from policy_decisions where gate = 'canMint' and subject_id = $1 order by decided_at desc limit 1`,
      [certId]
    );
    expect(logged[0]?.allowed).toBe(true);
  });
});
