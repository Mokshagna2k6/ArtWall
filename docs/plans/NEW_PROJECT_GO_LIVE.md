# New production project — go-live runbook (Stage 1)

Branch: `production-v2` (never pushed to `stackfoxtech-maker/ArtWall` until step 4). The existing project `artwall-production` is untouched.

## Staging (decision logged 2026-10-10)

- **Stage 1 (this runbook):** new Vercel project + new Supabase Postgres, running the current app with its current auth (better-auth) so the site works end to end. Fresh schema (66 migrations), no production data copied.
- **Stage 2:** Supabase Auth migration + RLS backstop; Railway `apps/api` takes crons/webhooks/PDF-mint workers; Upstash enabled.
- **Stage 3:** data cutover from Neon, Cloudflare in front, Sentry, backups/PITR verified. AWS later.

Why staged: swapping auth and the host at the same moment makes failures impossible to attribute.

## What the user does (secrets go ONLY into Vercel/Supabase dashboards or the user's terminal — never into chat)

1. **Supabase:** create a new project (region near users; note the database password). From Project → Connect copy: the **pooled (transaction, port 6543)** connection string → `DATABASE_URL`; the **direct (5432)** string → `DATABASE_URL_UNPOOLED`.
2. **Vercel:** new project from repo `Mokshagna2k6/ArtWall` (or the stackfox mirror after step 4), branch `production-v2`. Settings: Root Directory `apps/web` with "Include source files outside of the Root Directory" ON; Framework Next.js; Node 22; Install `pnpm install --frozen-lockfile`; Production Branch `production-v2`; turn off auto-builds of other branches.
3. **Env vars** (Vercel → new project → Settings → Environment Variables):

| Var | Notes |
|---|---|
| `DATABASE_URL`, `DATABASE_URL_UNPOOLED` | Supabase strings above |
| `BETTER_AUTH_SECRET` | new random 32+ bytes (do not reuse the old project's) |
| `BETTER_AUTH_URL`, `NEXT_PUBLIC_APP_URL` | new project's URL |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | same client OK; add the new URL's redirect URI `<url>/api/auth/callback/google` in Google Cloud |
| `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`, `NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME` | same account fine |
| `RESEND_API_KEY`, `NOTIFY_FROM_EMAIL` | |
| `CRON_SECRET` | new random value (Vercel crons send it) |
| `QR_SIGNING_ED25519_SEED`, `NTAG424_MASTER_KEY_KMS_REF` | **new** values; do not copy production's |
| `RAZORPAY_KEY_ID`, `NEXT_PUBLIC_RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET` | use TEST-mode keys for Stage 1; webhook URL `<url>/api/physical-wall/razorpay/webhook` |
| `PHYSICAL_WALL_ENABLED` | `true` |
| `MARKETPLACE_CHECKOUT_ENABLED` | leave unset (off) |
| `ADMIN_EMAILS` | stackfox email |
| Blockchain (optional for Stage 1): `BASE_SEPOLIA_RPC_URL`, `PINATA_JWT`, `NEXT_PUBLIC_PINATA_GATEWAY`, `NEXT_PUBLIC_NFT_CONTRACT_ADDRESS`, `MINT_SIGNER_PRIVATE_KEY`, `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID` | skip to deploy without minting |
| `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` | Stage 2; Postgres limiter is used until set |

4. **Run the migrations once** (your terminal, repo root, on `production-v2`; `DATABASE_URL` = the Supabase **direct** string):
   `node packages/db/scripts/migrate.mjs` — expect "Applied 66 migration(s)", re-run says "Nothing to apply".
   (Claude cannot run this against a hosted DB: the harness blocks it.)
5. **Deploy:** push `production-v2` (Vercel git) or `vercel --prod` from the repo root after `vercel link` to the new project.
6. **Seed the first admin:** sign up with `ADMIN_EMAILS` address; run `apps/web/scripts/seed-accounts.mjs` only if test accounts are wanted.
7. **Smoke test:** `/` 200, sign-up/sign-in, Google sign-in, an artwork upload (Cloudinary), `/physical-wall/admin` as admin, `/cart` → 404 (flag off), certificate verify page.

## Known Stage-1 caveats

- Supabase pooled (6543) is transaction mode: no session state/prepared statements; the pg client should not rely on them (verify during smoke test; fall back to the direct URL for migrations only).
- Vercel Hobby limits crons; the 7 crons in `apps/web/vercel.json` need Pro.
- Cron/webhook URLs change vs the old project; register the new Razorpay webhook before any payment test.
- Pre-existing, unconfirmed: `migrations-check.mjs` pass 2 fails at `0003_studio.sql`; `db-check` reports 6 drift items; 4 `invariants.db.test.ts` tests fail as DB superuser.
