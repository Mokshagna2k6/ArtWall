import { createHmac } from "node:crypto";

import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

import type { RateLimitRule } from "./policies";

export interface StoreHit {
  ok: boolean;
  /** Requests left in the current window (0 once blocked). */
  remaining: number;
  /** Epoch ms when the window resets. */
  resetAt: number;
}

export interface RateLimitStore {
  readonly name: string;
  /** Count one hit against an already-hashed key. Throws if the store is down. */
  hit(hashedKey: string, rule: RateLimitRule): Promise<StoreHit>;
}

/** Keys are HMAC'd before storage: no raw IP/email at rest (DPDP). */
export function hashKey(key: string): string {
  return createHmac("sha256", process.env.BETTER_AUTH_SECRET ?? "artwall-rate-limit")
    .update(key)
    .digest("hex");
}

/** The tagged-template SQL client (`getSql()` from `@/lib/db`). */
export type SqlTag = (strings: TemplateStringsArray, ...values: unknown[]) => PromiseLike<unknown>;

/**
 * Fixed window in Postgres (`rate_limits`, migration 0040). One atomic
 * INSERT .. ON CONFLICT DO UPDATE per hit: the row lock serialises concurrent
 * requests across serverless instances, so the count is exact.
 * shortcut: fixed window allows up to 2x limit in a burst straddling a window edge.
 */
export function postgresStore(getSql: () => SqlTag): RateLimitStore {
  return {
    name: "postgres",
    async hit(hashedKey, { limit, windowMs }) {
      const rows = (await getSql()`
        insert into rate_limits as r (key, count, reset_at)
        values (${hashedKey}, 1, now() + make_interval(secs => ${windowMs / 1000}::float8))
        on conflict (key) do update set
          count    = case when r.reset_at <= now() then 1 else r.count + 1 end,
          reset_at = case when r.reset_at <= now() then excluded.reset_at else r.reset_at end
        returning count, extract(epoch from r.reset_at - now())::float8 as ttl
      `) as { count: number; ttl: number }[];
      const { count, ttl } = rows[0];
      return { ok: count <= limit, remaining: Math.max(0, limit - count), resetAt: Date.now() + ttl * 1000 };
    },
  };
}

/** Fixed window in Upstash Redis (HTTP, serverless-safe). One limiter per distinct rule. */
export function upstashStore(redis: Redis): RateLimitStore {
  const limiters = new Map<string, Ratelimit>();
  return {
    name: "upstash",
    async hit(hashedKey, { limit, windowMs }) {
      const id = `${limit}/${windowMs}`;
      let rl = limiters.get(id);
      if (!rl) {
        rl = new Ratelimit({
          redis,
          limiter: Ratelimit.fixedWindow(limit, `${windowMs} ms`),
          prefix: "artwall:rl",
        });
        limiters.set(id, rl);
      }
      const r = await rl.limit(hashedKey);
      return { ok: r.success, remaining: Math.max(0, r.remaining), resetAt: r.reset };
    },
  };
}

/** Upstash when both env vars are set, else undefined (caller falls back to Postgres). */
export function upstashStoreFromEnv(): RateLimitStore | undefined {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  return url && token ? upstashStore(new Redis({ url, token })) : undefined;
}
