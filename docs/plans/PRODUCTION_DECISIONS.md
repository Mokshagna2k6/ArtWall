# Production decisions log

Companion to `PRODUCTION_SCALE_PLAN.md`. Decisions here were made by Claude on the user's standing instruction ("do whichever suits best; ask only critical questions") unless marked USER.

## 2026-10-10

| # | Decision | Rationale |
|---|---|---|
| 1 | **Railway (`apps/api`) runs:** cron jobs (refunds/escrow sweep, notification delivery, data retention, demand aggregate, merkle root, uptime check, mint reconcile), payment/webhook processing (Razorpay, later Shiprocket), certificate PDF generation/archive, IPFS/mint workers. **Vercel (`apps/web`) keeps:** pages, server actions, auth, read APIs. | These are long-running, retryable or secret-heavy jobs that don't suit serverless time limits; UI stays on Vercel. Webhook URLs change at cutover — register new URLs in Razorpay before switching. |
| 2 | **Auth migration:** Supabase Auth only. Existing email/password users get a **one-time password reset** (welcome email via Resend) rather than hash import, unless a hash-format check proves import works. Google OAuth users re-link by verified email. | better-auth hashes passwords with scrypt in its own format, which Supabase Auth does not import natively (it imports bcrypt/argon2/pbkdf2-style). Verify against `src/lib/auth*` before cutover; user ids must be preserved/mapped because `user.role`, `onboardingPersona` and admin-role tables key off them. |
| 3 | **Checkout flag stays OFF** until legal/finance sign-off (RBI payment-aggregator/escrow, GST/TCS/TDS, return terms, retention vs DPDP) and real commission figures are set in `commission_policy_versions`. Plan defaults from `BUYER_CHECKOUT_PLAN.md` stand until changed. | External sign-off is not something code can resolve. |
| 4 | **Deploy mechanics (current project):** production is deployed with `vercel --prod` from a local checkout (project `artwall-production`, team stackfox1); migrations are run manually with `node --env-file=.env scripts/migrate.mjs` before deploy. Git repo connected to Vercel: `stackfoxtech-maker/ArtWall`. | Observed from history + user's run on 2026-10-10. |
| 5 | **Isolation:** `production-v2` exists on `Mokshagna2k6/ArtWall` only; do NOT push it to `stackfoxtech-maker/ArtWall` until the new Vercel project is ready, so the existing project never builds it. | Old project is wired to the stackfox repo. |

## Process notes
- Pushing to `stackfoxtech-maker/ArtWall` works with the keyring `gho_` login: `env -u GITHUB_TOKEN git -c credential.helper= -c "credential.helper=!gh auth git-credential" push stackfox ...` (the `GITHUB_TOKEN` env PAT cannot write there).
- Harness blocks pulling Vercel prod env values and running production migrations from Claude; the user runs those two commands.
