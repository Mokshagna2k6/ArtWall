import { NextRequest } from "next/server";
import { privateKeyToAccount } from "viem/accounts";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

import { actAs } from "@/test/db-setup";
import { makeArtwork, makeProfile, makeUser, purgeTestData, q } from "@/test/fixtures";

/**
 * The four /api/blockchain routes that had NO test at all: wallet/nonce,
 * wallet/link, ipfs/upload and certificates/[id] (PATCH). Together they are
 * 217 of the 638 lines under src/app/api/blockchain/**, which is why that
 * path sat below its coverage floor — the floor was measured when fewer
 * routes existed, and these were added without tests.
 *
 * These are not coverage filler. Each one asserts a security property the
 * route exists to enforce: that an unauthenticated caller is refused, that a
 * wallet is only linked on proof of signature, that the uploader sniffs real
 * magic bytes instead of trusting the client's Content-Type, and that a
 * certificate PATCH cannot touch somebody else's row.
 *
 * Only the outside world is faked (Pinata). The wallet challenge is signed
 * with a real key and verified for real.
 */
vi.hoisted(() => {
  Object.assign(process.env, {
    WALLET_LINK_SECRET: "test-wallet-link-secret",
    NEXT_PUBLIC_NFT_CONTRACT_ADDRESS: "0x5fbdb2315678afecb367f032d93f642f64180aa3",
    NEXT_PUBLIC_DEFAULT_CHAIN_ID: "84532",
  });
});

const pinata = vi.hoisted(() => ({ cid: "" as string, lastFile: null as File | null }));
vi.mock("@/lib/blockchain/pinata", () => ({
  pinata: {
    upload: {
      public: {
        file: vi.fn(async (file: File) => {
          pinata.lastFile = file;
          return { cid: pinata.cid };
        }),
      },
    },
  },
}));

const { POST: nonce } = await import("@/app/api/blockchain/wallet/nonce/route");
const { POST: link } = await import("@/app/api/blockchain/wallet/link/route");
const { POST: upload } = await import("@/app/api/blockchain/ipfs/upload/route");
const { PATCH: patchCert } = await import("@/app/api/blockchain/certificates/[id]/route");
const { createWalletLinkChallenge } = await import("@/lib/blockchain/wallet-link");

/** anvil's well-known dev account #0 — a real key, so signatures are real. */
const WALLET_KEY = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80" as const;
const wallet = privateKeyToAccount(WALLET_KEY);

/** A 1x1 PNG. Real magic bytes, so the sniffer accepts it. */
const PNG = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
  0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4,
  0x89,
]);

function jsonReq(url: string, body: unknown): NextRequest {
  return new NextRequest(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

afterAll(purgeTestData);
beforeEach(() => {
  pinata.cid = "";
  pinata.lastFile = null;
  actAs(null);
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("wallet linking (BC-2.11)", () => {
  it("refuses an unauthenticated caller at both steps", async () => {
    const n = await nonce(
      jsonReq("http://t/api/blockchain/wallet/nonce", { walletAddress: wallet.address })
    );
    expect(n.status).toBe(401);
    const l = await link(
      jsonReq("http://t/api/blockchain/wallet/link", {
        walletAddress: wallet.address,
        nonce: "x",
        expiresAt: Date.now() + 60_000,
        signature: "0xdeadbeef",
      })
    );
    expect(l.status).toBe(401);
  });

  it("rejects a malformed wallet address", async () => {
    actAs(await makeUser());
    const res = await nonce(
      jsonReq("http://t/api/blockchain/wallet/nonce", { walletAddress: "not-an-address" })
    );
    // validation_failed is 422 in lib/blockchain/http.ts, not 400.
    expect(res.status).toBe(422);
  });

  it("issues a challenge naming the wallet it is for", async () => {
    const user = await makeUser();
    actAs(user);
    const res = await nonce(
      jsonReq("http://t/api/blockchain/wallet/nonce", { walletAddress: wallet.address })
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { message: string; nonce: string; expiresAt: number };
    expect(body.message).toContain(wallet.address);
    expect(body.nonce).toBeTruthy();
    expect(body.expiresAt).toBeGreaterThan(Date.now());
  });

  it("links the wallet when the challenge is signed by that wallet", async () => {
    const user = await makeUser();
    await makeProfile(user.id);
    actAs(user);

    const challenge = createWalletLinkChallenge(user.id, wallet.address);
    const signature = await wallet.signMessage({ message: challenge.message });

    const res = await link(
      jsonReq("http://t/api/blockchain/wallet/link", {
        walletAddress: wallet.address,
        nonce: challenge.nonce,
        expiresAt: challenge.expiresAt,
        signature,
      })
    );
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({ walletAddress: wallet.address });

    const rows = await q<{ wallet_address: string }>(
      `select wallet_address from artist_profiles where "userId" = $1`,
      [user.id]
    );
    expect(rows[0]?.wallet_address).toBe(wallet.address);
  });

  it("refuses a signature from a DIFFERENT wallet and writes nothing", async () => {
    const user = await makeUser();
    await makeProfile(user.id);
    actAs(user);

    // Challenge issued for `wallet`, but signed by a different key: this is
    // the attack the whole two-step flow exists to stop.
    const other = privateKeyToAccount(
      "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d"
    );
    const challenge = createWalletLinkChallenge(user.id, wallet.address);
    const signature = await other.signMessage({ message: challenge.message });

    const res = await link(
      jsonReq("http://t/api/blockchain/wallet/link", {
        walletAddress: wallet.address,
        nonce: challenge.nonce,
        expiresAt: challenge.expiresAt,
        signature,
      })
    );
    expect(res.status).toBe(422);

    const rows = await q<{ wallet_address: string | null }>(
      `select wallet_address from artist_profiles where "userId" = $1`,
      [user.id]
    );
    expect(rows[0]?.wallet_address).toBeNull();
  });

  it("refuses an expired challenge", async () => {
    const user = await makeUser();
    await makeProfile(user.id);
    actAs(user);

    const challenge = createWalletLinkChallenge(user.id, wallet.address);
    const signature = await wallet.signMessage({ message: challenge.message });

    const res = await link(
      jsonReq("http://t/api/blockchain/wallet/link", {
        walletAddress: wallet.address,
        nonce: challenge.nonce,
        expiresAt: Date.now() - 1000,
        signature,
      })
    );
    expect(res.status).toBe(422);
  });
});

describe("ipfs upload (SEC-2.07 / BC-1.20 / BC-2.08)", () => {
  async function postFile(file: File | null) {
    const form = new FormData();
    if (file) form.set("file", file);
    return upload(
      new NextRequest("http://t/api/blockchain/ipfs/upload", { method: "POST", body: form })
    );
  }

  it("refuses an unauthenticated caller", async () => {
    expect((await postFile(new File([PNG], "a.png"))).status).toBe(401);
  });

  it("rejects a request with no file", async () => {
    actAs(await makeUser());
    expect((await postFile(null)).status).toBe(422);
  });

  it("sniffs the real bytes rather than trusting the declared type", async () => {
    actAs(await makeUser());
    // Claims to be a PNG; the bytes are a text payload. Trusting file.type
    // here is exactly the bug SEC-2.07 forbids.
    const liar = new File([new TextEncoder().encode("not an image at all")], "evil.png", {
      type: "image/png",
    });
    expect((await postFile(liar)).status).toBe(415);
  });

  it("refuses a CID that does not correspond to the uploaded bytes (BC-2.08)", async () => {
    actAs(await makeUser());
    // A well-formed CID that is not this file's: the route re-derives the CID
    // from the bytes it sent and must reject the mismatch rather than hand
    // back a CID it has not verified.
    pinata.cid = "bafkreiaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
    const res = await postFile(new File([PNG], "ok.png", { type: "image/png" }));
    expect(res.status).toBe(500);
  });
});

describe("PATCH /api/blockchain/certificates/[id]", () => {
  const TX = `0x${"a".repeat(64)}`;

  /**
   * coa_certificates mixes naming conventions (user_id/artwork_id snake_case,
   * txHash camelCase) and artwork_id is NOT NULL, so a certificate needs a
   * real artwork. The betest_ prefix is what purgeTestData cleans up.
   */
  async function makeCert(userId: string, status: string) {
    const artworkId = await makeArtwork(userId);
    const id = `betest_cert_${Math.random().toString(16).slice(2, 10)}`;
    await q(
      `insert into coa_certificates (id, user_id, artwork_id, metadata_hash, status)
       values ($1, $2, $3, $4, $5)`,
      [id, userId, artworkId, `hash_${id}`, status]
    );
    return id;
  }

  function patch(id: string, body: unknown) {
    return patchCert(jsonReq(`http://t/api/blockchain/certificates/${id}`, body), {
      params: Promise.resolve({ id }),
    });
  }

  it("refuses an unauthenticated caller", async () => {
    expect((await patch("whatever", { txHash: TX })).status).toBe(401);
  });

  it("moves a metadata_pinned certificate to minting and records the tx", async () => {
    const user = await makeUser();
    actAs(user);
    const id = await makeCert(user.id, "metadata_pinned");

    const res = await patch(id, { txHash: `0x${"A".repeat(64)}` });
    expect(res.status).toBe(200);

    const rows = await q<{ status: string; tx_hash: string }>(
      `select status, "txHash" as tx_hash from coa_certificates where id = $1`,
      [id]
    );
    expect(rows[0]?.status).toBe("minting");
    // Stored lower-cased, so later lookups by hash cannot miss on case.
    expect(rows[0]?.tx_hash).toBe(TX);
  });

  it("refuses a status it cannot start a mint from", async () => {
    const user = await makeUser();
    actAs(user);
    const id = await makeCert(user.id, "draft");
    expect((await patch(id, { txHash: TX })).status).toBe(409);
  });

  it("rejects a value that is not a transaction hash", async () => {
    const user = await makeUser();
    actAs(user);
    const id = await makeCert(user.id, "metadata_pinned");
    // Zod rejection also surfaces as validation_failed (422).
    expect((await patch(id, { txHash: "0x123" })).status).toBe(422);
  });

  it("cannot touch another user's certificate (IDOR)", async () => {
    const owner = await makeUser();
    const attacker = await makeUser();
    const id = await makeCert(owner.id, "metadata_pinned");

    actAs(attacker);
    // 404, not 403: the row is scoped by userId in the WHERE clause, so an
    // attacker cannot even learn that this certificate exists.
    expect((await patch(id, { txHash: TX })).status).toBe(404);

    const rows = await q<{ status: string }>(
      `select status from coa_certificates where id = $1`,
      [id]
    );
    expect(rows[0]?.status).toBe("metadata_pinned");
  });
});
