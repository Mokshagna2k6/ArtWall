import "server-only";

import { createHmac } from "node:crypto";
import { headers } from "next/headers";

import { getSql } from "@/lib/db";

/**
 * The one rate limiter in the codebase (PERF-1.01).
 *
 * Fixed window, stored in Postgres (`rate_limits`, migration 0028). Every hit is
 * a single atomic `INSERT ... ON CONFLICT DO UPDATE`: the row lock serialises
 * concurrent requests from any number of serverless instances, so the count is
 * exact - no read-then-write race, no per-instance memory.
 *
 * ponytail: fixed window allows up to 2x `limit` in a burst straddling a window
 * edge. Fine for abuse control; switch to a sliding-window log if that matters.
 *
 * Keys are HMAC'd before they reach the database, so no raw IP address or email
 * is ever stored (DPDP), and a leaked table cannot be brute-forced back to IPs
 * without the server secret. Expired rows are swept by the data-retention cron
 * (PERF-2.02).
 *
 * WHEN THE STORE IS DOWN (PERF-2.03) - a deliberate, per-rule policy:
 *
 *  - Fail CLOSED (the default): auth (sign-in, sign-up, password reset), admin
 *    password actions, uploads, certificate/mint endpoints, every write. If we
 *    cannot count, we cannot prove the caller is under the limit, and these are
 *    exactly the endpoints an attacker would hammer during an outage (credential
 *    stuffing does not pause because our database did). The request is refused
 *    with `unavailable: true`; `tooManyRequests` turns that into a 503.
 *  - Fail OPEN (`failOpen: true`): public, read-only endpoints (search, scan
 *    counters). Blocking them would turn a rate-limit-store blip into a site
 *    outage for every visitor, and the worst an attacker gains is some extra
 *    reads that hit their own backend limits anyway.
 *
 * Either way the error is logged, never swallowed silently.
 */

export interface RateLimitRule {
  limit: number;
  windowMs: number;
  /** Allow the request if the store is unreachable. Public reads only - see above. */
  failOpen?: boolean;
}

export interface RateLimitResult {
  ok: boolean;
  /** Requests left in the current window (0 once blocked). */
  remaining: number;
  /** Whole seconds until the window resets; 0 when `ok`. Use for Retry-After. */
  retryAfter: number;
  /** The store could not be reached; `ok` reflects the rule's fail policy. */
  unavailable?: boolean;
}

/** Retry-After when the store is down: long enough not to hammer a recovering database. */
const STORE_DOWN_RETRY_S = 30;

function hashKey(key: string): string {
  return createHmac("sha256", process.env.BETTER_AUTH_SECRET ?? "artwall-rate-limit")
    .update(key)
    .digest("hex");
}

/** Count one hit against `key` and report whether it is within `limit`. */
export async function checkRateLimit(
  key: string,
  { limit, windowMs, failOpen = false }: RateLimitRule
): Promise<RateLimitResult> {
  let rows: { count: number; ttl: number }[];
  try {
    rows = (await getSql()`
      insert into rate_limits as r (key, count, reset_at)
      values (${hashKey(key)}, 1, now() + make_interval(secs => ${windowMs / 1000}::float8))
      on conflict (key) do update set
        count    = case when r.reset_at <= now() then 1 else r.count + 1 end,
        reset_at = case when r.reset_at <= now() then excluded.reset_at else r.reset_at end
      returning count, extract(epoch from r.reset_at - now())::float8 as ttl
    `) as { count: number; ttl: number }[];
  } catch (error) {
    console.error(
      `[rate-limit] store unavailable, failing ${failOpen ? "open" : "closed"}:`,
      error instanceof Error ? error.message : error
    );
    return failOpen
      ? { ok: true, remaining: 0, retryAfter: 0, unavailable: true }
      : { ok: false, remaining: 0, retryAfter: STORE_DOWN_RETRY_S, unavailable: true };
  }

  const { count, ttl } = rows[0];
  const ok = count <= limit;
  return {
    ok,
    remaining: Math.max(0, limit - count),
    retryAfter: ok ? 0 : Math.max(1, Math.ceil(ttl)),
  };
}

/**
 * The client IP as the platform saw it (PERF-1.03).
 *
 * Next 15+ removed `request.ip`; the hosting platform supplies the IP in headers.
 *
 *  - On Vercel (`VERCEL` is set) the edge *overwrites* `x-forwarded-for`,
 *    `x-real-ip` and `x-vercel-forwarded-for` with the connecting IP and drops
 *    whatever the client sent ("to prevent IP spoofing" - vercel.com/docs/
 *    headers/request-headers). `x-vercel-forwarded-for` is preferred because it
 *    survives a proxy placed in front of Vercel.
 *  - Anywhere else, only the RIGHTMOST `x-forwarded-for` hop is trustworthy: it
 *    is the one our own reverse proxy appended. Everything left of it is
 *    client-supplied. (With no proxy at all, every header is spoofable - run
 *    behind one.)
 *
 * IPv6 is bucketed by /64: one subscriber usually owns a whole /64, so keying on
 * the full address would let them rotate through 2^64 identities.
 */
export function clientIp(h: Headers): string {
  let ip: string | undefined;
  if (process.env.VERCEL) {
    ip = (h.get("x-vercel-forwarded-for") ?? h.get("x-real-ip") ?? h.get("x-forwarded-for"))
      ?.split(",")[0]
      ?.trim();
  } else {
    ip =
      h.get("x-forwarded-for")?.split(",").map((s) => s.trim()).filter(Boolean).at(-1) ??
      h.get("x-real-ip")?.trim();
  }
  if (!ip) return "unknown";
  return ip.includes(":") ? ipv6Prefix64(ip) : ip;
}

function ipv6Prefix64(ip: string): string {
  const addr = ip.replace(/^\[|\]$/g, "").split("%")[0];
  if (addr.startsWith("::ffff:") && addr.includes(".")) return addr.slice(7); // v4-mapped
  const [head, tail = ""] = addr.split("::");
  const left = head ? head.split(":") : [];
  const right = addr.includes("::") && tail ? tail.split(":") : [];
  const groups = [...left, ...Array(Math.max(0, 8 - left.length - right.length)).fill("0"), ...right];
  return `${groups.slice(0, 4).map((g) => g.toLowerCase().replace(/^0+(?=.)/, "")).join(":")}::/64`;
}

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

export function mostRestrictive(results: RateLimitResult[]): RateLimitResult {
  return {
    ok: results.every((r) => r.ok),
    remaining: Math.min(...results.map((r) => r.remaining)),
    retryAfter: Math.max(...results.map((r) => r.retryAfter)),
    ...(results.some((r) => r.unavailable) && { unavailable: true }),
  };
}

/**
 * HTTP 429 with a Retry-After (seconds) computed from the window (PERF-1.06),
 * or 503 when the request was refused only because the store is down (fail
 * closed, PERF-2.03) - the caller did nothing wrong, the service is unavailable.
 */
export function tooManyRequests(result: RateLimitResult, body: unknown): Response {
  return Response.json(body, {
    status: result.unavailable ? 503 : 429,
    headers: { "Retry-After": String(Math.max(1, result.retryAfter)) },
  });
}

/** "3 minutes" / "1 minute" for server-action messages that cannot carry a header. */
export function retryIn(result: RateLimitResult): string {
  const minutes = Math.ceil(result.retryAfter / 60);
  return minutes <= 1 ? "a minute" : `${minutes} minutes`;
}
