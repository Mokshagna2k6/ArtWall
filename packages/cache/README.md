# @artwall/cache

Typed cache (`get` / `set` / `del` / `getOrSet`) with two backends:

- **In-memory** (default): per-process `Map` with TTL. Not shared across serverless instances.
- **Upstash Redis**: used automatically by `createCacheFromEnv(namespace)` when both
  `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` are set. Any Redis error is
  swallowed and behaves as a cache miss; callers never see it.

```ts
import { createCacheFromEnv } from "@artwall/cache";
const cache = createCacheFromEnv("demand");
const v = await cache.getOrSet("city:mumbai", 300, () => loadFromDb());
```

`getOrSet` is single-flight per process: concurrent callers share one `load()`.
Values must be JSON-serialisable.

## Conventions

- Key = `<namespace>:<key>`. One namespace per feature (`demand`, `catalog`, `wall`);
  inside it use `entity:id[:variant]`, lowercase, colon-separated.
- TTL is mandatory on every write (seconds). Default tiers: 60 (hot/volatile),
  300 (listings), 86400 (immutable-ish, e.g. verified certificates). TTL is a safety net.
- Invalidation: the writer that changes the data calls `cache.del(key)` for each affected
  key. There is no tag/prefix purge; keep keyspaces small and enumerable.

## Existing Next.js caches

`unstable_cache` + tag caches (`apps/web/src/lib/catalog-cache.ts`, `features/wall/data.ts`,
`features/waitlist/roster.ts`) are Next's Data Cache with tag invalidation and were left as is:
this package has no tag purge, so swapping them would change behaviour. The repo has no
in-memory demand/marketplace-sort caches to migrate.

## Env (no values committed)

`UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` (both optional).
