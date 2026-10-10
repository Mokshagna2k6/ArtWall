import { Redis } from "@upstash/redis";

/** Values must be JSON-serialisable (a Date comes back from Redis as a string). */
export interface Cache {
  get<T>(key: string): Promise<T | undefined>;
  set<T>(key: string, value: T, ttlSeconds: number): Promise<void>;
  del(key: string): Promise<void>;
  /** Cached value, or run `load` once (concurrent callers share one call) and cache it. */
  getOrSet<T>(key: string, ttlSeconds: number, load: () => Promise<T>): Promise<T>;
}

/** Minimal slice of the Upstash client we use, so tests can fake it. */
export interface RedisLike {
  get<T>(key: string): Promise<T | null>;
  set(key: string, value: unknown, opts: { ex: number }): Promise<unknown>;
  del(key: string): Promise<unknown>;
}

type Backend = {
  get(key: string): Promise<unknown>;
  set(key: string, value: unknown, ttl: number): Promise<void>;
  del(key: string): Promise<void>;
};

/** shortcut: no size cap or sweep, entries are only dropped on read; fine for small keyspaces. */
function memoryBackend(now: () => number): Backend {
  const m = new Map<string, { v: unknown; exp: number }>();
  return {
    async get(key) {
      const e = m.get(key);
      if (!e) return undefined;
      if (e.exp <= now()) {
        m.delete(key);
        return undefined;
      }
      return e.v;
    },
    async set(key, v, ttl) {
      m.set(key, { v, exp: now() + ttl * 1000 });
    },
    async del(key) {
      m.delete(key);
    },
  };
}

function redisBackend(r: RedisLike): Backend {
  // Redis failures degrade to a miss / no-op; callers never see them.
  return {
    async get(key) {
      try {
        return (await r.get(key)) ?? undefined;
      } catch {
        return undefined;
      }
    },
    async set(key, v, ttl) {
      try {
        await r.set(key, v, { ex: Math.max(1, Math.ceil(ttl)) });
      } catch {}
    },
    async del(key) {
      try {
        await r.del(key);
      } catch {}
    },
  };
}

export function createCache(opts: {
  namespace: string;
  redis?: RedisLike;
  now?: () => number;
}): Cache {
  const b = opts.redis ? redisBackend(opts.redis) : memoryBackend(opts.now ?? Date.now);
  const k = (key: string) => `${opts.namespace}:${key}`;
  const inflight = new Map<string, Promise<unknown>>();
  return {
    get: async <T>(key: string) => (await b.get(k(key))) as T | undefined,
    set: (key, value, ttl) => b.set(k(key), value, ttl),
    del: (key) => b.del(k(key)),
    async getOrSet<T>(key: string, ttl: number, load: () => Promise<T>) {
      const hit = (await b.get(k(key))) as T | undefined;
      if (hit !== undefined) return hit;
      let p = inflight.get(k(key)) as Promise<T> | undefined;
      if (!p) {
        p = load()
          .then(async (v) => {
            await b.set(k(key), v, ttl);
            return v;
          })
          .finally(() => inflight.delete(k(key)));
        inflight.set(k(key), p);
      }
      return p;
    },
  };
}

/** Upstash when UPSTASH_REDIS_REST_URL and _TOKEN are set, otherwise in-memory. */
export function createCacheFromEnv(namespace: string, env = process.env): Cache {
  const url = env.UPSTASH_REDIS_REST_URL;
  const token = env.UPSTASH_REDIS_REST_TOKEN;
  return createCache({
    namespace,
    redis: url && token ? (new Redis({ url, token }) as unknown as RedisLike) : undefined,
  });
}
