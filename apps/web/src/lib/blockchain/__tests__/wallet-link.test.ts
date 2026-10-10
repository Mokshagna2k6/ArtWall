import { describe, it, expect } from "vitest";
import { privateKeyToAccount, generatePrivateKey } from "viem/accounts";
import {
  createWalletLinkChallenge,
  verifyWalletLinkSignature,
} from "@/lib/blockchain/wallet-link";

/**
 * BC-2.11: SIWE-style wallet linking. These tests sign the real challenge
 * message with a real secp256k1 key (viem's local account signer) and
 * verify end-to-end — not mocked — that only a signature from the actual
 * wallet, over the exact issued challenge, within its validity window,
 * succeeds.
 */
describe("wallet-link (BC-2.11)", () => {
  const account = privateKeyToAccount(generatePrivateKey());
  const impostor = privateKeyToAccount(generatePrivateKey());
  const userId = "user_123";

  it("accepts a real signature from the claimed wallet over its own challenge", async () => {
    const challenge = createWalletLinkChallenge(userId, account.address);
    const signature = await account.signMessage({ message: challenge.message });

    const verdict = await verifyWalletLinkSignature({
      userId,
      walletAddress: account.address,
      nonce: challenge.nonce,
      expiresAt: challenge.expiresAt,
      signature,
    });
    expect(verdict.ok).toBe(true);
  });

  it("rejects a signature from a different wallet than the one claimed", async () => {
    const challenge = createWalletLinkChallenge(userId, account.address);
    // The impostor signs the exact same challenge text, but is not the
    // wallet the challenge (and the DB write) claims to be proving.
    const signature = await impostor.signMessage({ message: challenge.message });

    const verdict = await verifyWalletLinkSignature({
      userId,
      walletAddress: account.address,
      nonce: challenge.nonce,
      expiresAt: challenge.expiresAt,
      signature,
    });
    expect(verdict.ok).toBe(false);
  });

  it("rejects an expired challenge even with a valid signature", async () => {
    const challenge = createWalletLinkChallenge(userId, account.address);
    const signature = await account.signMessage({ message: challenge.message });

    const verdict = await verifyWalletLinkSignature({
      userId,
      walletAddress: account.address,
      nonce: challenge.nonce,
      expiresAt: Date.now() - 1, // already expired
      signature,
    });
    expect(verdict.ok).toBe(false);
  });

  it("rejects a nonce replayed against a different wallet address", async () => {
    const challenge = createWalletLinkChallenge(userId, account.address);
    const signature = await account.signMessage({ message: challenge.message });

    // Same nonce/signature, but claiming it proves ownership of a
    // DIFFERENT wallet address than the one the challenge was issued for.
    const verdict = await verifyWalletLinkSignature({
      userId,
      walletAddress: impostor.address,
      nonce: challenge.nonce,
      expiresAt: challenge.expiresAt,
      signature,
    });
    expect(verdict.ok).toBe(false);
  });

  it("rejects a nonce replayed against a different user id", async () => {
    const challenge = createWalletLinkChallenge(userId, account.address);
    const signature = await account.signMessage({ message: challenge.message });

    const verdict = await verifyWalletLinkSignature({
      userId: "user_456", // a different account trying to reuse the same challenge
      walletAddress: account.address,
      nonce: challenge.nonce,
      expiresAt: challenge.expiresAt,
      signature,
    });
    expect(verdict.ok).toBe(false);
  });

  it("rejects a tampered expiresAt (nonce no longer matches)", async () => {
    const challenge = createWalletLinkChallenge(userId, account.address);
    const signature = await account.signMessage({ message: challenge.message });

    const verdict = await verifyWalletLinkSignature({
      userId,
      walletAddress: account.address,
      nonce: challenge.nonce,
      expiresAt: challenge.expiresAt + 60_000, // tries to extend validity
      signature,
    });
    expect(verdict.ok).toBe(false);
  });
});
