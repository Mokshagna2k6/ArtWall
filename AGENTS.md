<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Repo layout (pnpm workspace, `production-v2`)

- `apps/web` is the Next.js app (`src/`, `scripts/`, configs, `.env`). Run app commands from the root (`pnpm dev|build|typecheck|lint|test`) or with `pnpm --filter @artwall/web <script>`; `node_modules/next/dist/docs/` resolves under `apps/web/node_modules/next` (or the root `node_modules/.pnpm`).
- `packages/db` holds the Drizzle schema, the SQL migrations and the migration runner; `contracts/` (Foundry) stays at the repo root. DB scripts read `apps/web/.env`.
- `packages/db`, `packages/security`, `packages/ratelimit` and `packages/cache` are real, consumed packages. `apps/api` is the **Railway cron scheduler** (plain Node + croner; it calls `apps/web`'s `/api/cron/*` endpoints on a schedule — it does not reimplement them). `packages/shared` is still an empty placeholder.
- Repository layout, request flow, the auth model and the known architectural limits are documented in `docs/architecture/REPOSITORY_MAP.md`.

# ArtWall — project conventions

Current implementation status, remaining work, and anything time-sensitive lives in `HANDOFF.md`, not here. This file is for conventions that don't change week to week.

## Stack

Next.js 16 App Router (Turbopack) · React 19 · TypeScript · Tailwind v4 · Drizzle ORM over **Supabase** Postgres · **Supabase Auth** · Zod · Vitest · pnpm.

Deployment: `apps/web` on Vercel, `apps/api` (the cron scheduler) on Railway, images on Cloudinary.

## Core model — do not conflate these

- `user.role` is a flat internal access tier: `visitor | artist | staff | admin`. It is **not** a marketplace persona.
- Persona (artist / curator / buyer) is tracked separately via `user.onboardingPersona` and the `artistProfiles` / `curators` tables. A user can hold a persona without `role` ever changing.
- Admin team roles (Super Admin, Operations, Finance, Content, Support, Analytics, Wall Network, Blockchain, plus the non-Bible `curator_admin`/`compliance_admin`) are a **third**, additive axis: `admin_role_assignments` joined to `admin_roles`, checked via `hasAdminRole`/`requireAdminRole`/`requireAnyAdminRolePage` in `src/features/physical-wall/authorize.ts`. Granting any of these also sets `user.role = 'admin'`, since the admin area's page-level gate checks that column too.

## Authentication (Supabase Auth)

Identity comes from a **verified JWT**, never from a session cookie's contents. `getSessionUser()` in `src/lib/session.ts` is the single place that resolves it, via `supabase.auth.getClaims()` — **never `getSession()`**, whose embedded user object is forgeable and must not be trusted for authorization. All 53 `getSessionUser`/`getActor` call sites funnel through that one function.

`src/lib/auth.ts` is a compatibility shim exposing `auth.api.getSession({ headers })` for the 20 pre-migration call sites. New code calls `getSessionUser()` directly.

`public."user"` is the **profile** table, keyed by the same uuid as `auth.users.id` with an FK and `on delete cascade` (migration 0074). Supabase Auth owns credentials; `role`, `onboardingPersona` and the verification columns stay ours. The `handle_new_user` trigger keeps id/email/emailVerified in step and deliberately never touches `role` or persona.

**Credentials go through server actions** (`src/features/onboarding/auth-actions.ts`), not through a browser-side Supabase call: that is what keeps this project's rate limiter (credential stuffing, fail-closed) on the path. OAuth is the exception — it is a redirect, not a credential submission.

## Server actions

Most of `src/features/*/actions.ts` follow one contract — `parseInput` (Zod) → `attempt`/`readSafely` → `Result<T>` — defined in `src/features/physical-wall/actions/shared.ts`. An existing test (`action-contracts.test.ts`) statically scans action files for this shape; match it rather than inventing a new return convention.

## Migrations

Raw SQL in `packages/db/migrations/*.sql`, applied in filename order by `node packages/db/scripts/migrate.mjs` (`pnpm db:migrate`) (ledger keyed by filename, not parsed number — a numbering collision between two files is survivable but confusing). Before adding one: run `ls packages/db/migrations | sort -V | tail -5` fresh to get the real next number, never trust a number from earlier in a conversation. Verify every migration against a disposable local Postgres (`docker run -d -e POSTGRES_PASSWORD=test -p <free-port>:5432 postgres:17`, then `DATABASE_URL=... node packages/db/scripts/migrate.mjs`) before it ever touches the real database — reading the SQL is not verification.

**Local `.env`'s `DATABASE_URL` must point at the same Supabase project the deployment uses.** This has drifted at least once (a stale dev branch sat in `.env` while production had moved to a different project) and caused real confusion about what was actually deployed. Confirm the hostname matches before trusting any local migration run reflects deployed state.

Supabase gives two connection strings: the **transaction pooler (6543)** for `DATABASE_URL`, and the **direct connection (5432)** for `DATABASE_URL_UNPOOLED`. Migrations need the direct one — the transaction pooler cannot run DDL or hold advisory locks.

## Verification before calling anything done

`pnpm typecheck` and `pnpm lint` are necessary but not sufficient — `tsc --noEmit` does not catch a Client Component importing from a Server Component page file, which passes typecheck cleanly but breaks the real Next.js build (`'server-only' cannot be imported from a Client Component module`). Always run a real `pnpm build` before considering a change deploy-ready, not just typecheck. `pnpm build` needs a working `DATABASE_URL` (sitemap generation queries the DB at build time).

## Working style

- Root-cause fixes only — trace the actual cause before writing a fix, never patch a symptom.
- Never echo credentials (API keys, passwords, connection strings, tokens) in any output.
- Production holds real user data — verify destructive or schema-changing work against a disposable database first, not against production directly.
