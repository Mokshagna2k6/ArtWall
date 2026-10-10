<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Repo layout (pnpm workspace, `production-v2`)

- `apps/web` is the Next.js app (`src/`, `scripts/`, configs, `.env`). Run app commands from the root (`pnpm dev|build|typecheck|lint|test`) or with `pnpm --filter @artwall/web <script>`; `node_modules/next/dist/docs/` resolves under `apps/web/node_modules/next` (or the root `node_modules/.pnpm`).
- `db/migrations` and `contracts/` stay at the repo root for now; `apps/web/scripts/*.mjs` reach them via `../../db`. DB scripts read `apps/web/.env`.
- `apps/api` and `packages/*` are placeholders until each is extracted (see `docs/plans/PRODUCTION_SCALE_PLAN.md` §2c/§2d).

# ArtWall — project conventions

Current implementation status, remaining work, and anything time-sensitive lives in `HANDOFF.md`, not here. This file is for conventions that don't change week to week.

## Stack

Next.js 16 App Router (Turbopack) · React 19 · TypeScript · Tailwind v4 · Drizzle ORM over Neon Postgres · better-auth · Zod · Vitest · pnpm.

## Core model — do not conflate these

- `user.role` is a flat internal access tier: `visitor | artist | staff | admin`. It is **not** a marketplace persona.
- Persona (artist / curator / buyer) is tracked separately via `user.onboardingPersona` and the `artistProfiles` / `curators` tables. A user can hold a persona without `role` ever changing.
- Admin team roles (Super Admin, Operations, Finance, Content, Support, Analytics, Wall Network, Blockchain, plus the non-Bible `curator_admin`/`compliance_admin`) are a **third**, additive axis: `admin_role_assignments` joined to `admin_roles`, checked via `hasAdminRole`/`requireAdminRole`/`requireAnyAdminRolePage` in `src/features/physical-wall/authorize.ts`. Granting any of these also sets `user.role = 'admin'`, since the admin area's page-level gate checks that column too.

## Server actions

Most of `src/features/*/actions.ts` follow one contract — `parseInput` (Zod) → `attempt`/`readSafely` → `Result<T>` — defined in `src/features/physical-wall/actions/shared.ts`. An existing test (`action-contracts.test.ts`) statically scans action files for this shape; match it rather than inventing a new return convention.

## Migrations

Raw SQL in `db/migrations/*.sql`, applied in filename order by `node scripts/migrate.mjs` (ledger keyed by filename, not parsed number — a numbering collision between two files is survivable but confusing). Before adding one: run `ls db/migrations | sort -V | tail -5` fresh to get the real next number, never trust a number from earlier in a conversation. Verify every migration against a disposable local Postgres (`docker run -d -e POSTGRES_PASSWORD=test -p <free-port>:5432 postgres:17`, then `DATABASE_URL=... node scripts/migrate.mjs`) before it ever touches the real database — reading the SQL is not verification.

**Local `.env`'s `DATABASE_URL` must point at the same Neon instance Vercel production uses.** This has drifted at least once (a stale dev branch sat in `.env` while production had moved to a different Neon project) and caused real confusion about what was actually deployed. Confirm the hostname matches before trusting any local migration run reflects production state.

## Verification before calling anything done

`pnpm typecheck` and `pnpm lint` are necessary but not sufficient — `tsc --noEmit` does not catch a Client Component importing from a Server Component page file, which passes typecheck cleanly but breaks the real Next.js build (`'server-only' cannot be imported from a Client Component module`). Always run a real `pnpm build` before considering a change deploy-ready, not just typecheck. `pnpm build` needs a working `DATABASE_URL` (sitemap generation queries the DB at build time).

## Working style

- Root-cause fixes only — trace the actual cause before writing a fix, never patch a symptom.
- Never echo credentials (API keys, passwords, connection strings, tokens) in any output.
- Production holds real user data — verify destructive or schema-changing work against a disposable database first, not against production directly.
