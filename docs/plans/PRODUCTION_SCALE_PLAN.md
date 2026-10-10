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

## 3. Open decisions (needed before the final plan)

- Which auth provider, and migrate-vs-reset for existing users?
- RLS: primary or defence-in-depth?
- What specifically runs on Railway?
- New GitHub repo needed, or same repo + new Vercel project?
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
