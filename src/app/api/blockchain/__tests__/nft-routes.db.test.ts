import { NextRequest } from "next/server";
import { recoverTypedDataAddress } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

import { actAs } from "@/test/db-setup";
import { makeArtwork, makeUser, purgeTestData, q } from "@/test/fixtures";

/**
 * The NFT routes (/api/blockchain/**) against the real database. Only the
 * outside world is faked: Pinata (IPFS) and the chain RPC (verifyMintTx).
 * The signer is a well-known test key, so the voucher signature is checked
 * for real.
 */
const env = vi.hoisted(() => {
  const values = {
    MINT_SIGNER_PRIVATE_KEY: "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80",
    NEXT_PUBLIC_NFT_CONTRACT_ADDRESS: "0x5fbdb2315678afecb367f032d93f642f64180aa3",
    NEXT_PUBLIC_DEFAULT_CHAIN_ID: "84532",
    CRON_SECRET: "test-cron-secret",
  };
  Object.assign(process.env, values);
  return values;
});

const chain = vi.hoisted(() => ({
  verdict: { state: "pending" } as Record<string, unknown>,
  /** Per-tx verdicts: the cron scans every stale mint in the database, not just ours. */
  byHash: {} as Record<string, Record<string, unknown>>,
}));
vi.mock("@/lib/blockchain/chain", async (original) => ({
  ...(await original<typeof import("@/lib/blockchain/chain")>()),
  verifyMintTx: vi.fn(async (hash: string) => chain.byHash[hash] ?? chain.verdict),
}));
vi.mock("@/lib/blockchain/pinata", () => ({
  pinata: { upload: { public: { json: vi.fn(async () => ({ cid: "bafytestmetadata" })) } } },
}));

const { POST: createCert } = await import("@/app/api/blockchain/certificates/route");
const { POST: voucher } = await import("@/app/api/blockchain/certificates/[id]/mint-voucher/route");
const { POST: confirm } = await import("@/app/api/blockchain/certificates/[id]/confirm/route");
const { GET: reconcile } = await import("@/app/api/blockchain/cron/reconcile-mints/route");
const { MINT_VOUCHER_DOMAIN, MINT_VOUCHER_TYPES } = await import("@/lib/blockchain/abi");

afterAll(purgeTestData);
beforeEach(() => {
  chain.verdict = { state: "pending" };
  vi.spyOn(console, "error").mockImplementation(() => {});
});

const WALLET = "0x1111111111111111111111111111111111111111";
const post = (body: unknown) =>
  new NextRequest("http://localhost/api", { method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json" } });
const params = (id: string) => ({ params: Promise.resolve({ id }) });
const voucherBody = { to: WALLET, royaltyReceiver: WALLET, royaltyFeeBps: 500 };

async function pinnedCert() {
  const artist = await makeUser();
  const art = await makeArtwork(artist.id);
  actAs(artist);
  const res = await createCert(post({ artworkId: art, imageCid: "bafyimage", creatorName: "Asha" }));
  expect(res.status).toBe(200);
  const { id, metadataUri } = await res.json();
  expect(metadataUri).toBe("ipfs://bafytestmetadata");
  return { artist, art, id: id as string };
}

const statusOf = async (id: string) => (await q<{ status: string }>(`select status from coa_certificates where id = $1`, [id]))[0].status;

describe("NFT routes (/api/blockchain)", () => {
  it("create: signed-in owner only, validated body, pins metadata and stores the certificate", async () => {
    actAs(null);
    expect((await createCert(post({}))).status).toBe(401);

    const { artist, art, id } = await pinnedCert();
    const [row] = await q<{ user_id: string; status: string; metadataCid: string }>(
      `select user_id, status, "metadataCid" from coa_certificates where id = $1`,
      [id]
    );
    expect(row).toMatchObject({ user_id: artist.id, status: "metadata_pinned", metadataCid: "bafytestmetadata" });

    expect((await createCert(post({ artworkId: "" }))).status).toBe(422);
    actAs(await makeUser()); // someone else's artwork
    expect((await createCert(post({ artworkId: art, imageCid: "c", creatorName: "n" }))).status).toBe(404);
  });

  it("mint-voucher: signs an EIP-712 voucher the contract's signer recovers; refuses others, bad input and done certs", async () => {
    const { artist, id } = await pinnedCert();
    // BE-3.03/BE-3.05: mint-voucher now runs canMint, which reads real
    // identityVerified off the user row — a voucher is a server signature
    // authorising an on-chain mint, so the policy gate must see a verified
    // identity, not just a pinned certificate.
    await q(`update "user" set identity_verified = true where id = $1`, [artist.id]);

    actAs(null);
    expect((await voucher(post(voucherBody), params(id))).status).toBe(401);
    actAs(await makeUser());
    expect((await voucher(post(voucherBody), params(id))).status).toBe(404);

    actAs(artist);
    expect((await voucher(post({ ...voucherBody, to: "not-an-address" }), params(id))).status).toBe(422);
    expect((await voucher(post({ ...voucherBody, royaltyFeeBps: 10_001 }), params(id))).status).toBe(422);

    const res = await voucher(post(voucherBody), params(id));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.voucher.uri).toBe("ipfs://bafytestmetadata");
    const signer = await recoverTypedDataAddress({
      domain: { ...MINT_VOUCHER_DOMAIN, chainId: 84532, verifyingContract: env.NEXT_PUBLIC_NFT_CONTRACT_ADDRESS as `0x${string}` },
      types: MINT_VOUCHER_TYPES,
      primaryType: "MintVoucher",
      message: { ...body.voucher, royaltyFeeBps: BigInt(body.voucher.royaltyFeeBps), deadline: BigInt(body.voucher.deadline) },
      signature: body.signature,
    });
    expect(signer).toBe(privateKeyToAccount(env.MINT_SIGNER_PRIVATE_KEY as `0x${string}`).address);
    const [{ mintNonce }] = await q<{ mintNonce: string }>(`select "mintNonce" from coa_certificates where id = $1`, [id]);
    expect(mintNonce).toBe(body.voucher.nonce);

    // A revoked certificate is never put back into the mint flow.
    await q(`update coa_certificates set status = 'revoked', revoked_at = now() where id = $1`, [id]);
    expect((await voucher(post(voucherBody), params(id))).status).toBe(409);
    expect(await statusOf(id)).toBe("revoked");
  });

  it("confirm: pending stays minting, a failed tx is recorded, a confirmed one is minted once", async () => {
    const { id } = await pinnedCert();
    expect((await confirm(post({}), params(id))).status).toBe(409); // no mint in progress

    await q(`update coa_certificates set status = 'minting', "txHash" = $2, "mintRequestedAt" = now() where id = $1`, [id, `0x${"ab".repeat(32)}`]);
    expect(await (await confirm(post({}), params(id))).json()).toEqual({ status: "minting" });

    chain.verdict = { state: "confirmed", tokenId: "7", contractAddr: env.NEXT_PUBLIC_NFT_CONTRACT_ADDRESS, chainId: 84532 };
    expect(await (await confirm(post({}), params(id))).json()).toEqual({ status: "minted", tokenId: "7" });
    expect(await statusOf(id)).toBe("minted");
    // Idempotent once minted: no second chain lookup changes it.
    chain.verdict = { state: "failed", reason: "x" };
    expect(await (await confirm(post({}), params(id))).json()).toEqual({ status: "minted", tokenId: "7" });

    const other = await pinnedCert();
    await q(`update "user" set identity_verified = true where id = $1`, [other.artist.id]);
    await q(`update coa_certificates set status = 'minting', "txHash" = $2 where id = $1`, [other.id, `0x${"cd".repeat(32)}`]);
    chain.verdict = { state: "failed", reason: "transaction reverted" };
    expect(await (await confirm(post({}), params(other.id))).json()).toEqual({ status: "failed", error: "transaction reverted" });
    expect((await voucher(post(voucherBody), params(other.id))).status).toBe(200); // failed → retry with a fresh voucher
  });

  it("reconcile-mints cron: needs the secret; settles stale 'minting' certificates", async () => {
    const { id } = await pinnedCert();
    const tx = `0x${"ef".repeat(32)}`;
    await q(
      `update coa_certificates set status = 'minting', "txHash" = $2, "mintRequestedAt" = now() - interval '5 minutes' where id = $1`,
      [id, tx]
    );
    const cron = (auth?: string) =>
      reconcile(new Request("http://localhost/api/cron", { headers: auth ? { authorization: auth } : {} }));

    expect((await cron()).status).toBe(401);
    expect((await cron("Bearer wrong")).status).toBe(401);

    chain.byHash[tx] = { state: "confirmed", tokenId: "8", contractAddr: env.NEXT_PUBLIC_NFT_CONTRACT_ADDRESS, chainId: 84532 };
    const res = await cron(`Bearer ${env.CRON_SECRET}`);
    expect(res.status).toBe(200);
    expect((await res.json()).minted).toBeGreaterThanOrEqual(1);
    expect(await statusOf(id)).toBe("minted");
  });
});
