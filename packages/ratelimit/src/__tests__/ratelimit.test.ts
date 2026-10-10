import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  POLICIES,
  checkRateLimit,
  configureRateLimit,
  getPolicy,
  limit,
  resolveStore,
  retryIn,
  tooManyRequests,
  type RateLimitStore,
  type StoreHit,
} from "../index";

/** In-memory fixed-window store, same contract as the real ones. */
function memoryStore(): RateLimitStore {
  const rows = new Map<string, { count: number; resetAt: number }>();
  return {
    name: "memory",
    async hit(key, { limit: max, windowMs }): Promise<StoreHit> {
      const now = Date.now();
      let row = rows.get(key);
      if (!row || row.resetAt <= now) row = { count: 0, resetAt: now + windowMs };
      row.count += 1;
      rows.set(key, row);
      return { ok: row.count <= max, remaining: Math.max(0, max - row.count), resetAt: row.resetAt };
    },
  };
}

const downStore: RateLimitStore = {
  name: "down",
  async hit() {
    throw new Error("store down");
  },
};

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  configureRateLimit({ store: undefined });
});

describe("policy lookup", () => {
  it("every policy sets failOpen explicitly; auth and money fail closed, public reads open", () => {
    for (const p of Object.values(POLICIES)) expect(typeof p.failOpen).toBe("boolean");
    for (const name of ["login", "signup", "cart", "checkout", "api"] as const) expect(POLICIES[name].failOpen).toBe(false);
    for (const name of ["search", "public-pdf"] as const) expect(POLICIES[name].failOpen).toBe(true);
  });

  it("throws on an unknown policy", () => {
    expect(() => getPolicy("nope")).toThrow(/unknown policy/);
  });
});

describe("window behaviour", () => {
  it("allows up to the limit, then blocks with a Retry-After, then resets after the window", async () => {
    vi.useFakeTimers();
    configureRateLimit({ store: memoryStore() });
    const { limit: max, windowMs } = POLICIES["login-identifier"];

    for (let i = 1; i <= max; i++) {
      const r = await limit("login-identifier", "ip:1.1.1.1");
      expect(r).toMatchObject({ allowed: true, remaining: max - i, retryAfter: 0 });
    }
    const blocked = await limit("login-identifier", "ip:1.1.1.1");
    expect(blocked.allowed).toBe(false);
    expect(blocked.remaining).toBe(0);
    expect(blocked.retryAfter).toBe(windowMs / 1000);
    expect(blocked.resetAt).toBe(Date.now() + windowMs);

    // another key is unaffected
    expect((await limit("login-identifier", "ip:2.2.2.2")).allowed).toBe(true);

    vi.advanceTimersByTime(windowMs + 1);
    expect((await limit("login-identifier", "ip:1.1.1.1")).allowed).toBe(true);
  });
});

describe("store failure (explicit per policy)", () => {
  it("fails CLOSED for a closed policy: refused, unavailable, 503", async () => {
    configureRateLimit({ store: downStore });
    const r = await limit("checkout", "user:u1");
    expect(r).toMatchObject({ allowed: false, unavailable: true });
    expect(tooManyRequests(r, {}).status).toBe(503);
  });

  it("fails OPEN for an open policy: allowed, flagged unavailable, logged", async () => {
    configureRateLimit({ store: downStore });
    const r = await limit("public-pdf", "ip:1.1.1.1");
    expect(r).toMatchObject({ allowed: true, unavailable: true });
    expect(console.error).toHaveBeenCalled();
  });

  it("checkRateLimit defaults to closed", async () => {
    configureRateLimit({ store: downStore });
    expect((await checkRateLimit("k", { limit: 1, windowMs: 1000 })).ok).toBe(false);
    expect((await checkRateLimit("k", { limit: 1, windowMs: 1000, failOpen: true })).ok).toBe(true);
  });
});

describe("store selection", () => {
  it("uses Upstash when both env vars are set, Postgres otherwise", () => {
    configureRateLimit({ getSql: (() => {}) as never });
    vi.stubEnv("UPSTASH_REDIS_REST_URL", "");
    vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "");
    expect(resolveStore().name).toBe("postgres");
    vi.stubEnv("UPSTASH_REDIS_REST_URL", "https://example.upstash.io");
    expect(resolveStore().name).toBe("postgres"); // token missing
    vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "t");
    expect(resolveStore().name).toBe("upstash");
  });
});

describe("429 helper", () => {
  it("returns 429 with Retry-After in whole seconds, min 1", async () => {
    const res = tooManyRequests({ retryAfter: 90 }, { error: "slow down" });
    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBe("90");
    expect(await res.json()).toEqual({ error: "slow down" });
    expect(tooManyRequests({ retryAfter: 0 }, {}).headers.get("Retry-After")).toBe("1");
  });

  it("retryIn rounds up to minutes", () => {
    expect(retryIn({ retryAfter: 30 })).toBe("a minute");
    expect(retryIn({ retryAfter: 61 })).toBe("2 minutes");
  });
});
