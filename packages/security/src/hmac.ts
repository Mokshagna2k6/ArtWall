import { createHmac, timingSafeEqual } from "node:crypto";

/** Constant-time string compare; false (not throw) on length mismatch. */
export function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

/** Hex HMAC-SHA256 of `payload` under `secret`. */
export function hmacSha256Hex(secret: string, payload: string): string {
  return createHmac("sha256", secret).update(payload).digest("hex");
}

/**
 * Verify a hex HMAC-SHA256 signature in constant time. Fails closed when the
 * secret or signature is missing. `payload` must be the exact received bytes
 * (webhooks: the raw body, never re-serialised JSON).
 */
export function verifyHmacSha256(
  secret: string | undefined,
  payload: string,
  signature: string | null | undefined
): boolean {
  if (!secret || !signature) return false;
  return safeEqual(hmacSha256Hex(secret, payload), signature);
}
