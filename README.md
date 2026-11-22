# ArtWall

India's art operating system — an artist registry, exhibition engine,
provenance and certification layer, and a physical-wall rental marketplace.

> **Note on scope.** Earlier revisions of this file described a "pre-launch
> waitlist site". That is long out of date: this repository is a full
> application with 71 SQL migrations, ~35 feature domains, a role-based admin
> area, payments, and on-chain provenance. If a document in this repo
> contradicts the code, trust the code and see
> [`docs/archive/`](docs/archive/) for which documents are known to be stale.

## Where things are

```
apps/web/            The Next.js application — the only deployed app
  src/app/           Routes (App Router). 24 API route handlers under app/api/
  src/features/      One folder per domain; <domain>/actions.ts = server actions
  src/components/    Reusable UI with no feature knowledge
  src/lib/           Auth, db client, session, rate limiting, blockchain
  src/config/        Site constants and feature flags
  scripts/           Seeding and operational scripts
  e2e/               Playwright specs
packages/db/         Drizzle schema, SQL migrations, migration runner, RLS
packages/security/   HMAC verify, URL allowlists, PII redaction, CSP, role policy
packages/ratelimit/  Rate-limit policies, Postgres + Upstash stores
packages/cache/      Typed cache over in-memory or Upstash Redis
contracts/           Solidity (Foundry) — the COA contract and its tests
docs/                Specifications, architecture, runbooks, archive
apps/api/            Railway cron scheduler (plain Node + croner)
packages/shared/     Placeholder. Empty.
```

For how a request actually flows through these, read
[`docs/architecture/REPOSITORY_MAP.md`](docs/architecture/REPOSITORY_MAP.md).

## Stack

Next.js 16 (App Router, Turbopack) · React 19 · TypeScript (strict) ·
Tailwind CSS v4 · shadcn/ui on Base UI · Drizzle ORM over Supabase Postgres ·
Supabase Auth (email/password + Google OAuth) · Zod · Vitest · Playwright ·
pnpm workspaces.

**Deployment:** `apps/web` on Vercel · `apps/api` (cron scheduler) on Railway ·
Postgres and auth on Supabase · images on Cloudinary.

Integrations: Cloudinary (signed uploads), Razorpay (payments), Resend (email),
Pinata/IPFS, wagmi + RainbowKit on Base Sepolia, Upstash Redis (optional),
Anthropic (AI assistant).

## Prerequisites

- Node.js ≥ 22
- pnpm ≥ 10 — `corepack enable` picks up the pinned version
- A Supabase project (Postgres + Auth). `postgres:17` in Docker is fine for
  running the test suite locally.
- Foundry, only if you are working in `contracts/`

## Getting started

```bash
pnpm install
cp apps/web/.env.example apps/web/.env    # then fill in real values
pnpm db:migrate                            # applies packages/db/migrations in order
pnpm dev                                   # http://localhost:3000
```

`DATABASE_URL`, `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`
are the values you cannot start without. Every other variable is documented
inline in [`apps/web/.env.example`](apps/web/.env.example).

Supabase gives two connection strings. Use the **transaction pooler (6543)** for
`DATABASE_URL` and the **direct connection (5432)** for
`DATABASE_URL_UNPOOLED` — migrations need the direct one, because the
transaction pooler cannot run DDL.

> **Before running a migration locally**, confirm `DATABASE_URL`'s hostname is
> the Supabase project your deployment uses. This has drifted before — a stale
> dev branch sat in `.env` while production had moved — and caused real
> confusion about what was deployed. See [`AGENTS.md`](AGENTS.md).

Both the physical wall and marketplace checkout are behind flags that default
to off (`PHYSICAL_WALL_ENABLED`, `MARKETPLACE_CHECKOUT_ENABLED` — see
`apps/web/src/config/site.ts`). Set them to `true` locally to see those routes.

## Commands

Run from the repository root.

| Command | What it does |
| --- | --- |
| `pnpm dev` | Dev server, Turbopack |
| `pnpm build` | Production build. **Needs a reachable `DATABASE_URL`** — `sitemap.ts` queries the DB at build time |
| `pnpm start` | Serve a production build |
| `pnpm typecheck` | `next typegen && tsc --noEmit`, across every workspace package |
| `pnpm lint` | ESLint |
| `pnpm test` | Vitest unit suite, every package |
| `pnpm test:db` | Integration suite against a real Postgres (`vitest.db.config.ts`) |
| `pnpm test:e2e` | Playwright |
| `pnpm db:migrate` | Apply `packages/db/migrations/*.sql` in filename order |
| `pnpm db:check` | Inspect the connected database |
| `pnpm format` | Prettier |

### Verification before calling anything done

`pnpm typecheck` and `pnpm lint` are necessary but **not sufficient**.
`tsc --noEmit` does not catch a Client Component importing from a Server
Component file — that passes typecheck and breaks the real build. Always run a
full `pnpm build`. See [`AGENTS.md`](AGENTS.md).

## Database

Schema and migrations live in [`packages/db/`](packages/db/):

- `src/schema.ts` — the Drizzle schema
- `migrations/*.sql` — plain SQL, applied in filename order
- `scripts/migrate.mjs` — the runner; records applied files in `_migrations`,
  keyed by **filename**, so re-running is safe and only new files execute

Verify every new migration against a disposable local Postgres before it
touches the real database. Reading the SQL is not verification.

```bash
docker run -d -e POSTGRES_PASSWORD=test -p 5433:5432 postgres:17
DATABASE_URL=postgresql://postgres:test@localhost:5433/postgres \
  node packages/db/scripts/migrate.mjs
```

## Authentication

Supabase Auth. Identity is read from a **verified JWT**, never from the session
cookie's contents.

- [`apps/web/src/lib/session.ts`](apps/web/src/lib/session.ts) —
  `getSessionUser()`, the single place identity is resolved. Uses
  `supabase.auth.getClaims()`, **not `getSession()`**: the cookie is forgeable,
  so its embedded user object cannot be trusted for authorization.
- [`apps/web/src/proxy.ts`](apps/web/src/proxy.ts) — refreshes the token. A
  Server Component cannot write headers, so this is the only place a refreshed
  auth cookie can be set. Without it, users log out at random.
- [`apps/web/src/features/onboarding/auth-actions.ts`](apps/web/src/features/onboarding/auth-actions.ts) —
  credential sign-in/sign-up run here as **server actions**, so this project's
  rate limiter (credential stuffing, fail-closed) stays on the path. A
  browser-side Supabase call would bypass it. OAuth is the exception: a
  redirect, not a credential submission.
- [`apps/web/src/lib/auth.ts`](apps/web/src/lib/auth.ts) — compatibility shim
  for the 20 pre-migration call sites. New code calls `getSessionUser()`.

`public."user"` is the **profile** table, keyed by the same uuid as
`auth.users.id` with `on delete cascade` (migration `0074`). Supabase Auth owns
credentials; `role`, `onboardingPersona` and the verification columns stay
ours, synced by the `handle_new_user` trigger — which deliberately never
touches `role` or persona.

## Deployment

| Target | What | Config |
| --- | --- | --- |
| **Vercel** | `apps/web` — pages, server actions, auth, API routes, the Razorpay webhook | `apps/web/vercel.json` |
| **Railway** | `apps/api` — schedules the 7 cron jobs by calling `apps/web`'s endpoints | `apps/api/railway.json`, `apps/api/Dockerfile` |
| **Supabase** | Postgres + Auth | `packages/db/migrations/` |
| **Cloudinary** | Images, signed direct-to-cloud uploads | `apps/web/next.config.ts` |

> **Deploy Railway before Vercel on the first cutover.** The `crons` array has
> been removed from `vercel.json` to stop jobs running twice, so until the
> Railway service is live, nothing is scheduled. See
> [`apps/api/README.md`](apps/api/README.md).

## Core model — three separate axes

Do not conflate these. A past session did, and it cost real debugging time.

1. **`user.role`** — a flat internal access tier: `visitor | artist | staff | admin`.
   Not a marketplace persona.
2. **Persona** — artist / curator / buyer, tracked via `user.onboardingPersona`
   and the `artistProfiles` / `curators` tables. A user can hold a persona
   without `role` ever changing.
3. **Admin team roles** — a third, additive axis: `admin_role_assignments`
   joined to `admin_roles`, checked via `hasAdminRole` / `requireAdminRole` in
   `apps/web/src/features/physical-wall/authorize.ts`.

## Documentation

| Where | What |
| --- | --- |
| [`BIBLE.md`](BIBLE.md) | Product rules that constrain code; index into the 165-page Product Bible |
| [`AGENTS.md`](AGENTS.md) | Stable engineering conventions |
| [`HANDOFF.md`](HANDOFF.md) | Current implementation status — expect it to go stale |
| [`docs/architecture/`](docs/architecture/) | Repository map, architecture decisions, refactor changelog |
| [`docs/db/`](docs/db/) | Schema invariants and the ledger model |
| [`docs/plans/`](docs/plans/) | Active plans |
| [`docs/runbooks/`](docs/runbooks/) | Operations — incident response, seeding, testing |
| [`docs/security/`](docs/security/) | ASVS baseline, DPDP data-processing inventory |
| [`docs/product/`](docs/product/) | Canonical product specs and the WMS spec PDFs |
| [`docs/archive/`](docs/archive/) | Superseded documents, with notes on what each got wrong |

Design and product decisions trace back to
[`docs/product/ArtWall_Creative_Blueprint.md`](docs/product/ArtWall_Creative_Blueprint.md)
and
[`docs/product/ArtWall_Experience_Design_System.md`](docs/product/ArtWall_Experience_Design_System.md).

## Security

- No secret is committed. CI runs gitleaks over full history on every push.
- `.env*` is gitignored except `.env.example`, which holds no values.
- Server-only modules carry `import "server-only"` — a build error if a
  browser bundle imports them, so a connection string cannot leak client-side.
- CSP is set per-request with a nonce in `apps/web/src/proxy.ts`, not in
  `next.config.ts`, so `script-src` needs no `'unsafe-inline'`.
- Never echo credentials in any output.

## CI

[`.github/workflows/ci.yml`](.github/workflows/ci.yml) runs on every push and
PR: typecheck, lint, build (against a migrated Postgres), full Vitest suite with
per-module coverage floors, idempotent-migration check, gitleaks, a
high/critical dependency audit, and `forge build` + `forge test` for contracts.
Playwright E2E is opt-in via the `E2E_ENABLED` repository variable.
