import { describe, expect, it, vi } from "vitest";
import { createCache, createCacheFromEnv, type RedisLike } from "./index";

describe("memory cache", () => {
  it("expires after the TTL and deletes", async () => {
    let t = 0;
    const a = createCache({ namespace: "a", now: () => t });
    await a.set("k", 1, 10);
    expect(await a.get("k")).toBe(1);
    t = 10_000;
    expect(await a.get("k")).toBeUndefined();
    await a.set("k", 2, 10);
    await a.del("k");
    expect(await a.get("k")).toBeUndefined();
  });

  it("getOrSet is single-flight and caches", async () => {
    const c = createCache({ namespace: "n" });
    const load = vi.fn(async () => "v");
    const [x, y] = await Promise.all([c.getOrSet("k", 5, load), c.getOrSet("k", 5, load)]);
    expect([x, y]).toEqual(["v", "v"]);
    await c.getOrSet("k", 5, load);
    expect(load).toHaveBeenCalledTimes(1);
  });

  it("falls back to memory without env vars", async () => {
    const c = createCacheFromEnv("n", {});
    await c.set("k", 1, 5);
    expect(await c.get("k")).toBe(1);
  });
});

describe("redis cache", () => {
  const broken: RedisLike = {
    get: async () => {
      throw new Error("down");
    },
    set: async () => {
      throw new Error("down");
    },
    del: async () => {
      throw new Error("down");
    },
  };

  it("degrades to a miss when redis throws", async () => {
    const c = createCache({ namespace: "n", redis: broken });
    expect(await c.get("k")).toBeUndefined();
    await expect(c.set("k", 1, 5)).resolves.toBeUndefined();
    await expect(c.del("k")).resolves.toBeUndefined();
    expect(await c.getOrSet("k", 5, async () => 42)).toBe(42);
  });

  it("uses the namespaced key and ex TTL", async () => {
    const store = new Map<string, unknown>();
    const set = vi.fn(async (k: string, v: unknown) => void store.set(k, v));
    const fake: RedisLike = {
      get: async <T,>(k: string) => (store.get(k) as T) ?? null,
      set,
      del: async (k) => void store.delete(k),
    };
    const c = createCache({ namespace: "ns", redis: fake });
    await c.set("k", { a: 1 }, 30);
    expect(set).toHaveBeenCalledWith("ns:k", { a: 1 }, { ex: 30 });
    expect(await c.get("k")).toEqual({ a: 1 });
  });
});
