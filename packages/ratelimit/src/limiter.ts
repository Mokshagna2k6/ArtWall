import { getPolicy, type PolicyName, type RateLimitRule } from "./policies";
import { hashKey, postgresStore, upstashStoreFromEnv, type RateLimitStore, type SqlTag } from "./stores";

export interface RateLimitResult {
  ok: boolean;
  /** Requests left in the current window (0 once blocked). */
  remaining: number;
  /** Whole seconds until the window resets; 0 when `ok`. Use for Retry-After. */
  retryAfter: number;
  /** The store could not be reached; `ok` reflects the rule's fail policy. */
  unavailable?: boolean;
}

export interface LimitResult {
  allowed: boolean;
  remaining: number;
  /** Epoch ms when the window resets. */
  resetAt: number;
  /** Seconds to wait when blocked; 0 when allowed. */
  retryAfter: number;
  unavailable?: boolean;
}

/** Retry-After when the store is down: long enough not to hammer a recovering database. */
const STORE_DOWN_RETRY_S = 30;

let sqlProvider: (() => SqlTag) | undefined;
let storeOverride: RateLimitStore | undefined;
let envStore: { sig: string; store: RateLimitStore | undefined } | undefined;

/** Wire the Postgres client (apps/web does this in `@/lib/rate-limit`). `store` overrides selection (tests). */
export function configureRateLimit(opts: { getSql?: () => SqlTag; store?: RateLimitStore }) {
  if (opts.getSql) sqlProvider = opts.getSql;
  storeOverride = opts.store;
}

/** Upstash if both env vars are set (re-checked when they change), else Postgres. */
export function resolveStore(): RateLimitStore {
  if (storeOverride) return storeOverride;
  const sig = `${process.env.UPSTASH_REDIS_REST_URL ?? ""}|${process.env.UPSTASH_REDIS_REST_TOKEN ?? ""}`;
  if (envStore?.sig !== sig) envStore = { sig, store: upstashStoreFromEnv() };
  if (envStore.store) return envStore.store;
  if (!sqlProvider) throw new Error("[ratelimit] no store: set UPSTASH_REDIS_REST_* or call configureRateLimit({ getSql })");
  return postgresStore(sqlProvider);
}

async function run(key: string, rule: RateLimitRule): Promise<LimitResult> {
  const failOpen = rule.failOpen ?? false;
  try {
    const hit = await resolveStore().hit(hashKey(key), rule);
    return {
      allowed: hit.ok,
      remaining: hit.remaining,
      resetAt: hit.resetAt,
      retryAfter: hit.ok ? 0 : Math.max(1, Math.ceil((hit.resetAt - Date.now()) / 1000)),
    };
  } catch (error) {
    // Logged, never swallowed: either way someone should see the store is down.
    console.error(
      `[rate-limit] store unavailable, failing ${failOpen ? "open" : "closed"}:`,
      error instanceof Error ? error.message : error
    );
    return failOpen
      ? { allowed: true, remaining: 0, resetAt: Date.now(), retryAfter: 0, unavailable: true }
      : { allowed: false, remaining: 0, resetAt: Date.now() + STORE_DOWN_RETRY_S * 1000, retryAfter: STORE_DOWN_RETRY_S, unavailable: true };
  }
}

/** `limit("search", "ip:1.2.3.4")`: count one hit under a named policy. Throws on an unknown policy name. */
export async function limit(policyName: PolicyName, key: string): Promise<LimitResult> {
  return run(`${policyName}:${key}`, getPolicy(policyName));
}

/** Count one hit against `key` under an explicit rule (legacy result shape used across the app). */
export async function checkRateLimit(key: string, rule: RateLimitRule): Promise<RateLimitResult> {
  const r = await run(key, rule);
  return { ok: r.allowed, remaining: r.remaining, retryAfter: r.retryAfter, ...(r.unavailable && { unavailable: true }) };
}

export function mostRestrictive(results: RateLimitResult[]): RateLimitResult {
  return {
    ok: results.every((r) => r.ok),
    remaining: Math.min(...results.map((r) => r.remaining)),
    retryAfter: Math.max(...results.map((r) => r.retryAfter)),
    ...(results.some((r) => r.unavailable) && { unavailable: true }),
  };
}
