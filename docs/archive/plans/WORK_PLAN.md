# ArtWall — Work Plan (draft for discussion)

_Date: 2026-09-10 · Status: awaiting sign-off_

## Context

The fork `im-alok74/ArtWall` is **not** the "pre-launch waitlist site" its README
still describes. Prior work has built two things:

1. **Physical Wall / WMS** (`/physical-wall/*`) — a real venue wall-rental system:
   slot grid, multi-slot booking with row-level locking, Razorpay payments +
   webhook, hash-sealed digital agreements, QR staff check-in, DPDP consent,
   append-only ledger + audit log, 98 passing tests. The repo's own audit docs
   (`FINAL_PRODUCTION_READINESS.md`, `PRODUCTION_GAP_ANALYSIS.md`) rate it
   **NOT production ready** with a named blocker list.
2. **Studio** (`/studio/*`) — ~25 Verisart-shaped pages (editions, certificates,
   provenance, series, invoices, documents, contacts) mostly **UI scaffolds**;
   the data model behind them is thin (`artworks`, `contacts`, `collections`,
   `documents`, `sales`, `tasks`, `rooms`) — no certificate, edition, or
   provenance-event tables, no blockchain anywhere.

The **Product Bible** (165 pp) is the north-star spec. It is explicitly 4-phase /
multi-year. We follow it closely but build the thinnest working slice of each
system, in Bible phase order.

Goal of the near-term cycles, in sequence:
**(A) get the WMS to "real artists paying real money"**, then
**(B) build the COA / provenance vertical incl. on-chain provenance.**

## Decisions (locked 2026-09-10)

| # | Question | Decision |
|---|----------|----------|
| 1 | Artist wallet model | **Privy.io MPC wallets** — silent per-artist wallet, as the Bible specifies. |
| 2 | Primary chain for MVP | **Base**, **Sepolia testnet only** for all of Phase 2. Mainnet cutover is a separate later step with a funded deployer key. |
| 3 | Email / notify provider | **AWS SES** (domain + DKIM + sandbox-exit setup required). `pw_notifications` outbox already exists. |
| 4 | Blockchain sequencing | **After** Phase 1 WMS blockers. |

**Sequencing note:** the critical path to revenue runs through Phase 1. The WMS is
~85% done and takes real money today; blockchain is net-new. Phase 1 → Phase 2.

---

## Phase 0 — Setup & safety  ✅ done 2026-09-10

- [x] `.env` from provided values (`.env*` git-ignored — verified; secret values
      **not** in git history — verified with `git grep` over all commits).
- [x] `pnpm install` (ok), `pnpm db:migrate` (see migration fix below),
      `pnpm start` smoke test — `/`, `/physical-wall`, `/sign-in`, `/certificate`
      → 200; `/studio` → 307 to sign-in (auth gate, expected).
- [x] Baseline green: `typecheck` ✓ · `test` ✓ 98/98 · `lint` ✓ 0 errors
      (19 pre-existing warnings) · `build` ✓ exit 0, 43 routes.
- [x] Branch `work/phase-1-wms` off `main`.
- [ ] **Rotate — USER ACTION** (values are in this chat's history):
      Neon `PGPASSWORD` · `BETTER_AUTH_SECRET` · `GOOGLE_CLIENT_SECRET` ·
      `CLOUDINARY_URL` API secret. Then update `.env` + Vercel env.
- [x] Repo hygiene: deleted `_to_delete/`, stray `App.js` (Cloudinary sample,
      unreferenced). Moved `figma_hint.zip` → `docs/reference/`,
      `context_for_claude_for_physical_wall/` → `docs/wms-spec/`. Restored
      `docs/ArtWall_Creative_Blueprint.md` + `..._Experience_Design_System.md`
      from `9bcdb04^` (deleted in HEAD, still referenced by README).
      Updated `eslint.config.mjs` ignores to the new `docs/wms-spec/` path.

### Migration drift found & fixed (Phase 0)

The DB had `0001`–`0008_consent` recorded, but `pw_ugc_submissions` +
the other `0009` tables were **hand-applied** to the shared Neon DB without a
ledger entry, and there were **two `0008_` files** with the same number:

- `0008_physical_wall_ugc.sql` — stale, never applied anywhere; its
  `pw_ugc_submissions` shape (`visit_id`, `consent`, `adult_confirmed`) matches
  neither the live DB nor `src/lib/db/schema.ts`. **Deleted.**
- `0009_production_readiness.sql` — matches live DB + Drizzle schema. Fully
  idempotent (`if not exists` throughout). Now applied + recorded.
- `pw_community_gallery` was referenced by code + Drizzle schema but created by
  no live migration → added **`0010_community_gallery.sql`** in the Drizzle
  shape. Applied.

`pnpm db:migrate` is now clean and reproducible from a fresh DB.

> **Known, not fixed (Phase 1):** `scripts/migrate.mjs` runs each file's
> statements with no transaction, so a mid-file failure leaves partial state
> and no ledger row — that is how the drift above happened. Wrap each file in
> BEGIN/COMMIT. Also `src/features/physical-wall/actions/ugc.ts:166` reads
> `row.visit_id` on a table whose column is `visitor_id` → byline always
> "Guest" (part of F25/F30 finish work).

## Phase 1 — WMS launch blockers (Bible §12–14, §24, §25; repo audit docs)

From `PRODUCTION_GAP_ANALYSIS.md` — 3 missing + 9 partial features + infra:

**Missing (build):**
- [ ] **F25** Selfie UGC pipeline — upload (signed), consent capture, moderation
      queue, publish. Schema (`pw_ugc_submissions`) + upload-signature route exist.
- [ ] **F28** Full-text search over artists + artworks — Postgres `tsvector` +
      GIN index; `pw_search_log` exists; `/api/physical-wall/search` route stub exists.
- [ ] **F30** Community gallery + moderation UI — `pw_community_gallery` exists.

**Partial (finish):**
- [ ] Razorpay: wire `RAZORPAY_WEBHOOK_SECRET`, verify webhook amount == booking total,
      handle partial-refund state.
- [ ] Artwork upload hardening: MIME allow-list, size cap, EXIF strip, thumbnail.
- [ ] Notifications: outbox worker + templates (booking offer, install reminder,
      feedback invite, grievance ack). Provider per decision #4.
- [ ] GST invoice generation from `pw_invoices` — HSN/SAC, place-of-supply, CGST/SGST,
      PDF, sequential numbering.
- [ ] Identity verification review flow (`pw_identity_verifications`) — gates first payout.
- [ ] Install scheduling: venue-hours + conflict check + reminders + no-show.
- [ ] Pre-install checklist: condition photos (`pw_condition_photos`) + damage records.
- [ ] Revenue dashboard: by timeframe / slot-type / category; settlement tracking.
- [ ] Persistent rate limiting — replace in-memory (ineffective on Vercel) with
      Postgres-backed or Upstash.

**Ops surfaces (tables exist, need UI):**
- [ ] Audit-log viewer, grievance inbox + response, visitor data-withdrawal UI,
      data-retention cron (`pw_retention_runs`).

**Infra:**
- [ ] GitHub Actions CI: typecheck + lint + test + build on PR.
- [ ] Vercel: staging environment + env vars (no secrets in repo).
- [ ] Structured logging + error tracking (Sentry or equivalent).

**Exit:** manual smoke test registration → booking → payment → check-in → feedback,
all green in staging; audit docs' blocker list cleared.

## Phase 2 — COA / Provenance + on-chain (Bible §6–13, §10, §18, §19)

**Data model (new migrations):**
- [ ] `editions` (edition type/number, AP/proofs)
- [ ] `coa_certificates` (deterministic metadata hash, version, PDF ref, status)
- [ ] `provenance_events` — append-only (created, certified, bound, exhibited,
      sold, transferred)
- [ ] `mint_commitments` (off-chain lazy-mint record: leaf, wallet, ERC-2981 config)
- [ ] `merkle_roots` (daily root, tx hash, range)

**Off-chain (Next.js):**
- [ ] Metadata hashing (title/artist/medium/dims/images/timestamp → canonical hash).
- [ ] COA PDF generation (holographic-style per §9) + `/verify/:hash` + `/provenance/:id`
      public pages (SSR, JSON-LD).
- [ ] Wire `studio/certificates`, `studio/provenance`, `studio/editions` to real data.
- [ ] Daily Merkle-root job (aggregate commitments → 1 tx/day).
- [ ] Mint-trigger hooks: first sale, NFC bind, exhibition placement, artist request.

**On-chain (`contracts/`, Foundry, Base Sepolia):**
- [ ] `ArtworkRegistry` — ERC-721 + ERC-2981 (4% artist royalty), lazy-mint from
      Merkle proof.
- [ ] `MerkleVerifier` (or library) for inclusion proofs.
- [ ] `RevenueDistributor` — **deferred to Phase 3** (needs secondary market).
- [ ] **Blockchain Gateway** = isolated signer service holding the platform key
      (council decision: sole separate service, security boundary). Never in the
      Next.js request runtime. Start as a small standalone worker/route with the
      key in an isolated env.
- [ ] Deploy scripts, testnet deploy, contract tests, then documented mainnet cutover.

**Exit:** artist lists work → provenance commitment created → daily root posted on
Sepolia → COA PDF + public verify page → simulated sale triggers a real testnet mint.

## Phase 3+ — remainder of Bible Phase 1 (later cycles)

Marketplace discovery + 12-section detail page · dual-channel escrow checkout ·
72-hr inspection state machine · secondary market + `RevenueDistributor` ·
curator accounts + commission · exhibition engine + demand signals ·
virtual 3D exhibitions (Three.js) · Shiprocket + insurance · full 8-role admin panel ·
SEO infra. Scoped when Phase 2 lands.

## Conventions (from `AGENTS.md` / README — do not drift)

- Next.js 16 App Router, **Server Components by default**; `"use client"` only where
  an interaction needs it. Read `node_modules/next/dist/docs/` before writing Next code
  (this is a pre-release Next with breaking changes).
- Drizzle ORM; **plain-SQL migrations** in `db/migrations/`, numbered, additive.
- Money in **paise as integers**, column names say so. Pricing never touches a float
  (basis points).
- `components/` = zero feature knowledge · `features/<name>/` = one flow ·
  `shared/` = reused across ≥2 features. kebab-case filenames.
- Append-only for anything evidential (ledger, audit, consent, agreements, provenance).
- Every non-trivial module leaves one runnable check (vitest).
