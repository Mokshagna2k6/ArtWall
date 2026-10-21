# Production decisions log

Companion to `PRODUCTION_SCALE_PLAN.md`. Decisions here were made by Claude on
the user's standing instruction ("do whichever suits best; ask only critical
questions") unless marked USER.

---

## 2026-10-21 — architecture settled (supersedes the staged plan below)

**USER decision:** go to Supabase and Railway now, in one step, accepting data
loss. The earlier three-stage plan (Stage 1 Supabase Postgres, Stage 2 Supabase
Auth + Railway, Stage 3 data cutover) was explicitly overridden: *"Just
overwrite the plans we are using railway and supabase from now on. Even if we
lose data it won't be a problem."*

| # | Decision | Rationale |
| --- | --- | --- |
| 1 | **Database: Supabase Postgres.** `DATABASE_URL` is the transaction pooler (6543), `DATABASE_URL_UNPOOLED` the direct connection (5432). | Supabase is Postgres, so the Drizzle schema and all 71 pre-existing migrations applied unchanged. Only the connection strings changed. Migrations need the direct string — the transaction pooler runs no DDL and holds no advisory locks. |
| 2 | **Auth: Supabase Auth**, replacing better-auth (migration `0074`). | USER-approved in full knowledge of the cost. better-auth hashes with scrypt in its own format; Supabase Auth imports bcrypt/argon2/pbkdf2 and cannot read it, so **existing credentials could not be carried over**. This targets a fresh project with no users to preserve. |
| 3 | **`public."user"` survives as the profile table**, keyed by the same uuid as `auth.users.id`, FK with `on delete cascade`. | 26 tables carry a `userId`, and the table holds ten columns Supabase Auth knows nothing about — `role`, `onboardingPersona`, `foundingMember`, `identityVerified`, `artistVerificationStatus`, `ageDeclaredAdult`, the nominee and verification fields. Those are the product's own three identity axes and must not collapse into auth metadata. The `handle_new_user` trigger syncs id/email/emailVerified and deliberately never touches role or persona. |
| 4 | **Identity is read from a verified JWT only** — `supabase.auth.getClaims()`, never `getSession()`. | Supabase's own docs: the session cookie is forgeable, so its embedded user object cannot be trusted for authorization. Every `requireRole`/`requireAdminRole` gate resolves its actor through `getSessionUser()`, so trusting an unverified cookie there would hand an attacker any role they named. |
| 5 | **Credentials go through server actions**, not a browser-side Supabase call (`src/features/onboarding/auth-actions.ts`). | A browser-side `signInWithPassword` reaches Supabase directly and **bypasses this project's rate limiter**, losing the credential-stuffing protection built in PERF-1.05. Supabase's own limits are per-project and not tunable per identifier, so they do not replace it. OAuth is the exception: a redirect, not a credential submission. |
| 6 | **`src/lib/auth.ts` kept as a compatibility shim** exposing `auth.api.getSession({ headers })`. | 20 files called it, and every one used only that method (verified by grep). The shim meant 20 authorization paths did not have to be edited and re-reviewed, which is the opposite of what a security-sensitive migration wants. New code calls `getSessionUser()`. |
| 7 | **RLS enabled on `"user"`, as a backstop — not the gate.** | Application code stays the gate (`features/physical-wall/authorize.ts`, default-deny). The policies deliberately grant **no** self-service update on `role`, `onboardingPersona` or the verification columns: a policy covering those would let any signed-in user make themselves an admin. They are written only by the service-role client, which bypasses RLS. |
| 8 | **Railway (`apps/api`) schedules the 7 crons by calling `apps/web`'s existing endpoints**, rather than reimplementing them. | Every job reaches into `apps/web` through `@/` aliases. Importing that would mean duplicating logic that drifts, or depending on the whole Next.js app. This way the handlers stay unchanged and still covered by their tests, and the cutover is reversible by restoring the `crons` array in `vercel.json`. |
| 9 | **`crons` removed from `apps/web/vercel.json`.** | Leaving it would run every job twice. **Consequence: deploy the Railway service BEFORE the web app, or nothing is scheduled at all.** |
| 10 | **Cron timezone is `Asia/Kolkata`, not UTC.** | Vercel Cron was UTC-only. The business runs on IST and the schedules were written for it. This is a real change in when jobs fire — relevant when comparing logs across the cutover. |
| 11 | **Migration `0074` is guarded on the `auth` schema existing.** | CI applies every migration to a bare `postgres:17` in four jobs. Unguarded references to `auth.users` would fail all four. On Supabase everything applies; on plain Postgres the retype and table drops still run, so the schema matches except for the Supabase-owned links. |
| 12 | **Checkout flag stays OFF** until legal/finance sign-off (RBI payment-aggregator/escrow, GST/TCS/TDS, return terms, retention vs DPDP) and real commission figures are set in `commission_policy_versions`. | Unchanged from 2026-10-10. External sign-off is not something code can resolve. |

### Not done, and why

- **Razorpay webhook left on Vercel.** USER chose "move the 7 crons" over
  "crons + webhook". Moving it requires re-registering the URL in the Razorpay
  dashboard at cutover or payment confirmations silently stop.
- **`packages/shared` still empty.** Nothing needed it.
- **Migration `0074` not verified against a real Postgres.** Docker was
  unavailable in the session that wrote it. `AGENTS.md` is explicit that reading
  SQL is not verification — **this is an open risk, see `HANDOFF.md`.**

---

## 2026-10-10 — superseded

Kept for the reasoning, which still explains why the code looks as it does.
**The staging described here was abandoned on 2026-10-21** (see above); the
three-stage rollout never happened.

| # | Decision | Rationale |
| --- | --- | --- |
| 1 | **Railway (`apps/api`) runs:** cron jobs, payment/webhook processing, certificate PDF generation/archive, IPFS/mint workers. **Vercel (`apps/web`) keeps:** pages, server actions, auth, read APIs. | Long-running, retryable or secret-heavy jobs don't suit serverless time limits. *Partly implemented: crons moved; webhooks, PDF and mint workers stayed on Vercel.* |
| 2 | **Auth migration:** Supabase Auth only. Existing email/password users get a one-time password reset rather than hash import. | better-auth's scrypt format is not importable. *Implemented as a clean break instead — no users to migrate.* |
| 4 | **Deploy mechanics:** production deployed with `vercel --prod` from a local checkout; migrations run manually before deploy. | Observed from history. *Still true for `apps/web`.* |
| 5 | **Isolation:** `production-v2` exists on `Mokshagna2k6/ArtWall` only. | Old project is wired to the stackfox repo. |

## Process notes

- Pushing to `stackfoxtech-maker/ArtWall` works with the keyring `gho_` login:
  `env -u GITHUB_TOKEN git -c credential.helper= -c "credential.helper=!gh auth git-credential" push stackfox ...`
- The harness blocks pulling Vercel prod env values and running hosted
  migrations from Claude; the user runs those two.
