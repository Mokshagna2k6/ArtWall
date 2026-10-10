import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { verifyMessage, type Address } from "viem";

/**
 * BC-2.11: SIWE-style wallet linking. Before a wallet address is stored
 * against a user (artist_profiles.wallet_address — the address the mint
 * voucher route mints to and pays royalties to), the user must sign a
 * server-issued, time-bound challenge message with that wallet's private
 * key, proving they actually control it. Without this, anyone could type a
 * stranger's public address into a form and redirect that stranger's future
 * NFT mints/royalties to themselves.
 *
 * The nonce is a stateless HMAC token (userId + walletAddress + expiry,
 * signed with BETTER_AUTH_SECRET — the same server secret rate-limit.ts
 * already uses for its own HMAC keys) rather than a DB-stored one: it needs
 * no schema migration, cannot be forged without the server secret, and
 * expires on its own. A nonce is scoped to one (userId, walletAddress) pair
 * so it cannot be replayed to link a different wallet than the one the
 * challenge was issued for.
 */

const NONCE_TTL_MS = 10 * 60 * 1000; // 10 minutes to connect a wallet and sign

function secret(): string {
  return process.env.BETTER_AUTH_SECRET ?? "artwall-wallet-link";
}

function sign(payload: string): string {
  return createHmac("sha256", secret()).update(payload).digest("hex");
}

export interface WalletLinkChallenge {
  nonce: string;
  message: string;
  expiresAt: number;
}

/** Issue a fresh challenge message for `userId` to prove ownership of `walletAddress`. */
export function createWalletLinkChallenge(userId: string, walletAddress: Address): WalletLinkChallenge {
  const expiresAt = Date.now() + NONCE_TTL_MS;
  const payload = `${userId}:${walletAddress.toLowerCase()}:${expiresAt}`;
  const nonce = sign(payload);
  const message =
    `artwall.in wants you to link this wallet to your ArtWall account.\n\n` +
    `Address: ${walletAddress}\n` +
    `Nonce: ${nonce}\n` +
    `Expires: ${new Date(expiresAt).toISOString()}`;
  return { nonce, message, expiresAt };
}

function constantTimeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a, "hex"), Buffer.from(b, "hex"));
}

/** Re-derive the expected nonce for (userId, walletAddress, expiresAt) and
 *  compare in constant time — this is what makes the nonce unforgeable
 *  without the server secret and unreusable for any other user/wallet/time. */
function expectedNonce(userId: string, walletAddress: Address, expiresAt: number): string {
  return sign(`${userId}:${walletAddress.toLowerCase()}:${expiresAt}`);
}

export type WalletLinkVerdict = { ok: true } | { ok: false; reason: string };

/**
 * Verify that `signature` is a real signature by `walletAddress` over the
 * exact challenge message issued for (userId, walletAddress, expiresAt, nonce)
 * — rejecting an expired challenge, a tampered nonce/expiry, or a signature
 * from a different wallet (BC-2.11).
 */
export async function verifyWalletLinkSignature(params: {
  userId: string;
  walletAddress: Address;
  nonce: string;
  expiresAt: number;
  signature: `0x${string}`;
}): Promise<WalletLinkVerdict> {
  const { userId, walletAddress, nonce, expiresAt, signature } = params;

  if (Date.now() > expiresAt) {
    return { ok: false, reason: "challenge expired, request a new one" };
  }

  const expected = expectedNonce(userId, walletAddress, expiresAt);
  if (!constantTimeEqualHex(nonce, expected)) {
    return { ok: false, reason: "invalid or tampered challenge" };
  }

  const message =
    `artwall.in wants you to link this wallet to your ArtWall account.\n\n` +
    `Address: ${walletAddress}\n` +
    `Nonce: ${nonce}\n` +
    `Expires: ${new Date(expiresAt).toISOString()}`;

  const valid = await verifyMessage({ address: walletAddress, message, signature }).catch(() => false);
  if (!valid) return { ok: false, reason: "signature does not match this wallet address" };

  return { ok: true };
}
