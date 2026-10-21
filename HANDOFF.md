# ArtWall — Handoff

> ## 2026-10-21: Supabase migration — DEPLOYED TO PRODUCTION
>
> Live at https://artwall-production.vercel.app
>
> - **Database + Auth:** Supabase (`nibhjciuatdfljwicykm`, ap-southeast-1).
>   74 migrations applied. better-auth is gone (migration `0074`).
> - **Showcase catalogue:** 100 artists, 448 artworks, live on production.
>   Super Admin can remove it at `/physical-wall/admin/showcase`.
> - **Crons: still on Vercel.** Railway had paused new deploys platform-side,
>   so the `crons` array stays in `vercel.json`. `apps/api` is written, tested
>   and committed but NOT deployed — see below.
>
> **Verified on production:** `/`, `/discover`, `/artists`, `/sign-in` all 200 ·
> 48 artworks + 99 images render on `/discover` · 36 artists on `/artists` ·
> sign-in works · admin showcase page redirects an anonymous visitor to
> sign-in rather than exposing the delete control · cron endpoints return 401
> without the secret.
>
> **Verified locally:** typecheck 0 · lint 0 errors · **700 tests** · build OK.
>
> ### The one outstanding deploy
>
> **Railway (`apps/api`).** The account is now correct — the CLI is
> authenticated as `stackfox.tech@gmail.com` and resolves
> "stackfoxtech-maker's Projects". The only blocker left is Railway itself:
> every write returns **"Deploys have been paused temporarily"**, and
> `railway.instatus.com` reports the platform as `HASISSUES`. Reads work
> (`railway list` shows the existing projects), so this is platform-side, not
> an account or permission problem.
>
> When Railway lifts the pause, one command does the whole deploy:
>
> ```bash
> bash apps/api/deploy-railway.sh
> ```
>
> It creates the project in the stackfox workspace, adds the service, sets
> `WEB_APP_URL` / `CRON_SECRET` / `CRON_TZ` from `apps/web/.env`, and deploys.
> Then:
>
> 1. `railway status`, and open `/status` on the generated domain — it must
>    list seven jobs with sensible `nextRun` times.
> 2. Trigger one job to prove auth end to end:
>    `curl -X POST -H "Authorization: Bearer $CRON_SECRET" <url>/trigger/demand-aggregate`
> 3. **Only then** remove the `crons` array from `apps/web/vercel.json` and
>    redeploy Vercel. In the other order, nothing is scheduled at all.
>
> ### Admin logins
>
> `ADMIN-CREDENTIALS.md` (gitignored) holds the working Super Admin password,
> verified against Supabase. **`SEED-CREDENTIALS.md`'s admin passwords are
> stale** — written by a `seed-demo.mjs` run that predates the Supabase fix, so
> they are better-auth values that no longer authenticate. `ADMIN-CREDENTIALS.md`
> supersedes them; `SHOWCASE-CREDENTIALS.md` is artists only, by design.
>
> ### Google OAuth — NOT working yet
>
> The Google Cloud side is correct. The **Supabase side is not configured**, so
> the button fails today:
>
> ```
> $ curl .../auth/v1/authorize?provider=google
> {"code":400,"msg":"Unsupported provider: provider is not enabled"}
> ```
>
> To fix, in **Supabase → Authentication → Providers → Google**: enable it and
> paste the Client ID and Client Secret from Google Cloud. Those values already
> exist in Vercel (`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`) but Vercel no
> longer owns the OAuth flow — Supabase does.
>
> The only redirect URI Google needs is Supabase's, the same for local and
> production:
>
> ```
> https://nibhjciuatdfljwicykm.supabase.co/auth/v1/callback
> ```
>
> The older `https://artwall-production.vercel.app/api/auth/callback/google`
> entry is a better-auth leftover. Harmless, but nothing sends traffic there.
>
> Also add to **Supabase → Authentication → URL Configuration → Redirect URLs**:
> `http://localhost:3000/**` and `https://artwall-production.vercel.app/**`.
>
> ### Performance — measured 2026-10-21
>
> Production page times (second, warm request):
>
> | Page | Warm |
> | --- | --- |
> | `/discover` | ~0.6s |
> | `/artists` | ~0.8s |
> | `/studio/artworks` | ~1.4s |
> | `/studio/certificates` | ~1.5s |
>
> **The dominant cost is geography.** `X-Vercel-Id` reports `bom1::iad1`:
> requests enter in Mumbai but the function executes in Washington DC, while
> Supabase is in **ap-southeast-1 (Singapore)**. Every query crosses the
> Pacific twice — measured ~85ms per query and ~1.1s per new connection.
>
> Fixed: pool `idleTimeoutMillis` 10s → 60s. Connections were being dropped
> after 10s and re-established at 1.1s each, so any page load after a short
> pause paid it. Verified on production: 1.5s after a 20s idle, versus a
> ~600ms penalty before.
>
> **Still to do — needs the dashboard, not code.** `"regions": ["sin1"]` is in
> `vercel.json` but **Vercel ignores it on Hobby** (confirmed: `iad1` after
> deploying it). Set **Project Settings → Functions → Function Region →
> Singapore (sin1)**. Requires Pro. That should take studio pages from ~1.4s
> to roughly 300-400ms, since the Pacific round trip disappears.
>
> Note that `pnpm dev` is far slower than production (9.7s vs 1.4s for
> `/studio/certificates`) because it recompiles per request. Judge speed on
> production, not locally.
>
> The "Something went wrong loading this page" screen could not be reproduced
> in 12 consecutive production requests across 6 pages, all 200. Most likely a
> timeout under the latency above; worth re-checking after the region move.
>
> ### Still open
>
> 1. **No FK from `public."user"` to `auth.users`** — deleting an auth user
>    orphans the profile row. App-level erasure handles it. `shortcut:` in `0074`.
> 2. **Seed guard protects nothing** — it blocks only the dead Neon host, so
>    `seed-demo.mjs --purge` would wipe Supabase. Add the production ref once
>    prod and dev are separate projects.
> 3. **Email confirmation is on with no SMTP configured**, so a public sign-up
>    cannot sign in until confirmed. Configure SMTP in Supabase.
> 4. **`pnpm db:check` reports 6 schema drifts** — pre-existing, identical on Neon.
> 5. Demo content carries placeholder commercial values (refund policy 50%,
>    discount tiers) that need real numbers before launch.


## 1. Project overview

ArtWall is "India's art operating system" — an artist registry, exhibition engine, provenance/certification layer, and a physical-wall rental marketplace, built toward a 165-page internal "Product Bible" spec (not in this repo as a readable file; `docs/WORK_PLAN.md` and code comments encode what's been read from it so far — nobody currently in this project has re-verified the full PDF against the code).

Three user personas are meant to exist: **artist** (makes and shows work), **curator** (curates collections of others' work, commission-enabled), **buyer** (browses/collects — confirmed as of this session to have **no working purchase flow at all**, see §4). A fourth concept, internal **admin/team member**, runs a separate 8-role admin system (Super Admin, Operations, Finance, Content, Support, Analytics, Wall Network, Blockchain Admin) per Bible Section 24.

## 2. Technical architecture

- **Stack**: Next.js 16 (App Router, Turbopack), React 19, TypeScript, Tailwind v4, Drizzle ORM over Postgres (Neon), better-auth, Zod, Vitest, Playwright (installed, lightly used).
- **Hosting**: Vercel (production: `artwall-production.vercel.app`). **Database: Neon**, region `ap-southeast-1`, host `ep-royal-wildflower-azaegx8g-pooler...`. ⚠️ A local dev `.env` was found pointed at a *different*, stale Neon instance (`ep-little-tree-...us-east-1`) partway through this session — confirm whoever picks this up is using the same `DATABASE_URL` Vercel production uses, not an old dev branch, before running any migration locally.
- **Email**: Resend (`RESEND_API_KEY`). `docs/WORK_PLAN.md` says AWS SES — that decision was superseded by what was actually built; the doc was never updated. Trust the code (`src/features/physical-wall/notifications.ts`) over the doc on this point.
- **Images**: Cloudinary, signed direct-to-cloud uploads.
- **Blockchain**: Base Sepolia testnet only; wagmi/RainbowKit wallet-connect is what's actually wired (the Bible/WORK_PLAN's "Privy.io MPC wallets" decision was never implemented — this is a second doc/code drift point, flagged but not resolved).
- **Folder structure**: `src/app/` (routes), `src/features/<domain>/actions.ts` (server actions, most follow a `parseInput`/`attempt`/`readSafely`/`Result<T>` contract — see `src/features/physical-wall/actions/shared.ts`), `src/lib/db/schema.ts` (Drizzle schema), `db/migrations/*.sql` (raw SQL, applied via `node scripts/migrate.mjs` — see §9 on the numbering collisions in this directory).
- **Auth**: better-auth, email/password + Google OAuth. `user.role` is a **flat 4-value internal access tier** (`visitor | artist | staff | admin`) — NOT a marketplace persona. Persona (artist/curator/buyer) is tracked separately via `user.onboardingPersona` (nullable, set once at `/welcome`) and the `artistProfiles`/`curators` tables. Do not conflate these two concepts; a past session did and it cost real debugging time.
- **Admin roles**: a second, additive authorization axis — `admin_role_assignments` joined to `admin_roles` (10 rows: 8 Bible-named roles + `curator_admin` + `compliance_admin`, which aren't Bible roles but are kept because folding them into a Bible role would mis-grant/mis-revoke real permissions — see migration `0062`'s header comment for the full reasoning). `super_admin` bypasses every role check. See `src/features/physical-wall/authorize.ts`.

## 3. Decisions made (and why)

- **Resend over AWS SES** for email, despite `docs/WORK_PLAN.md` saying SES. Confirmed mid-session: the actual working `pw_notifications` outbox code was always on Resend; an attempt to migrate it to SES to match the doc was built, verified, then explicitly reverted by the user ("AWS is taking a lot of time") back to Resend. **The doc was never corrected** — if anyone reads WORK_PLAN.md's decision #3 as current, they will be wrong.
- **Collections rebuilt from scratch** as a real many-to-many (Collection ↔ Artwork via a join table) BUYER/ARTIST/CURATOR model, replacing an old single "name + description" bucket. Decision driven by an explicit, detailed product spec the user pasted mid-session (not from the Bible directly — a separate written spec). Buyer collections: any artwork, private by default. Artist collections: own artworks only, one may be featured. Curator collections: any artwork, public by design, commission-enabled (extension point only — no commission calculation exists, see §4).
- **8-role admin nav shell always shows all 8 roles**, locked/grayed for roles the viewer doesn't hold, real server-side enforcement (not just hidden in the UI) — explicit product decision: "in the beginning 1 person will do multiple roles," so the UI must not change shape as grants change.
- **Session-wide admin takeover**: signing in as any admin/team-member account redirects to `/physical-wall/admin` on every page (including "/") via a `pw_view_site` opt-out cookie, not just a one-time post-login redirect. Explicit product decision after the first attempt (route-scoped hiding of the public header only under `/physical-wall/admin`) was rejected as insufficient.
- **No URL rename to `/admin/` or `/team_member/`** — considered and explicitly rejected by the user once told `/admin` is already taken by an unrelated, pre-existing password-gated "virtual wall tiles" tool, and that a full route-group restructure would be large/risky. Current URLs (`/physical-wall/admin/*`) are intentionally kept stable.
- **Granting a team-member admin role now also sets `user.role = 'admin'`** (migration-free, a code change in `grantAdminRole`) — found during this session's review that the pre-existing `/physical-wall/admin` gate required the base `admin` role, which granting a granular role never set, so a team member couldn't reach the area they were just given access to. Confirmed fix via a user decision, not assumed.
- **curator_admin / compliance_admin kept as non-Bible, 9th/10th admin roles** rather than folded into a Bible role, to avoid silently mis-granting or revoking real permissions from existing holders.

## 4. Implementation status

### Done and deployed (verified live on production, not just locally)
- Google OAuth sign-in (new client, redirect URI registered by the user)
- Cloudinary signed-upload fix (three separate occurrences of the same root-cause bug — artist/curator profile photos, The Wall's public upload form)
- Studio: back-to-home link, real account dropdown (Settings + Sign out), sign-out redirect fix
- Dimensions field validation; contacts email field; collections description field (pre-rebuild quick fixes, since superseded by the full Collections rebuild)
- Tag creation (was failing on missing `QR_SIGNING_ED25519_SEED`/`NTAG424_MASTER_KEY_KMS_REF` — generated and set)
- Revenue page's day/week/month filter buttons (root cause: a missing `--color-paper` CSS variable made button text invisible, not a chart bug)
- Waitlist ("join the wall") form's artist/collector toggle (was cosmetic, now actually hides the artwork-upload section for a collector)
- **Collections**: full many-to-many BUYER/ARTIST/CURATOR rebuild, migration `0057`
- **Curator flow**: `/curator/apply` (self-serve), admin approve/reject, `rejected` status added (migration `0059`)
- **Onboarding persona**: `/welcome` screen asking new users "artist / curator / buyer," gates Studio's auto-artist-profile creation (migration `0060`)
- **Survey**: persona-branched questions, "Other, describe" escape hatch on every pain-point list (migration `0061`)
- **Delete my account**: UI entry points added in Studio settings + header dropdown, reusing the pre-existing, already-tested DPDP erasure logic (`eraseUserIn`) — admins/staff excluded by design
- **8-role admin system**: nav shell, migration `0062` (role rename: `readonly_admin`→`analytics_admin`, added `operations_admin`+`blockchain_admin`), per-role landing pages (real data where it exists — Wall Network's WallOS hierarchy, Blockchain's read-only Merkle-root status — honest "not built yet" placeholder where the Bible describes something with no code, e.g. fraud queue, GMV dashboard, escrow tracking)
- **Session-wide admin shell takeover**: redirect-on-every-page, "View site"/"Dashboard" toggle, header notification bell (reads existing `pw_audit_log`, no new logging mechanism)
- A migration ordering bug in `0056` (tag `binding_status` widen) that had silently never applied to production for an unknown period before this session — found and fixed

### Confirmed gaps, explicitly NOT built (flagged to the user, not silently skipped)
- **No real buyer checkout/purchase flow exists anywhere in the codebase.** Every "payment"/"finance"/"revenue" surface (including the new Finance Admin page) measures **wall-rental booking revenue** (an artist paying to rent a physical wall slot), not a marketplace artwork sale. Confirmed by reading the actual payment code — every payment action requires `role === "artist"`. This is the single biggest product gap found this session; a large fraction of the Bible's admin spec (GMV, escrow-in-flight, dispute resolution, fraud scoring, Blockchain Admin's mint/NFC pipeline status) has no real transaction data to attach to until this exists.
- Blockchain Admin's fraud/escrow/NFC-pin/IPFS-pin pages — explicitly out of scope this round, placeholders only
- Multi-artwork-per-slot booking (data model only supports one artwork per entire booking, not per slot) — confirmed gap, deferred by user decision
- Certificate image/PDF generation — confirmed gap (the Bible/WORK_PLAN calls for a "holographic-style COA PDF"; `coa_certificates.pdf_url` column exists and is never written to) — deferred by user decision
- A PR from `Mokshagna2k6/ArtWall:phase-3-complete` into `im-alok74/ArtWall` was prepared but **could not be opened via the GitHub API** (403, the available token has no write access to that repo). A compare link was handed to the user to open manually via the GitHub web UI: `https://github.com/im-alok74/ArtWall/compare/main...Mokshagna2k6:ArtWall:phase-3-complete`. **Unknown whether the user has since opened it** — check GitHub before assuming this is outstanding or done.

## 5. Current working state

- Branch: `phase-3-complete`, clean working tree (only untracked `.mcp.json`, pre-existing, not part of app code).
- Local HEAD and `myfork` (`Mokshagna2k6/ArtWall`) `phase-3-complete` both at `07cd38f` — confirmed in sync as of this session.
- Production (`artwall-production.vercel.app`) confirmed live and responding; last known-good deploy corresponds to `07cd38f` (the session that built the session-wide admin shell takeover was the last one to deploy).
- No known uncommitted or in-flight code changes.
- **Numerous stale git worktrees** remain under `.claude/worktrees/` (dozens, from this and earlier sessions' parallel agent dispatches) — harmless but untidy; not cleaned up as part of this handoff per the instruction not to modify/discard existing work.
- **Migration numbering has had repeated collisions** today (two separate `0057_*.sql` files both exist and both apply fine since `scripts/migrate.mjs` keys its ledger by filename, not number) — not a functional bug, but the next person adding a migration should run `ls db/migrations | sort -V | tail -5` fresh immediately before picking a number, not trust a cached number from a prior conversation turn.

## 6. Testing

Commands actually run and their results, as of this session (2026-10-10):
- `pnpm typecheck` → clean, 0 errors.
- `pnpm vitest run` → 34 files, **585/585 passing**.
- `pnpm lint` → 0 errors, 28 pre-existing warnings (unused vars in test files, `<img>` vs `next/image` suggestions) — none new.
- `pnpm build` (real production build, not just typecheck) → confirmed passing repeatedly throughout the prior session. **This matters**: a Client Component importing a function from a Server Component page file passed `tsc --noEmit` cleanly but broke the actual Vercel build (`'server-only' cannot be imported from a Client Component module`) — `tsc` alone does not catch this class of bug. Always run a real `pnpm build` before trusting a change is deployable, not just typecheck.
- Migrations: all 63 files apply cleanly in order against a fresh Postgres (verified repeatedly via disposable Docker containers through this session, most recently before merging the 8-role admin work).
- **Not verified**: `pnpm test:e2e` (Playwright e2e suite) was not run this session. `pnpm test:db` (the DB-integration suite) was run piecemeal for specific files during development but not as a full suite in its final state — worth a full run before the next major change.
- **Live-tested, not just read**: the session-wide admin takeover (sign-in → redirect to `/physical-wall/admin`, "View site" → free browse, "Dashboard" → return) was verified against both a local dev server and real production via direct HTTP requests with a real authenticated session — not simulated.

## 7. Remaining work, in priority order

1. **Decide and scope real buyer checkout.** This is the actual blocker behind most of the Bible's admin-panel spec (§4 above). Nothing else in the admin system can become "real" (GMV, disputes, escrow, fraud) until a buyer can actually pay for and receive an artwork. This is a multi-day feature, not a quick addition — needs its own planning pass (cart/order model, payment split from the existing artist-booking Razorpay integration, fulfillment/shipping).
2. **Confirm the PR to `im-alok74/ArtWall` status** — check GitHub directly; if not opened, the compare link above still works.
3. **Correct `docs/WORK_PLAN.md`'s stale decisions** (AWS SES → Resend, Privy.io wallets → RainbowKit/wagmi) or retire the doc in favor of this handoff + `CLAUDE.md`, so a future session doesn't re-trust it and redo work that was already deliberately reverted.
4. **Certificate image/PDF generation** and **multi-artwork-per-slot booking** — both confirmed, scoped gaps the user has deferred; pick back up when prioritized.
5. **Clean up stale worktrees** under `.claude/worktrees/` — purely housekeeping, no functional risk either way.
6. Consider renumbering the colliding `0057_*.sql` migration pair for clarity (both apply correctly today; this is cosmetic, not urgent).

## 8. Important details / constraints

- **Never echo credentials** (API keys, passwords, connection strings) in any tool output or message — this was a hard rule throughout the prior session and should continue.
- **Root-cause fixes only.** Every bug fixed this session was traced to an actual cause (a missing CSS variable, a migration statement-ordering bug, a missing form field wiring) before writing a fix — never patch symptoms.
- **Seeded test accounts exist** (`scripts/seed-accounts.mjs`, idempotent): `stackfox.tech@gmail.com` (real super admin, password set by the user directly — not recorded here), `staff@artwall.test`, `artist@artwall.test`, shared test password set via that script's `SEED_PASSWORD` env var at seed time.
- **Real user data exists in production** (at minimum the seeded accounts above, plus the user's own manual testing). Treat the production database as live, not disposable — this session consistently verified migrations against throwaway local Docker Postgres containers before ever touching production, and that practice should continue.
- **The user is non-technical but sharp and hands-on** — tests the live site directly, reports exact symptoms with screenshots, and pushes back precisely when a fix doesn't match what they actually asked for (e.g. correctly distinguishing "hide the public nav under /admin" from "take over the whole session"). Explain root causes in plain terms; don't assume they want implementation detail unless they ask.
- **`.mcp.json` is untracked and expected to stay that way** — not part of the app, don't add it to git without asking.

## 9. Risks and assumptions

- **Assumption, not verified**: that `myfork/phase-3-complete` on GitHub is what the user considers their current "real" branch. No one has confirmed whether `im-alok74/ArtWall` (the upstream fork) is meant to receive this work via the pending PR, stay independent, or something else — the user asked to raise the PR but its outcome is unconfirmed.
- **Assumption**: the 165-page Product Bible's exact text was never read directly in this or the prior session — all "per the Bible" reasoning is from what the user pasted/described, or what `docs/WORK_PLAN.md` and code comments already encoded. Treat any "per the Bible" claim in code comments as secondhand, not independently verified against the source PDF.
- **Unverified**: whether the local dev `.env` (now pointed at the correct `ep-royal-wildflower` Neon instance per §2) could drift again — no mechanism was added to prevent someone from re-pointing it at a stale branch by mistake. Worth a `README`/`CLAUDE.md` note on which Neon branch is canonical if this recurs.
- **Known limitation, not a bug**: the notification bell's "recent activity" count is a rolling 24-hour window, not a true per-admin "unread since last visit" count (no such column exists; adding one was judged out of scope for a badge count). If this feels wrong in use, that's the reason — not a defect.
