import "server-only";

import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * QR tokens (C06, F15).
 *
 * Dropping NFC removed its tamper-proof crypto, so the QR has to carry its own.
 * A token here is two parts: an unguessable random id, and an HMAC over that id
 * keyed to this deployment's secret.
 *
 *   <base64url(16 random bytes)>.<base64url(96-bit HMAC)>
 *
 * Two properties follow, and both matter at a restaurant counter:
 *
 *  - **Nothing personal is in the code.** A token names a row, not a person. A
 *    photographed QR reveals no name, phone or booking value (spec §8.5,
 *    privacy-by-design).
 *  - **Garbage is rejected without a database hit.** Signature first, lookup
 *    second, so someone spraying made-up codes at /q/ costs us CPU and not a
 *    connection.
 *
 * Revocation still needs the database — a signature cannot expire itself — which
 * is why `pw_qr_tokens` exists alongside this.
 */

const TOKEN_VERSION_BYTES = 16;
const SIGNATURE_BYTES = 12;

/**
 * The signing key, derived from the app secret rather than being the secret.
 *
 * A separate key per purpose means a QR token can never be replayed as a
 * session cookie or vice versa, even though both trace back to one env var.
 */
function signingKey(): Buffer {
  const secret = process.env.BETTER_AUTH_SECRET;
  if (!secret) {
    throw new Error(
      "BETTER_AUTH_SECRET is required to mint physical-wall QR tokens."
    );
  }
  return createHash("sha256").update(`${secret}:physical-wall:qr:v1`).digest();
}

function b64url(buffer: Buffer): string {
  return buffer.toString("base64url");
}

function sign(id: string): string {
  return b64url(
    createHmac("sha256", signingKey()).update(id).digest().subarray(0, SIGNATURE_BYTES)
  );
}

/** A fresh token. The caller is responsible for storing it in pw_qr_tokens. */
export function mintQrToken(): string {
  const id = b64url(randomBytes(TOKEN_VERSION_BYTES));
  return `${id}.${sign(id)}`;
}

/**
 * Is this token one we minted?
 *
 * Compared in constant time. A fast-path `===` would leak, through timing, how
 * much of a forged signature was correct — enough, given unlimited attempts, to
 * reconstruct a valid one byte by byte.
 */
export function verifyQrToken(token: string | undefined | null): boolean {
  if (!token) return false;

  const parts = token.split(".");
  if (parts.length !== 2) return false;

  const [id, signature] = parts;
  if (!id || !signature) return false;

  const expected = Buffer.from(sign(id));
  const actual = Buffer.from(signature);
  if (expected.length !== actual.length) return false;

  return timingSafeEqual(expected, actual);
}

/**
 * The full URL printed on a label or shown to a visitor.
 *
 * Deliberately at the site root rather than under /physical-wall: this string
 * gets printed onto a sticker beside an artwork, and every character is more
 * QR density and one more thing to smudge.
 */
export function qrUrl(token: string, origin: string): string {
  return `${origin.replace(/\/$/, "")}/q/${token}`;
}
