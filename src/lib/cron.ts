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

/**
 * When a cron's work loop must stop picking up new items (PERF-2.09): the
 * route's `maxDuration` minus headroom for the item in flight (each has its own
 * <=15s network timeout) and the response. Whatever is left over stays queued
 * and is picked up by the next run - every batch here is resumable.
 */
export function deadline(maxDurationS: number, headroomS = 20): number {
  return Date.now() + (maxDurationS - headroomS) * 1000;
}
