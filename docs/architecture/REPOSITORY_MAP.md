# Repository map

How ArtWall is laid out and how a request travels through it. Written for a
developer who did not write this code and wants to navigate it without help.

Every path here was verified against the tree on 2026-10-21. Where something
does **not** exist, this document says so rather than describing it as though it
does.

---

## 1. Top-level directories

| Path | What it is | Deployed? |
| --- | --- | --- |
| `apps/web/` | The Next.js 16 application. All UI, all server logic, all API routes. | **Yes** — Vercel, project `artwall-production` |
| `apps/api/` | **Railway cron scheduler.** Plain Node + croner. Owns timing only; calls `apps/web`'s `/api/cron/*` endpoints. | **Yes** — Railway |
| `packages/db/` | Drizzle schema, 71 SQL migrations, the migration runner, an RLS README | Consumed by `apps/web` |
| `packages/security/` | Pure security primitives: HMAC, URL allowlists, PII redaction, CSP/headers, role policy | Consumed by `apps/web` |
| `packages/ratelimit/` | Rate-limit policies with Postgres and Upstash stores, 429 helpers | Consumed by `apps/web` |
| `packages/cache/` | Typed cache over in-memory or Upstash Redis | Consumed by `apps/web` |
| `packages/shared/` | **Placeholder.** `package.json` + `README.md` only. Empty. | No |
| `contracts/` | Solidity (Foundry): the COA contract, tests, `lib/` vendored deps | Base Sepolia |
| `docs/` | Specs, architecture, DB docs, runbooks, archive | — |
| `.github/workflows/` | `ci.yml` — one workflow, seven jobs | — |

### Generated output — never edit, never commit

`apps/web/.next/` · `node_modules/` · `.pnpm-store/` · `contracts/out/` ·
`contracts/cache/` · `apps/web/coverage/` · `apps/web/test-results/` ·
`*.tsbuildinfo` · `next-env.d.ts`

All are gitignored. A root-level `.next/`, `next-env.d.ts` and
`tsconfig.tsbuildinfo` survived the move to `apps/web` and were deleted on
2026-10-21; the live build output is `apps/web/.next/`. If they reappear at the
root, something ran `next` from the wrong directory.

`.claude/worktrees/` holds 52 registered git worktrees from past agent sessions.
They are excluded via `.git/info/exclude`, not `.gitignore`. See
[`REFACTOR_CHANGELOG.md`](REFACTOR_CHANGELOG.md) for why they were left alone.

---

## 2. Where is the frontend? Where is the backend?

**They are separated by import boundary, not by folder.** This is deliberate
and it is the correct pattern for the App Router. There is no `frontend/` or
`backend/` directory, and adding one would break the build.

Why: in the App Router, the server and client halves of a route must be
**co-located**. `apps/web/src/app/studio/page.tsx` is a Server Component; the
`"use client"` components it renders live in the same route folder or in
`src/features/`. Next.js discovers routes by directory structure, so moving
server files into a `backend/` tree would make those routes cease to exist.

What enforces the boundary instead:

| Marker | Meaning | Count |
| --- | --- | --- |
| `import "server-only"` | **Build error** if any browser bundle imports this file | 74 files |
| `"use client"` | Opt-in to the client bundle | — |
| *(neither)* | Server Component by default | — |

`server-only` is a stronger guarantee than a folder. A folder is a convention a
developer can violate silently; `server-only` fails `pnpm build`. That failure
mode is documented in [`AGENTS.md`](../../AGENTS.md) — `tsc --noEmit` does *not*
catch it, which is why a full build is required before shipping.

So, concretely:

- **Backend** = the 74 `server-only` files, plus 24 route handlers under
  `apps/web/src/app/api/`, plus the `actions.ts` modules in `src/features/*/`.
- **Frontend** = `app/**/page.tsx` and `layout.tsx`, `src/components/`,
  `src/shared/`, and the `"use client"` components inside `src/features/*/`.
- **Database** = `packages/db/` — genuinely its own package.

---

## 3. `apps/web/src` in detail

```
app/            Routes. One directory per URL segment.
  api/          24 route handlers (webhooks, crons, PDFs, JSON endpoints)
  admin/        Legacy password-gated "virtual wall tiles" tool
  physical-wall/  Wall rental: grid, booking, payment, ops, admin area
  studio/       The artist and curator workspace
  discover/     Marketplace catalogue
  verify/       Public provenance verification
  layout.tsx    Root layout — reads x-pathname to pick the public or admin shell
  error.tsx, not-found.tsx, sitemap.ts, robots.ts
components/     Reusable UI with zero feature knowledge (brand, layout, ui, seo)
features/       One directory per domain — see below
shared/         Composite components used by more than one feature
lib/            Cross-cutting infrastructure — see section 7
config/         site.ts (incl. feature flags), nav.ts, content.ts, products.ts
types/          Domain models shared across features
test/           Test helpers
proxy.ts        Request middleware — CSP nonce and x-pathname
```

### `src/features/` — the unit of organization

32 domains. Each holds the UI *and* the server logic for one slice of the
product. A domain with server logic has `actions.ts` (or an `actions/`
directory); the rest are presentational.

**With server actions** (16): `admin`, `art-tags`, `assistant`, `coa`,
`collections`, `curators`, `exhibitions`, `inquiries`, `marketplace`,
`onboarding`, `orders`, `physical-wall`, `survey`, `upload`, `waitlist`,
`wall`, `wallos`

**Presentational or schema-only** (16): `about`, `archetype`, `artworks`,
`blockchain`, `blockchain-admin`, `certificate`, `demand`, `escrow`, `home`,
`india`, `logistics`, `platform`, `policy`, `studio`

> `escrow` and `policy` are worth knowing about: the `escrow_holds` and
> `escrow_releases` tables exist (migrations `0049`, `0057`) and the
> `PolicyEngine` exists, but neither is fully wired into live routes. See
> `docs/locked-product-rules-traceability.md`.

`physical-wall` is the largest domain and the one to read first. Its
`actions/` directory splits by concern: `booking.ts`, `payment.ts`,
`agreement.ts`, `ledger.ts`, `invoice.ts`, `identity.ts`, `admin-roles.ts`,
`admin-ops.ts`, `grid.ts`, and `shared.ts` (the plumbing every other one uses).

**Where new features go:** a new domain gets `src/features/<domain>/` with its
own `actions.ts`; its routes go in `src/app/<segment>/`. Promote a component to
`src/shared/` only when a *second* feature needs it, and to `src/components/ui/`
only if it has no feature knowledge at all.

---

## 4. Request flow

### 4a. A page render

```
Browser
  -> proxy.ts                    mints a CSP nonce, stamps x-nonce + x-pathname
  -> app/<route>/page.tsx        Server Component
       -> getSessionUser()       src/lib/session.ts — reads the session per request
       -> requireRolePage(...)   features/physical-wall/authorize.ts — may redirect
       -> a read function        features/<domain>/actions.ts
            -> getSql() / pool   src/lib/db.ts (Neon HTTP) or @artwall/db (pg Pool)
  -> HTML, plus "use client" islands hydrated in the browser
```

### 4b. A mutation (server action)

Most of `src/features/*/actions.ts` follow one contract, defined in
[`apps/web/src/features/physical-wall/actions/shared.ts`](../../apps/web/src/features/physical-wall/actions/shared.ts):

```
parseInput(zodSchema, formData)      reject bad input before anything else
  -> requireRole / requireAdminRole  resolve a named actor; default-deny
  -> attempt(...) / readSafely(...)  run the work, convert throws to Result<T>
  -> inTransaction(client => ...)    real pg transaction + row locks when atomic
  -> revalidatePath(...)             invalidate the affected route cache
  -> Result<T> / ActionState         { status: "ok" | "error", message, data? }
```

A static test, `action-contracts.test.ts`, **scans the action files for this
shape**. Match it rather than inventing a new return convention.

Two database clients, deliberately:

| Client | Where | Use |
| --- | --- | --- |
| Neon HTTP (`getSql()`) | `src/lib/db.ts` | Single statements. Works in serverless and edge. **Cannot hold a transaction or a row lock.** |
| `pg` Pool (`pool`) | `@artwall/db`, re-exported by `src/lib/db/index.ts` | Anything that must be all-or-nothing, via `inTransaction` |

Picking the wrong one is a correctness bug, not a style choice: a multi-slot
reservation on the HTTP client would have no atomicity at all.

### 4c. An API route

`app/api/<path>/route.ts` — used where a server action does not fit: external
webhooks (`physical-wall/razorpay/webhook`), Vercel Crons (`api/cron/*`, seven
of them, scheduled in `apps/web/vercel.json`), binary responses
(`coa/[id]/pdf`), and `auth/[...all]` for better-auth.

Crons authenticate with `CRON_SECRET` as a bearer token and wrap their work in
`runCron` from `src/lib/cron.ts` for structured logging and alerting. Webhooks
verify signatures and reject replays by event id before writing anything.

---

## 5. Authentication and authorization

**Authentication** — Supabase Auth (migration `0074`). Identity comes from a
**verified JWT**, never from the session cookie's contents.

- [`apps/web/src/lib/supabase/server.ts`](../../apps/web/src/lib/supabase/server.ts) —
  per-request server client, plus `createAdminClient()` for service-role work
  that is not acting as a user (crons, admin writes). Never memoised: a shared
  instance would read one visitor's session while rendering another's page.
- [`apps/web/src/proxy.ts`](../../apps/web/src/proxy.ts) — the only place a
  refreshed auth cookie can be written, because a Server Component cannot set
  headers. Without it, sessions expire and users log out at random.
- [`apps/web/src/features/onboarding/auth-actions.ts`](../../apps/web/src/features/onboarding/auth-actions.ts) —
  credential sign-in/sign-up as server actions, so this project's rate limiter
  stays on the path. A browser-side Supabase call would bypass it.
- [`apps/web/src/lib/auth.ts`](../../apps/web/src/lib/auth.ts) — compatibility
  shim exposing `auth.api.getSession({ headers })` for the 20 pre-migration call
  sites. New code calls `getSessionUser()`.

`public."user"` is the **profile** table, keyed by the same uuid as
`auth.users.id`. Supabase Auth owns credentials; `role`, `onboardingPersona`
and the verification columns stay ours.

**Session** — [`apps/web/src/lib/session.ts`](../../apps/web/src/lib/session.ts).
`getSessionUser()` re-reads the session on **every call**, never caching: a page
rendered for a signed-in artist must never be served from a cache entry built
for someone else. It uses `supabase.auth.getClaims()`, **never `getSession()`** —
Supabase's docs are explicit that the cookie is forgeable, so its embedded user
object cannot be trusted for authorization, and every role gate in this app
resolves its actor through here. It distinguishes the framework's own
control-flow throws (`NEXT_REDIRECT`, `DYNAMIC_SERVER_USAGE`) from real
failures and re-throws them untouched — swallowing those would let a signed-out
prerender be cached and served to a signed-in visitor.

**Authorization** — [`apps/web/src/features/physical-wall/authorize.ts`](../../apps/web/src/features/physical-wall/authorize.ts).
Default-deny throughout; pure role policy lives in the `authz` module of
`@artwall/security`. Three independent axes:

1. `user.role` — `visitor | artist | staff | admin`. A flat internal access
   tier. **Not** a marketplace persona.
2. **Persona** — artist, curator or buyer, via `user.onboardingPersona` and the
   `artistProfiles` / `curators` tables. Independent of `role`.
3. **Admin team roles** — `admin_role_assignments` joined to `admin_roles`, 10
   rows (8 from the Bible plus `curator_admin` and `compliance_admin`).
   `super_admin` bypasses every check. Granting any admin role **also** sets
   `user.role = 'admin'`, because the admin area's page gate checks that column
   too.

Entry points: `getActor`, `hasRole`, `requireRole`, `requireRolePage`,
`requireOnboardedPage`, `hasAdminRole`, `requireAdminRole`,
`requireAnyAdminRolePage`, `listOwnAdminRoles`.

Enforcement is **server-side**. The admin nav deliberately renders all 8 role
tiles for everyone, greying out the ones the viewer lacks — a product decision
(one person will hold multiple roles at first, so the UI must not change shape
as grants change) — so the UI state is cosmetic and the real gate is in these
functions.

---

## 6. Database

Everything lives in [`packages/db/`](../../packages/db/):

```
src/schema.ts       The Drizzle schema (1431 lines)
src/index.ts        The pg Pool and client exports
migrations/*.sql    71 plain-SQL migrations, applied in filename order
scripts/migrate.mjs           The runner
scripts/migrations-check.mjs  Asserts migrations apply twice to an empty DB
rls/README.md       Row-level security notes
```

`apps/web/src/lib/db/index.ts` and `schema.ts` are **two-line shims** that
re-export `@artwall/db`, with `server-only` applied on the app side. They exist
so existing `@/lib/db` imports kept working when the package was extracted.
New code may import either; prefer `@/lib/db` inside `apps/web`.

The ledger records applied files **by filename, not by parsed number**. So two
migrations can share a number and both still apply exactly once — which is why
`0057_be3_escrow_release_state.sql` and `0057_collections_rebuild.sql` coexist
harmlessly. Run `ls packages/db/migrations | sort -V | tail -5` to get the real
next number; never trust a number remembered from a conversation.

Invariants are documented in [`docs/db/invariants.md`](../db/invariants.md) and
the append-only ledger model in [`docs/db/ledger.md`](../db/ledger.md).

---

## 7. Cross-cutting infrastructure (`apps/web/src/lib/`)

| File | Responsibility |
| --- | --- |
| `auth.ts`, `auth-client.ts`, `session.ts` | Authentication, server and client halves |
| `db.ts` | Neon HTTP client, lazily created, `server-only` |
| `db/` | Shims onto `@artwall/db` |
| `rate-limit.ts` | App-level wrapper over `@artwall/ratelimit`. Many callers — add callers, do not change its behavior |
| `catalog-cache.ts` | `cachedCatalog` over `@artwall/cache` |
| `cron.ts` | `runCron` — structured logging and alerting for every cron route |
| `cloudinary.ts`, `cloudinary-url.ts` | Signed direct-to-cloud uploads |
| `blockchain/` | Chain clients, KMS refs, `file-sniff.ts` magic-byte detection |
| `form-result.ts`, `html-escape.ts`, `motion.ts`, `utils.ts` | Small shared helpers |
| `artist-profiles.ts` | Artist profile reads |

**Error handling** is per-layer, not centralized: `toActionError(scope, error)`
in `actions/shared.ts` maps known domain errors to useful messages and
everything else to a flat message plus a server log — because an unexpected
error's text may carry column names, query fragments or ids, none of which
belong on screen. Route segments have `error.tsx` boundaries.

**Logging** is `console.*` with a bracketed scope (`[auth]`, `[cron]`), picked
up by Vercel's log drain. There is no logging abstraction.

**Middleware** is `apps/web/src/proxy.ts` — one file, two jobs: the per-request
CSP nonce, and stamping `x-pathname` so the Server Component root layout can
tell which shell to render.

---

## 8. Shared packages — what belongs where

All four are TypeScript-source packages with no build step; `next.config.ts`
lists them in `transpilePackages`.

- **`@artwall/security`** — pure functions only, no I/O: HMAC and timing-safe
  verify, URL allowlists, PII redaction, CSP and static header construction,
  role policy. Imported by `next.config.ts` and `proxy.ts` as well as app code.
- **`@artwall/ratelimit`** — policies plus Postgres and Upstash stores.
- **`@artwall/cache`** — one typed interface, in-memory or Upstash backend.
- **`@artwall/db`** — schema, client, migrations.

Dependency direction is strictly one-way: `apps/web` depends on `packages/*`.
No package imports `apps/web`, and no package imports another. There are no
circular dependencies. **`contracts/` is independent** of all JS and TS code —
it builds and tests with Foundry in its own CI job.

---

## 9. Tests

| Suite | Config | Command |
| --- | --- | --- |
| Unit | `apps/web/vitest.config.ts` (with per-module coverage floors) | `pnpm test` |
| Integration (real Postgres) | `apps/web/vitest.db.config.ts` | `pnpm test:db` |
| E2E | `apps/web/playwright.config.ts` | `pnpm test:e2e` |
| Contracts | `contracts/foundry.toml` | `forge test` |
| Package units | each `packages/*` | `pnpm test` (recursive) |

Tests sit in `__tests__/` beside the code they cover. Baseline on 2026-10-21:
**718 passing** (694 in `apps/web` across 49 files, 24 across the packages).

---

## 10. Known architectural limitations

Stated plainly, because a new developer will otherwise mistake each for a bug.

1. **`packages/shared/` is an empty placeholder.** Not wired to anything.
   `apps/api/` is now real (the Railway scheduler), but it deliberately
   implements no business logic — see section 12.
2. **RLS covers only `"user"`.** Migration `0074` enables it there as a
   backstop. Every other table still relies entirely on application-code
   authorization (section 5). `packages/db/rls/` is still only a README.
3. **Escrow is schema-only.** Tables exist; no server action, route or cron
   captures, holds or releases funds.
4. **`PolicyEngine` is only partly wired.** `canMint` reaches the real
   mint-voucher route; `canList` and `canSecondarySell` have no call sites.
5. **Duplicate migration number `0057`** — harmless, see section 6.
6. **The admin area lives under `/physical-wall/admin/*`,** which no longer
   describes its scope. Renaming was considered and explicitly rejected:
   `/admin` was already taken by an unrelated password-gated tool, and a route
   group restructure was judged large and risky. URLs are intentionally stable.
7. **Two sibling admin surfaces exist:** role-based
   (`/physical-wall/admin`) and a legacy shared-password tool (`/admin/tiles`).
   Different auth models.
8. **32 lint warnings**, all `no-unused-vars` on underscore-prefixed stubs plus
   one `react-hooks/exhaustive-deps`. Zero errors.

---

## 12. The Railway scheduler (`apps/api`)

Deployed separately from `apps/web`. It owns **timing only**.

```
apps/api/
  src/index.js        HTTP server (/health, /status, POST /trigger/<job>) + croner
  src/jobs.js         The 7 jobs: name, endpoint path, cron expression
  src/run-job.js      One HTTP call with retries, backoff and structured logs
  src/run-job.test.js 10 tests, no network — global fetch is stubbed
  Dockerfile          Built from the REPO ROOT (pnpm workspace needs the lockfile)
  railway.json        Start command, /health check, on-failure restart
```

It calls `apps/web`'s existing `/api/cron/*` endpoints with the shared
`CRON_SECRET` rather than importing the job logic. Every job reaches into
`apps/web` through `@/` aliases, so importing it would mean either duplicating
logic that drifts or depending on the whole Next.js app. This way the handlers
stay unchanged and still covered by their tests, and the cutover is reversible
by restoring the `crons` array in `apps/web/vercel.json`.

Behaviour worth knowing: 3 attempts with exponential backoff; **4xx is not
retried** (a wrong secret stays wrong, so retrying only delays the log line
that says so); overlapping ticks are skipped rather than run concurrently;
SIGTERM lets an in-flight job finish. Logs use the same `cron.start` /
`cron.end` / `cron.error` shape as `runCron` in `apps/web/src/lib/cron.ts`, so
one query spans both services.

Timezone is `Asia/Kolkata`, not the UTC Vercel Cron used — a real change in when
jobs fire.

## 11. Suggested reading order

1. [`AGENTS.md`](../../AGENTS.md) — conventions and the verification rules
2. [`apps/web/src/config/site.ts`](../../apps/web/src/config/site.ts) — feature flags
3. [`apps/web/src/proxy.ts`](../../apps/web/src/proxy.ts) — every request starts here
4. [`apps/web/src/lib/session.ts`](../../apps/web/src/lib/session.ts), then [`features/physical-wall/authorize.ts`](../../apps/web/src/features/physical-wall/authorize.ts) — the security model
5. [`apps/web/src/features/physical-wall/actions/shared.ts`](../../apps/web/src/features/physical-wall/actions/shared.ts) — the contract every mutation follows
6. [`apps/web/src/features/physical-wall/actions/booking.ts`](../../apps/web/src/features/physical-wall/actions/booking.ts) — that contract applied, with real row locks
7. [`packages/db/src/schema.ts`](../../packages/db/src/schema.ts) — the data model
8. [`apps/web/src/app/physical-wall/book/`](../../apps/web/src/app/physical-wall/book/) — the UI on top of 5 to 7
9. [`BIBLE.md`](../../BIBLE.md) — the product rules the code is written against
