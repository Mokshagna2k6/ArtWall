import "server-only";

import { timingSafeEqual } from "node:crypto";

/**
 * Vercel Cron sends `Authorization: Bearer $CRON_SECRET`. Fails closed: with no
 * secret configured, `Bearer undefined` must not be a valid credential.
 */
export function isCronAuthorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const expected = Buffer.from(`Bearer ${secret}`);
  const actual = Buffer.from(request.headers.get("authorization") ?? "");
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}
