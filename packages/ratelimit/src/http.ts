import type { LimitResult, RateLimitResult } from "./limiter";

/**
 * The client IP as the platform saw it (PERF-1.03).
 *
 *  - On Vercel (`VERCEL` is set) the edge *overwrites* `x-forwarded-for`,
 *    `x-real-ip` and `x-vercel-forwarded-for` with the connecting IP, so the
 *    client cannot spoof them. `x-vercel-forwarded-for` survives a proxy in front.
 *  - Elsewhere only the RIGHTMOST `x-forwarded-for` hop is trustworthy: the one
 *    our own reverse proxy appended. (Behind Cloudflare, configure the proxy to
 *    append the real client IP, or use CF-Connecting-IP at that layer.)
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

type Blocked = Pick<RateLimitResult, "retryAfter" | "unavailable">;

/**
 * HTTP 429 with a Retry-After (seconds) computed from the window (PERF-1.06),
 * or 503 when the request was refused only because the store is down (fail
 * closed): the caller did nothing wrong, the service is unavailable.
 */
export function tooManyRequests(result: Blocked | LimitResult, body: unknown): Response {
  return Response.json(body, {
    status: result.unavailable ? 503 : 429,
    headers: { "Retry-After": String(Math.max(1, result.retryAfter)) },
  });
}

/** "3 minutes" / "a minute" for server-action messages that cannot carry a header. */
export function retryIn(result: Blocked): string {
  const minutes = Math.ceil(result.retryAfter / 60);
  return minutes <= 1 ? "a minute" : `${minutes} minutes`;
}
