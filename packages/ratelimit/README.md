# @artwall/ratelimit

Application-layer rate limiting: a named policy table, two interchangeable stores, and 429 helpers.

```ts
import { limit, tooManyRequests } from "@artwall/ratelimit";

const r = await limit("public-pdf", `ip:${clientIp(request.headers)}`); // {allowed, remaining, resetAt, retryAfter, unavailable?}
if (!r.allowed) return tooManyRequests(r, { error: "Too many requests." }); // 429 + Retry-After (503 if the store is down and the policy fails closed)
```

Inside `apps/web` import the shim `@/lib/rate-limit` instead: it wires the database client and adds
`limitRequest(scope, rule, userId?)` (IP + user buckets, reads `next/headers`) and
`limitPolicy(policy, userId?)` (same, with the rule taken from the table below). All older exports
(`checkRateLimit`, `clientIp`, `tooManyRequests`, `retryIn`, `mostRestrictive`) still resolve there.

## Stores

| Store | Selected when | Notes |
| --- | --- | --- |
| Postgres (default) | no Upstash env vars | `rate_limits` table (migration 0040). One atomic `INSERT ... ON CONFLICT DO UPDATE` per hit, exact across serverless instances. Behaviour unchanged from the pre-package limiter. Needs `configureRateLimit({ getSql })` (the web shim does it). |
| Upstash Redis | `UPSTASH_REDIS_REST_URL` **and** `UPSTASH_REDIS_REST_TOKEN` both set | `@upstash/ratelimit` fixed window, prefix `artwall:rl`. Same keys, same result shape. |

Keys are HMAC'd (`BETTER_AUTH_SECRET`) before they reach either store: no raw IP or email at rest.
Both are fixed-window (up to 2x `limit` across a window edge) which is fine for abuse control.

## Policies (`src/policies.ts`)

`failOpen` is explicit on every policy. **Closed** = if the store is down the request is refused (503): auth, writes, money.
**Open** = allowed (and the error logged): public reads and signed webhooks.

| Policy | Limit | Window | Key | On store failure | Wired in |
| --- | --- | --- | --- | --- | --- |
| `login` | 20 | 15 min | IP | closed | `api/auth` sign-in |
| `login-identifier` | 5 | 15 min | IP + email | closed | `api/auth` sign-in |
| `signup` | 5 | 1 h | IP | closed | `api/auth` sign-up |
| `password-reset` | 10 | 1 h | IP | closed | `api/auth` |
| `password-reset-identifier` | 3 | 1 h | IP + email | closed | `api/auth` |
| `reset-password` | 10 | 1 h | IP | closed | `api/auth` |
| `webhook` | 300 | 1 min | IP | open (signature is the real gate; never drop a payment event) | not yet wired |
| `public-pdf` | 20 | 1 min | IP | open | `/verify/[hash]/pdf` |
| `search` | 30 | 1 min | IP | open | `api/physical-wall/search` |
| `cart` | 60 | 1 min | buyer (+ IP at 5x) | closed | `addToCart`, `addCollectionToCart` |
| `checkout` | 10 | 10 min | buyer (+ IP at 5x) | closed | `placeCheckout` (not `verifyCheckoutPayment`: a paid buyer must never be locked out of confirming) |
| `api` | 120 | 1 min | IP / user | closed | default for new routes, not wired anywhere yet |

Ad-hoc `limitRequest("scope", {limit, windowMs})` call sites (blockchain, wall, UGC, admin, ...) keep their inline
rules for now; move them into the table when you touch them.

## Adding a policy

1. Add a row to `POLICIES` in `src/policies.ts` with `limit`, `windowMs` and an explicit `failOpen` (default to `false`).
2. Call `limit("name", key)` (route handler) or `limitPolicy("name", userId)` from `@/lib/rate-limit` (web).
3. On block, return `tooManyRequests(result, body)` for routes, or throw a `PreconditionError` via `enforcePolicy` for server actions (they cannot set headers).
4. Add the row to the table above.

## Outer layer: Cloudflare WAF

This package is the inner, per-identity layer (it knows the user and the account). Coarse volumetric limits
(per-IP request floods, `/api/auth/*`, `/verify/*/pdf`, webhooks) belong in **Cloudflare WAF rate-limiting rules** in front of
Vercel; they are configured in the Cloudflare dashboard, not in this repo, and stop traffic before it costs a
function invocation or a database round trip. Keep the Cloudflare thresholds above the app limits so the app's
messages and Retry-After still reach normal users.
