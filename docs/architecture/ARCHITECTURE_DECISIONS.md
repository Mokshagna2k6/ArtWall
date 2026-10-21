# Architecture decisions

Decisions that shape this repository, and why. Most were made before the
2026-10-21 structural cleanup and are recorded here because they were only
discoverable by reading code comments — a new developer would otherwise
reasonably assume each was an accident.

A decision being recorded here does not mean it is permanently right. Each entry
separates **what is true now** from **what might change**.

Formal ADRs live in [`../adr/`](../adr/). This file is the broader survey.

---

## 1. Two deployed applications: Vercel for the app, Railway for the schedule

**Changed 2026-10-21.** Previously one deployed app; `apps/api` was an empty
placeholder and the crons ran on Vercel Cron.

`apps/web` (Vercel) still holds all UI and all server logic — 74 `server-only`
modules, 16 server-action domains, 24 route handlers, including the Razorpay
webhook. `apps/api` (Railway) now runs, but deliberately contains **no business
logic**: it is a scheduler that calls `apps/web`'s existing `/api/cron/*`
endpoints with the shared `CRON_SECRET`.

Why it does not import the job logic: every job reaches into `apps/web` through
`@/` aliases (`@/lib/cron`, `@/lib/db`, `@/features/...`). Importing that would
mean either duplicating logic that then drifts, or making the scheduler depend
on the whole Next.js app. Keeping it an HTTP caller means the handlers are
unchanged, still covered by their existing tests, and the cutover is reversible
by restoring the `crons` array in `apps/web/vercel.json`.

What this actually bought: Vercel's Hobby plan allows **daily** crons only, a
limit this project had already hit. A daily `uptime-check` can miss an outage by
24 hours. Railway has no such limit, so frequency is now a decision rather than
a restriction. The schedules were left unchanged for the cutover.

What it cost: a second deploy target, a second place secrets live, and an
ordering constraint — **Railway must be deployed before the web app**, because
`vercel.json` no longer schedules anything.

The Razorpay webhook, PDF generation and mint workers stayed on Vercel. Moving
the webhook requires re-registering its URL in the Razorpay dashboard at
cutover or payment confirmations silently stop, which was judged not worth
bundling into this change.

### Superseded: one deployed application

The reasoning below is kept because it explains why `apps/api` sat empty for so
long, and it still applies to everything that did *not* move.

**Previously retained as-is.**

`apps/web` is the only deployed app. All server logic lives in it: 74
`server-only` modules, 16 server-action domains, 24 API route handlers.

`apps/api/` exists as a directory with a `package.json` and a `README.md`
describing a future Railway backend for webhooks, crons, workers, PDF and mint
jobs. **It has no entry point and no runtime.** Those workloads currently run as
Vercel Cron routes under `apps/web/src/app/api/cron/` and are scheduled in
`apps/web/vercel.json`.

Why not populate it now: nothing in the current system is blocked by the lack of
a separate backend. The seven cron jobs run on Vercel's daily schedule and the
heaviest job (PDF generation) completes within the function timeout. Splitting
would add a deployment target, a second set of secrets, and a network hop
between code that currently shares a type system and a process.

What would change this: a workload that exceeds Vercel's function limits, a need
for sub-daily cron cadence (Hobby plan allows daily only — a constraint this
project has already hit), or long-running queue workers.

The intended extraction is specified in
[`../plans/PRODUCTION_SCALE_PLAN.md`](../plans/PRODUCTION_SCALE_PLAN.md)
sections 2c and 2d. Until then `apps/api/` and `packages/shared/` are **intent,
not architecture**, and the repository map says so.

---

## 2. Frontend and backend separated by import boundary, not by folder

**Retained, and deliberately not changed during the 2026-10-21 cleanup.**

There is no `frontend/` or `backend/` directory. The split is enforced by
`import "server-only"` on 74 files and `"use client"` on client components.

Why a folder split was rejected: the App Router discovers routes from directory
structure, and a route's server and client halves must be co-located. Moving
server files into `backend/` would delete those routes from the router. More
importantly, `server-only` is a **stronger** guarantee than a folder — it fails
the build, where a folder is only a convention. That failure mode is real and
documented in [`../../AGENTS.md`](../../AGENTS.md): a Client Component importing
from a Server Component file passes `tsc --noEmit` cleanly and breaks
`pnpm build`.

Trade-off accepted: a reader cannot tell server from client by looking at the
directory tree alone. Mitigated by documenting it in
[`REPOSITORY_MAP.md`](REPOSITORY_MAP.md) section 2 and by the convention that
server logic for a domain lives in `features/<domain>/actions.ts`.

---

## 3. Feature-sliced organization, not layer-sliced

**Retained.**

`src/features/<domain>/` holds the UI and the server logic for one slice of
product. There is no `services/`, `controllers/`, or `repositories/` layer.

Why: with 32 domains, a layer split would mean a change to one feature touches
four directories. The feature slice keeps a change local. The three-tier
component rule (`components/` has no feature knowledge, `features/` is
single-purpose, `shared/` is promoted only on a second consumer) prevents the
slice from becoming a dumping ground.

Why no repository layer was added: Drizzle already is the data-access
abstraction. A repository layer over it would be a second abstraction wrapping
the first, with no behavior of its own.

---

## 4. Two database clients, chosen per call site

**Retained — and this one is a correctness constraint, not a preference.**

| Client | Where | Capability |
| --- | --- | --- |
| Neon HTTP, `getSql()` | `apps/web/src/lib/db.ts` | Single statements. Works in serverless and edge. **Cannot hold a transaction or a row lock.** |
| `pg` Pool, `pool` | `@artwall/db` | Transactions and row locks, via `inTransaction` |

The Neon driver speaks HTTP, so each statement is an independent request. A
multi-slot booking written against it would have **no atomicity at all**.
Anything that must be all-or-nothing goes through `inTransaction` in
`features/physical-wall/actions/shared.ts`.

The HTTP client is created lazily so that importing the module during a build —
where `DATABASE_URL` may legitimately be absent — does not throw and break
prerendering.

Do not "simplify" this to one client.

---

## 5. Database schema extracted to `packages/db`, app-side shims kept

**Retained.**

Schema, migrations and the runner live in `packages/db`.
`apps/web/src/lib/db/index.ts` and `schema.ts` are two-line re-export shims that
keep `server-only` on the app side.

Why keep the shims: the extraction would otherwise have required rewriting every
`@/lib/db` import across the app in the same commit. The shims made the move
mechanical and reversible. They also keep `server-only` where it belongs — on
the app boundary, so the package itself stays importable by scripts that run
outside Next.js (`scripts/migrate.mjs`).

Cost: two ways to import the same thing. Accepted; the map states the preference
(`@/lib/db` inside `apps/web`).

---

## 6. Raw SQL migrations with a filename-keyed ledger

**Retained.**

71 files in `packages/db/migrations/*.sql`, applied in filename order by
`packages/db/scripts/migrate.mjs`, recorded in `_migrations` **by filename**.

Consequence: two files may share a number and both still apply exactly once.
`0057_be3_escrow_release_state.sql` and `0057_collections_rebuild.sql` do
exactly this. It is confusing but harmless, and renumbering an already-applied
migration would be worse. The mitigation is procedural, in `AGENTS.md`: run
`ls packages/db/migrations | sort -V | tail -5` before adding one.

Why raw SQL rather than Drizzle-generated migrations: several migrations do
things a schema differ cannot express — seeding `admin_roles`, a real data
migration renaming `readonly_admin` to `analytics_admin` (`0059`), revoking
TRUNCATE on append-only tables (`0035`). Those need hand-written SQL, and
mixing generated and hand-written migrations in one directory is worse than
hand-writing all of them.

`migrations-check.mjs` asserts every migration applies **twice** to an empty
database without changing the schema on the second pass. It runs in CI.

---

## 7. Authorization in application code, with RLS as a partial backstop

**Partly changed 2026-10-21:** migration `0074` enables RLS on `"user"`. Every
other table is still application-code only.

The gate is unchanged — every check is a function call in
`apps/web/src/features/physical-wall/authorize.ts`, default-deny. RLS on
`"user"` is a second line of defense, not a replacement.

What the policies deliberately do **not** allow: there is no self-service
update on `role`, `onboardingPersona` or the verification columns. A policy
covering those would let any signed-in user make themselves an admin. They are
written only by server-side code through the service-role client, which
bypasses RLS.

The risk below is therefore reduced for one table and unchanged for the rest.

### Superseded: no row-level security at all

**Previously retained, with a caveat.**

Every gate is a function call in
`apps/web/src/features/physical-wall/authorize.ts`, default-deny.
`packages/db/rls/` contains **only a README** — RLS is described, not
implemented.

Why this is defensible now: the app connects as a single database role, so RLS
would need the per-request user identity pushed into a session variable on every
connection — real complexity for a pooled serverless client. The
application-code gate is also what lets every privileged write name a *person*
in `pw_audit_log`, which the spec requires and which a shared-password gate
cannot do.

Why it is a caveat: it means a direct database connection, or a query that
forgets its gate, has no second line of defense. The mitigation is
`action-contracts.test.ts`, which statically scans action files for the expected
shape, plus the BOLA/IDOR test requirement in the archived SEC-2 tracker.

**This is the most significant open architectural risk in the repository.**

---

## 8. Three separate identity axes, never conflated

**Retained — and this is the single most important thing to understand.**

1. `user.role` — `visitor | artist | staff | admin`. A flat internal access
   tier. **Not** a marketplace persona.
2. **Persona** — artist, curator, buyer. `user.onboardingPersona` plus the
   `artistProfiles` / `curators` tables. A user can hold a persona without
   `role` ever changing.
3. **Admin team roles** — `admin_role_assignments` joined to `admin_roles`. A
   third, *additive* axis. `super_admin` bypasses every check.

Granting any admin role also sets `user.role = 'admin'`, because the admin
area's page-level gate checks that column too. That coupling was a deliberate
fix: granting a granular role previously left a team member unable to reach the
area they had just been given access to.

`admin_roles` has 10 rows, not the 8 the Bible names. `curator_admin` and
`compliance_admin` have no Bible equivalent and are kept as non-Bible roles
rather than folded into `content_admin` or `operations_admin`, because folding
them would silently mis-grant or revoke permissions from existing holders.
Migration `0059` records the full per-role mapping.

A past session conflated axes 1 and 2 and it cost real debugging time. This is
why the distinction is repeated in `AGENTS.md`, the README, and the map.

---

## 9. CSP in middleware, not in `next.config.ts`

**Retained.**

`apps/web/src/proxy.ts` mints a fresh nonce per request and sets
`Content-Security-Policy`. `next.config.ts` sets only the static headers.

Why: a nonce must be per-request, and `headers()` in `next.config.ts` evaluates
once at build time. Without the nonce, `script-src` needs `'unsafe-inline'` to
let the framework's own bootstrap scripts and the JSON-LD tag run — which
defeats the point of a CSP against XSS.

The usual cost of nonces is forcing dynamic rendering. Here it costs nothing:
every page is already dynamically rendered.

`proxy.ts` has a second job — stamping `x-pathname` so the Server Component root
layout can tell whether it is rendering the public or the admin shell. A Server
Component has no `usePathname()`, and a route-group restructure was ruled out as
too large.

---

## 10. Four shared packages, extracted only where a real boundary existed

**Retained.**

`@artwall/db`, `@artwall/security`, `@artwall/ratelimit`, `@artwall/cache`.
Each ships TypeScript source with no build step, listed in
`next.config.ts`'s `transpilePackages`.

Each earned extraction for a concrete reason, not for tidiness:

- **`security`** — pure, no I/O, and needed by `next.config.ts` and `proxy.ts`,
  which run outside the normal app import graph.
- **`db`** — needed by `scripts/migrate.mjs`, which runs outside Next.js.
- **`ratelimit`** and **`cache`** — each has two interchangeable backends
  (Postgres/Upstash, memory/Upstash), so the interface is the point.

Dependency direction is strictly one-way and acyclic: `apps/web` to
`packages/*`, never the reverse, never package to package.

No `packages/ui` or `packages/config` was created: with one consuming app, a UI
package would be indirection with no second consumer, and shared tooling config
is already handled by the root `prettier` devDependency and per-package
`tsconfig.json`.

---

## 10b. Supabase Auth, with the app keeping its own profile table

**Changed 2026-10-21** (migration `0074`), replacing better-auth. User decision,
made in full knowledge that **existing credentials could not be carried over**:
better-auth hashes with scrypt in its own format, and Supabase Auth imports
bcrypt/argon2/pbkdf2 only.

Four decisions inside this one, each load-bearing:

**1. `public."user"` survives as a profile table.** It is keyed by the same
uuid as `auth.users.id`, with an FK and `on delete cascade`. It was not folded
into auth metadata because 26 tables carry a `userId`, and it holds ten columns
Supabase Auth knows nothing about — `role`, `onboardingPersona`,
`foundingMember`, `identityVerified`, `artistVerificationStatus`,
`ageDeclaredAdult`, the nominee fields and the verification timestamps. Those
are the product's own three identity axes (section 8) and collapsing them into
`raw_user_meta_data` would make them unqueryable and unconstrained. The
`handle_new_user` trigger syncs id/email/emailVerified and deliberately never
touches `role` or persona.

**2. Identity is read only from a verified JWT.** `getSessionUser()` uses
`supabase.auth.getClaims()`, never `getSession()`. Supabase's own documentation
is explicit that the session cookie is forgeable and its embedded user object
must not be trusted for authorization. Since every `requireRole` and
`requireAdminRole` gate resolves its actor through that one function, trusting
an unverified cookie there would hand an attacker any role they named.

**3. Credentials go through server actions, not a browser-side Supabase call.**
A browser-side `signInWithPassword` reaches Supabase's API directly and
bypasses this project's rate limiter, losing the credential-stuffing protection
built as PERF-1.05 (5/15min per IP+email, 20/15min per IP, fail-closed).
Supabase's own limits are per-project and not tunable per identifier, so they
do not replace it. OAuth is the exception — a redirect, not a credential
submission — so it runs in the browser where it must.

**4. `src/lib/auth.ts` kept as a compatibility shim.** 20 files imported
better-auth's `auth` object, and grep confirmed every one used only
`auth.api.getSession({ headers })`. The shim resolves that through
`getSessionUser()`, so 20 authorization paths did not have to be edited and
re-reviewed — the opposite of what a security-sensitive migration wants. New
code calls `getSessionUser()` directly; two ways to read the session is a cost
accepted to keep the blast radius at 6 files instead of 39.

**Also renamed:** `BETTER_AUTH_SECRET` became `SERVER_SECRET`. It was never only
an auth secret — physical-wall QR tokens, UGC upload folder paths and the
wallet-link signature all derive purpose-separated keys from it, and those
features still need one. The old name is read as a fallback so the derived keys
do not change, which matters: a different value would invalidate issued QR
tokens and existing UGC paths.

**Known gap:** migration `0074` has never been run against a real Postgres, and
no sign-in has been performed end to end. See `HANDOFF.md`.

## 11. Documentation organized by lifecycle, with an explicit archive

**Decided 2026-10-21.** See [`REFACTOR_CHANGELOG.md`](REFACTOR_CHANGELOG.md).

Root-level Markdown went from 23 files to 5. The organizing principle is **is
this still true?**, not what the file is about:

- Root keeps only what a developer needs on day one, plus the files tools
  require in place (`AGENTS.md`, `CLAUDE.md`).
- `docs/` keeps current reference material.
- `docs/archive/` keeps superseded documents, each subdirectory carrying a
  README that states **what that document got wrong**.

Why archive rather than delete: several documents are the only written record of
why shipped code looks as it does. `CHANGES-PLAN.md` holds the rationale for the
admin routing decision; `WORK_PLAN.md` is the earliest written evidence that the
README had drifted from reality. Deleting them would lose the reasoning and keep
only the code.

Why they could not stay at the root: they actively misinform.
`FINAL_PRODUCTION_READINESS.md` opens with **NOT READY** — a verdict from
22 Aug 2026 against a superseded spec. `CHANGES-PLAN.md` said "planning only —
nothing implemented yet" about work that has since shipped. A new developer
reading the root directory would have been misled by both.

Conflicts between documents were **preserved and labeled**, not silently
resolved — the email provider (Resend in code, SES in `WORK_PLAN.md`) and the
wallet strategy (wagmi/RainbowKit in code, Privy in the Bible) are both recorded
in `docs/archive/plans/README.md` with the code named as authoritative.

---

## 12. Decisions explicitly left alone

Not endorsements — things that were examined and deliberately not touched,
because changing them was outside a structural cleanup.

| Thing | Why left alone |
| --- | --- |
| Admin area at `/physical-wall/admin/*` | The name no longer fits its scope, but `/admin` is taken by a legacy tool and a route-group restructure is large and risky. URLs are intentionally stable. |
| Two admin surfaces with different auth models | Role-based plus a legacy shared-password tool. Consolidating is a product decision. |
| Escrow tables with no writer | Schema exists, no code path. Building it is feature work. |
| `PolicyEngine` partly wired | `canMint` has a real call site; `canList` and `canSecondarySell` do not. Inventing call sites would be worse than leaving it visible. |
| 32 lint warnings | All `no-unused-vars` on underscore-prefixed stubs plus one `exhaustive-deps`. Zero errors. Silencing them would hide the stubs. |
| 52 git worktrees in `.claude/worktrees/` | Registered worktrees that may hold unmerged work. Pruning is destructive and is the repository owner's call. |
| Dependency versions | A structural cleanup is the wrong change in which to move a version. |
