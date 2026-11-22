import "server-only";

import { headers } from "next/headers";

import {
  checkRateLimit,
  clientIp,
  configureRateLimit,
  getPolicy,
  mostRestrictive,
  type PolicyName,
  type RateLimitResult,
  type RateLimitRule,
  type SqlTag,
} from "@artwall/ratelimit";

import { getSql } from "@/lib/db";

/**
 * Shim over `@artwall/ratelimit` (packages/ratelimit), so every existing
 * `@/lib/rate-limit` import keeps working. The limiter, policy table, Postgres
 * store (default, `rate_limits` from migration 0040) and Upstash store
 * (auto-selected when UPSTASH_REDIS_REST_URL/TOKEN are set) live in the package;
 * this file wires the db client and the `next/headers`-aware `limitRequest`.
 *
 * Fail-open vs fail-closed is per rule (`failOpen`), documented in the package.
 */
configureRateLimit({ getSql: getSql as unknown as () => SqlTag });

export { checkRateLimit, clientIp, mostRestrictive, retryIn, tooManyRequests } from "@artwall/ratelimit";
export type { RateLimitResult, RateLimitRule };

/**
 * How many times a single user's allowance an IP gets when requests are signed
 * in, so several legitimate users behind one NAT/office proxy do not throttle
 * each other, while one IP still cannot mint unlimited accounts' worth.
 */
const SHARED_IP_FACTOR = 5;

/**
 * Rate-limit the current request under `scope` (PERF-1.04).
 *
 *  - Anonymous: one bucket per client IP at `rule.limit`.
 *  - Signed in: one bucket per user id at `rule.limit` (rotating networks does
 *    not reset it) AND one per IP at `rule.limit * SHARED_IP_FACTOR` (one IP
 *    cycling through many accounts is still capped). Blocked if either is.
 */
export async function limitRequest(
  scope: string,
  rule: RateLimitRule,
  userId?: string | null,
  h?: Headers
): Promise<RateLimitResult> {
  const ip = clientIp(h ?? (await headers()));
  const checks = userId
    ? [
        checkRateLimit(`${scope}:user:${userId}`, rule),
        checkRateLimit(`${scope}:ip:${ip}`, { ...rule, limit: rule.limit * SHARED_IP_FACTOR }),
      ]
    : [checkRateLimit(`${scope}:ip:${ip}`, rule)];
  return mostRestrictive(await Promise.all(checks));
}

/** `limitRequest` for a named policy: limit, window and fail mode come from the package's policy table. */
export function limitPolicy(policy: PolicyName, userId?: string | null, h?: Headers): Promise<RateLimitResult> {
  return limitRequest(policy, getPolicy(policy), userId, h);
}
