/**
 * Fixed-window rate limiter.
 *
 * Scope and honesty about it: this is in-process memory. On a single long-lived
 * server it is a genuine control. On serverless it is per-instance, so a
 * determined attacker spread across cold starts gets a higher effective ceiling
 * - it stops casual abuse and accidental double-submits, not a botnet.
 *
 * For production hardening behind real traffic, back this with a shared store
 * (Vercel KV, Upstash, Redis) - the `check` signature is deliberately narrow so
 * swapping the backing store touches nothing else.
 */
interface Window {
  count: number;
  resetAt: number;
}

const windows = new Map<string, Window>();

/** Drop expired entries so the map cannot grow without bound. */
function sweep(now: number) {
  for (const [key, window] of windows) {
    if (window.resetAt <= now) windows.delete(key);
  }
}

export interface RateLimitResult {
  ok: boolean;
  /** Seconds until the caller may retry. */
  retryAfter: number;
}

export function checkRateLimit(
  key: string,
  { limit, windowMs }: { limit: number; windowMs: number }
): RateLimitResult {
  const now = Date.now();

  // Cheap amortised cleanup rather than a background timer, which would keep
  // a serverless instance alive.
  if (windows.size > 5_000) sweep(now);

  const existing = windows.get(key);

  if (!existing || existing.resetAt <= now) {
    windows.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true, retryAfter: 0 };
  }

  existing.count += 1;

  if (existing.count > limit) {
    return {
      ok: false,
      retryAfter: Math.ceil((existing.resetAt - now) / 1000),
    };
  }

  return { ok: true, retryAfter: 0 };
}
