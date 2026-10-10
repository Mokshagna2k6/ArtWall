# ArtWall — Production-Scale Plan (DRAFT, not final)

_Status: draft started 2026-10-10. The user's intended stack is recorded verbatim in §1; §2 is Claude's recommendations/concerns; §3 lists decisions still open. Update this file as decisions are made — future sessions should plan from it._

## 0. Phasing

- **Phase A (current Vercel project + Neon):** ship the four remaining features (blockchain admin pages, per-slot booking, certificate PDF, buyer checkout) on branch `integration/four-features`. Checkout stays behind `MARKETPLACE_CHECKOUT_ENABLED` (off).
- **Phase B (new production-grade project):** new Vercel project + Supabase, same codebase. A second GitHub repo only if truly needed.

Accounts: deploys run under the stackfox Gmail's Vercel; PRs/pushes go to `Mokshagna2k6/ArtWall` (`myfork`). `im-alok74/ArtWall` (`origin`) needs a manual PR (API token has no write access). Do both whenever something ships.

## 1. Target stack (user's decisions)

1. Frontend: Vercel
2. Backend: Railway
3. Database: Supabase (Postgres)
4. Cache: Redis via Upstash
5. Storage: buckets per use
6. Images (and other media if needed): Cloudinary
7. Auth: Supabase Auth, Clerk, Auth.js (provider to be chosen — see §2)
8. Authorization: Postgres Row Level Security
9. CDN: Vercel CDN for now
10. Email/notifications: Resend
11. Errors: Sentry
12. Security: Cloudflare WAF, rate limiting, OWASP practices
13. Backup/recovery: retain data for a fixed number of days

## 2. Recommendations and concerns (Claude)

- **Auth — pick ONE provider.** Three together means three user stores. RLS using `auth.uid()` only works with Supabase Auth (or a JWT that Supabase trusts). Moving off better-auth requires migrating users and password hashes (or forcing resets) and Google OAuth re-registration. Today `user.role`, `onboardingPersona` and admin-role tables key off better-auth user ids.
- **RLS vs app-level authorization.** Current authorization lives in server code (`authorize.ts`). Drizzle over a pooled service connection bypasses RLS unless each request sets the claims. Decide: RLS as defence-in-depth on top of app checks, or as the primary layer (large rewrite). Recommend defence-in-depth first.
- **Railway backend — what actually moves?** Server actions and route handlers already run on Vercel. Likely candidates for Railway: cron jobs, webhook processing, PDF/mint workers, long-running jobs. Avoid splitting the app into a separate API unless there's a concrete reason.
- **Redis = Upstash** (one item, not two). Use for rate limiting, cart/session caching, idempotency keys.
- **Database connections.** Use Supabase's pooled (transaction) connection string for Vercel serverless; keep a direct URL for migrations. Enable PITR/daily backups; test a restore.
- **Cloudflare in front of Vercel** needs deliberate DNS/proxy/caching settings; avoid double-caching conflicts.
- **Migrations:** `scripts/migrate.mjs` ledger is keyed by filename; port the ledger table when moving to Supabase and verify on a disposable DB first (per CLAUDE.md).
- **Env drift risk:** keep one documented source of truth for which DB each environment uses.

## 2b. Decisions made (2026-10-10)

- **Auth: Supabase Auth only** (not Clerk/Auth.js). Needs a better-auth → Supabase Auth user migration plan (see §3).
- **RLS: defence-in-depth** (user deferred to Claude's judgment: "whichever is feasible"). App-level checks in `authorize.ts` stay primary; RLS added as a backstop on user-owned/sensitive tables.
- **Backend:** finish the deferred backend of everything built so far (see §4) and clean up the architecture, before/while moving to the new stack. Exact scope to be confirmed.
- **Repo: same repo, new Vercel project**, provided the existing Vercel project is not affected. Isolation rule: the existing project keeps deploying its current production branch only; the new project deploys a dedicated long-lived branch (proposed `production-v2`). Never merge `production-v2` into the branch the old project deploys. Old project must not auto-build `production-v2` (disable previews for it / ignored-build-step). The two projects must use different databases and env vars. A second repo only if this isolation proves unworkable.

## 3. Open decisions (needed before the final plan)

- Existing-user migration: Supabase Auth import of better-auth users (password hashes compatibility? else force reset) — cutover plan?
- What specifically runs on Railway?
- Which branch does the existing Vercel project deploy (and from which repo: myfork or im-alok74)? Needed to pick the isolation branch safely.
- Backup retention (days) and restore-test cadence?
- Data migration plan Neon → Supabase (downtime window, cutover steps)?
- Storage buckets: which uses (certificate PDFs, uploads, exports)?
- Checkout: the 17 product decisions in `docs/plans/BUYER_CHECKOUT_PLAN.md` §open questions, plus legal/finance sign-off (RBI payment-aggregator/escrow, GST/TCS/TDS) before enabling the flag.

## 4. Known follow-ups carried from Phase A

- Public certificate PDF route has no app-level rate limiter (CDN cache only).
- Checkout: Shiprocket, disputes, invoices, GST/TCS/TDS, digital goods, clawback after release all deferred; commission rates in `commission_policy_versions` are placeholders.
- No "change artwork after booking" UI for slots.
- Run migrations 0064, 0066, 0067 against a Neon branch before production.
- `docs/WORK_PLAN.md` still claims AWS SES and Privy; code uses Resend and wagmi/RainbowKit.
