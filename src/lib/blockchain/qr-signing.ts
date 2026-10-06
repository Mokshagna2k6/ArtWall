import "server-only";
import { createPrivateKey, createPublicKey, sign as edSign, verify as edVerify, randomBytes } from "node:crypto";

/**
 * BC-3.11: server-signed QR tokens for artwork tags.
 *
 * Before this module, `art_tags.tagUid` accepted any user-chosen string at
 * creation time (src/features/art-tags/actions.ts's `createTag`) — a plain
 * identity with no cryptographic binding to the server at all. A QR code
 * printed from such a value proves nothing: anyone could print a sticker
 * with a guessed or copied UID and have it resolve as if it were the real
 * tag.
 *
 * This module signs a QR payload (tag id + artwork id + issued-at) with an
 * Ed25519 key held by the KMS boundary (kms.ts's EnvMasterKeyKms stub today;
 * a real cloud KMS later — same swap-in point), so a scan can verify the
 * signature server-side before ever showing binding info, and a plain
 * unsigned string is no longer a valid tag identity for a QR-type tag.
 *
 * NFC tags (BC-3.09/3.10) use the NTAG424 SUN/CMAC scheme instead — this
 * module is specifically for QR-type art_tags, which have no onboard
 * cryptographic chip and must instead carry a server signature *in* the
 * printed payload.
 */

const QR_TOKEN_VERSION = 1;

export interface QrTokenPayload {
  tagId: string;
  artworkId: string;
  issuedAt: number; // unix seconds
}

function keyMaterial(): { privateKeyHex: string } {
  const hex = process.env.QR_SIGNING_ED25519_SEED;
  if (!hex) {
    throw new Error(
      "QR_SIGNING_ED25519_SEED is not set — QR token signing requires a KMS-held Ed25519 seed, never a hardcoded value",
    );
  }
  return { privateKeyHex: hex };
}

/** Build a Node KeyObject from a raw 32-byte Ed25519 seed (PKCS8 DER wrapping, RFC 8410). */
function privateKeyFromSeed(seedHex: string) {
  const seed = Buffer.from(seedHex, "hex");
  if (seed.length !== 32) throw new Error("QR_SIGNING_ED25519_SEED must decode to exactly 32 bytes");
  // RFC 8410 PKCS8 wrapper for a raw Ed25519 private key (fixed 16-byte
  // prefix + the 32-byte seed) — Node's crypto has no "raw seed" import, so
  // this constructs the minimal valid DER by hand rather than pulling in a
  // dependency for it.
  const pkcs8Prefix = Buffer.from("302e020100300506032b657004220420", "hex");
  return createPrivateKey({ key: Buffer.concat([pkcs8Prefix, seed]), format: "der", type: "pkcs8" });
}

function publicKeyFromSeed(seedHex: string) {
  const priv = privateKeyFromSeed(seedHex);
  return createPublicKey(priv);
}

function encodePayload(payload: QrTokenPayload): Buffer {
  return Buffer.from(JSON.stringify([QR_TOKEN_VERSION, payload.tagId, payload.artworkId, payload.issuedAt]));
}

/** Sign a fresh QR payload for (tagId, artworkId) at the current time. The
 *  returned token is the base64url(payload) + "." + base64url(signature)
 *  string that gets encoded into the printed QR code. */
export function signQrToken(tagId: string, artworkId: string): string {
  const { privateKeyHex } = keyMaterial();
  const privateKey = privateKeyFromSeed(privateKeyHex);
  const payload: QrTokenPayload = { tagId, artworkId, issuedAt: Math.floor(Date.now() / 1000) };
  const encoded = encodePayload(payload);
  const signature = edSign(null, encoded, privateKey);
  return `${encoded.toString("base64url")}.${signature.toString("base64url")}`;
}

export type QrVerdict =
  | { ok: true; payload: QrTokenPayload }
  | { ok: false; reason: "malformed" | "bad_signature" };

/** Verify a scanned QR token's signature before trusting its tagId/artworkId. */
export function verifyQrToken(token: string): QrVerdict {
  const { privateKeyHex } = keyMaterial();
  const parts = token.split(".");
  if (parts.length !== 2) return { ok: false, reason: "malformed" };

  let encoded: Buffer;
  let signature: Buffer;
  try {
    encoded = Buffer.from(parts[0], "base64url");
    signature = Buffer.from(parts[1], "base64url");
  } catch {
    return { ok: false, reason: "malformed" };
  }

  const publicKey = publicKeyFromSeed(privateKeyHex);
  const valid = edVerify(null, encoded, publicKey, signature);
  if (!valid) return { ok: false, reason: "bad_signature" };

  let parsed: unknown;
  try {
    parsed = JSON.parse(encoded.toString());
  } catch {
    return { ok: false, reason: "malformed" };
  }
  if (!Array.isArray(parsed) || parsed.length !== 4 || parsed[0] !== QR_TOKEN_VERSION) {
    return { ok: false, reason: "malformed" };
  }
  const [, tagId, artworkId, issuedAt] = parsed;
  if (typeof tagId !== "string" || typeof artworkId !== "string" || typeof issuedAt !== "number") {
    return { ok: false, reason: "malformed" };
  }

  return { ok: true, payload: { tagId, artworkId, issuedAt } };
}

/** Generate a fresh random 32-byte Ed25519 seed, hex-encoded — a convenience
 *  for provisioning QR_SIGNING_ED25519_SEED once at setup time (run once,
 *  store the output in the secret manager, never in code or the DB). */
export function generateQrSigningSeed(): string {
  return randomBytes(32).toString("hex");
}
