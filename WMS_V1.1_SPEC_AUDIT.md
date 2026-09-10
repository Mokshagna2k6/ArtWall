# WMS v1.1 (SPEC-002) Parity Audit — Frontend / Backend / Database

**Scope:** Compares the current `physical-wall` implementation in this repo against the reference spec `artwall-wms-v2 final.jsx` ("ARTWALL LABS · WALL MANAGEMENT SYSTEM v1.1", spec ID `AWL/ENG/2026/WMS-SPEC-002`, 32 features / 6 pillars) you supplied. That file is a UI-only prototype (React `useReducer`, in-memory data, no backend) — it's read here purely as a **behavioral spec**, not as code to port.

**Relationship to existing audits:** `PHYSICAL_WALL_AUDIT.md` and `PRODUCTION_AUDIT.md` (both dated 2026‑08‑22) already audited this codebase against an **earlier** spec (`WMS-SPEC-001`). Most of their findings still hold and aren't repeated in full here — see §6 for a deduped carry-forward list. This document's job is to surface what's **new**: (a) gaps specific to v1.1 that v1.0 didn't have, and (b) concrete bugs found while re-tracing the current code, several of which contradict or update the prior audits' status calls.

**Verdict:** the current implementation is substantially *more* rigorous than the reference prototype in the core booking/payment/QR/audit machinery (real DB transactions, row locks, HMAC verification, hash-sealed agreements — the prototype fakes all of this in a reducer). But two modules from the v1.1 spec don't exist in this codebase at all (Sponsors, Events/Workshops), and three concrete bugs currently break shipped-but-broken flows (UGC submission, public search, a duplicate migration). None of these three bugs are called out in the prior audits.

---

## 1. About the pasted screenshot

The mobile screenshot you pasted (a map of India with "Kota / Dehradun / Prayagraj / Pune" pins, claim counts, a progress bar, and a "Rallies" list, from a site that reads as `…oothkigoonj.com`) **does not match how "the live wall" works in either the reference spec or the current codebase.**

Both the v1.1 spec and the current app render "the wall" as a **CSS grid of numbered slots** (`WallGrid` in the prototype, `src/features/physical-wall/components/wall-grid.tsx` in this repo) — not a geographic map. There is no multi-city concept anywhere in the schema or the reference file; ArtWall is modeled as a single venue (Ric Platter, Jaipur).

I don't want to guess and build the wrong thing — could you clarify what that screenshot is for?
- **(a)** It's a *style reference only* — you want the wall/booking overview to borrow that visual language (pinned locations, progress bar, card list) even though ArtWall is single-venue, or
- **(b)** It's from a different project entirely and got attached here by mistake, or
- **(c)** ArtWall is meant to expand to multiple physical wall locations/cities and you want an actual geo-map view added — a real net-new feature not in either spec.

I've proceeded with the rest of this audit against the grid-based model both specs actually describe; nothing below assumes a map view.

---

## 2. New bugs found in this pass (not flagged by prior audits)

These were found by re-tracing the current code against the new spec's action list, not by the earlier audits (which pre-date this exact code state). All are concrete and fixable.

### 2.1 UGC/selfie submission always fails validation — CRITICAL
`src/features/physical-wall/actions/ugc.ts` (`submitUgc`) parses input against `ugcSubmitSchema` (`schema.ts:238`), which requires `cloudinaryId` as a non-empty string — but the action never receives or passes `cloudinaryId` from the form. **Every selfie/UGC submission currently fails zod validation.** The prior audits (Aug 22) reported F25 "Selfie UGC — entirely missing (P0)"; that's now stale — the feature is *built* (upload signature request, moderation queue, community gallery, consent capture all exist), it's just broken by this one parameter-passing bug. This is a smaller fix than "build F25 from scratch," but it's currently a P0 in terms of user-facing breakage.

### 2.2 Duplicate/conflicting `0008` migration — CRITICAL, deploy-breaking
Two migration files both claim the `0008` slot: `0008_consent_agreements_waitlist.sql` and `0008_physical_wall_ugc.sql`. `scripts/migrate.mjs` applies files by alphabetical `readdir().sort()`, so `0008_consent_agreements_waitlist.sql` < `0008_physical_wall_ugc.sql` < `0009_production_readiness.sql`. The **older, narrower** `pw_ugc_submissions` shape (from `0008_physical_wall_ugc.sql`) gets created first. `0009_production_readiness.sql` then runs `create table if not exists pw_ugc_submissions` with a **different, incompatible column set** — Postgres silently no-ops that (doesn't validate columns on `IF NOT EXISTS`) — and then `0009` goes on to `create index ... on pw_ugc_submissions (kind, status, ...) where status='approved' and withdrawn_at is null and removed_at is null`, referencing columns (`kind`, `withdrawn_at`, `removed_at`) that don't exist on the table as actually created. **This will throw and abort the `0009` migration partway through**, on a fresh database. Both `schema.ts`'s `pwUgcSubmissions` and `actions/ugc.ts` assume the `0009` (newer) shape — i.e. application code targets a table shape that the migration sequence likely never produces cleanly. This needs a migration squash/rename, not a code change.

### 2.3 Public search API endpoint drops its query parameter
`src/app/api/physical-wall/search/route.ts` reads `?q=` into a local variable but never forwards it into the `FormData` passed to `searchArtworks()` — it always calls the search action with an empty query, which always returns a "type at least 2 characters" failure. The underlying server action and DB (`tsvector`/`plainto_tsquery`, `pw_search_log`) are correctly implemented; only this HTTP route is broken. Prior audits marked F28 "Full-Text Search — entirely missing (P0)" — that's now stale too: it exists and mostly works, it's one route-level bug away from functioning.

### 2.4 `withdrawUgc` has no ownership/auth check
`actions/ugc.ts`'s `withdrawUgc` accepts a `submissionId` and withdraws it with no check that the caller submitted it (or is staff/admin). Anyone who can guess or observe a submission ID can withdraw someone else's UGC. Minor IDOR-style issue, low severity given UGC is non-sensitive, but easy to fix (require session ownership or a per-submission secret token akin to the visitor-consent-withdrawal pattern already used elsewhere in the codebase).

### 2.5 Admin nav is missing two fully-built pages
`src/app/physical-wall/admin/layout.tsx`'s nav rail (`ITEMS`) lists exactly 8 destinations (Overview, Wall map, Calendar, Bookings, Queue, Pricing, Ledger, Moderation). `admin/audit/page.tsx` (audit log viewer) and `admin/grievances/page.tsx` (DPDP grievance inbox) both exist, are fully implemented, and are simply never linked — reachable only via a hand-typed URL. This is a one-line nav fix, not a missing-feature gap, but functionally the audit log and grievance inbox are invisible to your admin today.

### 2.6 Drizzle schema is out of sync with two migration-0009 columns
`0009_production_readiness.sql` adds `user.identity_verified` and `artworks.search_tsv`, but neither column appears in `schema.ts`'s Drizzle table definitions. Any code path going through the Drizzle query builder can't see these columns, and `drizzle-kit check`/`generate` will likely report schema/migration drift.

### 2.7 Marketing copy vs. shipped feature mismatch
`src/config/content.ts`'s `physicalWall.capabilities` list still includes **"NFC tags"** as a capability, but migration `0006`'s own comments state NFC was *deliberately dropped* in favor of the HMAC-signed QR scheme ("The NFC line-item from the original spec is deliberately absent (C06)"). Cosmetic, but it's user-facing copy promising a capability that was intentionally never built.

---

## 3. Net-new gaps: features in v1.1 that v1.0 didn't have (so prior audits never checked for them)

The v1.1 reference file adds two entire modules and a few config knobs that don't appear anywhere in your current schema, actions, or admin nav. These are **not bugs** — they're features your current build simply doesn't attempt yet:

### 3.1 Sponsors module — entirely absent
No `sponsors` table, no CRUD actions, no admin "Sponsors" tab (current nav has none), no visitor-facing sponsor strip on the public wall page. Reference spec (`sponsors[]`, `SponsorsManager`, `SponsorsStrip`) models: tier (title/gold/silver/community), pledged vs. paid amount, payment mode, invoice number, last-payment date, active/hidden toggle, tier-sorted display on the visitor landing page. If sponsorship revenue is part of the real business model, this is a genuine gap, not a documentation nit.

### 3.2 Events / Workshops module — entirely absent
No `events`/`event_regs` tables, no admin "Events" tab, no visitor-facing events section, no registration flow. Reference spec (`events[]`, `eventRegs[]`, `EventsManager`, `EventsSection`) models: multi-day date arrays, capacity caps, duplicate-registration-per-contact rejection, free vs. paid seats with webhook-verified payment capture, per-kind revenue reporting, CSV export of registrations, soft-cancel/reactivate. If workshops/talks are planned as a revenue line, this whole module needs building from scratch — there's nothing partial to extend.

### 3.3 Batch-tier discounts have no editor UI
Group-discount tiers exist as data (`pw_settings.group_discount_tiers` jsonb) and the pricing engine applies them, but there is **no CRUD panel** — the admin can only view them read-only inside the catalog/settings page. The reference spec's `BATCH_TIER_SAVE`/`BATCH_TIER_REMOVE` actions (name / slot-threshold / discount% / active, full add/edit/remove) have no equivalent UI. To change a tier today someone would have to hand-edit JSON in the database.

### 3.4 No global "batch booking enabled" kill switch
The reference spec has an explicit `batchEnabled` boolean that hides the batch-wall tab from artists when off. No equivalent flag was found in `pw_settings` or anywhere in the current implementation.

### 3.5 No global "minimum slots per booking" setting
Reference spec's `minSlots` (admin-configurable floor on how many slots a single booking must reserve) has no counterpart found in current settings/validation.

### 3.6 Add-on catalog category taxonomy is narrower than spec
Current add-on catalog supports categories `general`/`coffee`; the v1.1 spec's catalog splits Ric Platter's menu across `general`/`coffee`/**`f&b`** (food items distinct from coffee/beverages — shakes, mojito, lime soda, platters). Minor, but worth a deliberate decision rather than an oversight if the Ric Platter menu integration is meant to mirror the reference's structure.

### 3.7 No automatic end-of-run (live → ended) transition
Hold-expiry has a lazy sweep (`expiry.ts`, runs inline on read/write, no cron). But there's no equivalent sweep found for exhibition **end dates** — the reference spec's `END_BOOKING` action (fired by a "System timer" actor per its audit-log comment) auto-transitions `live → ended` and raises a de-install task once a booking's `end` date passes. Nothing in the current codebase appears to do this automatically; a booking may stay `live` indefinitely past its paid end date unless a human intervenes.

---

## 4. Where the current build exceeds the reference spec

Worth stating plainly so nothing here reads as "the prototype is more correct" — it isn't; it's a UI mockup that fakes several things production has to actually implement:

- **Payments**: reference spec *describes* signature-verified, idempotent webhook payment capture in comments but implements none of it (the `PAY` reducer action just trusts whatever the UI dispatches). Current code has a real HMAC-verified webhook route, amount/currency validation, unique `event_id` idempotency, and a single choke-point `settleBooking` function shared by webhook and manual-fallback paths.
- **QR tokens**: reference spec's QR codes are explicitly "deterministic pseudo-QR visual tokens" with a code comment saying real QRs need signed server-side redirects. Current implementation actually does this — HMAC-signed tokens, revocation support, token↔slot cross-check at check-in.
- **Agreements**: reference spec fakes a `termsHash` via a simple string hash. Current implementation rebuilds agreement text server-side from booking facts (never trusts client text) and SHA-256 hashes it, with signer-name matching.
- **Concurrency**: reference spec's booking-clash check is a naive array scan with no real transaction semantics (it happens to be safe only because it's single-threaded JS). Current implementation does `SELECT ... FOR UPDATE` row-locking inside a real transaction, verified by a 50-way concurrent-request test (`concurrency.test.ts`) proving exactly one booking wins a contested slot.
- **DPDP rights**: reference spec has scattered consent-copy intentions but no actual export/erasure/nominee/grievance-clock implementation. Current implementation has all four as real server actions (`exportMyData`, `eraseMyData`, `setNominee`, `raiseGrievance` with a 30-day clock).
- **Waitlist force-match**: reference spec's comment says a match "offers a time-boxed hold" but implements no timer. Current implementation actually expires the offer after 48h and converts acceptance into a real 7-day-hold booking.

---

## 5. Quick-reference: v1.1 feature checklist vs. current status

Legend: ✅ implemented and appears functional · ⚠️ implemented but broken/incomplete/unreachable (see §2/§3) · ❌ not implemented

| Area | Feature | Status |
|---|---|---|
| Grid/slots | Resize/move/edit with locked-state protection | ✅ |
| Grid/slots | Atomic slot swap (drag/drop, optimistic lock) | ✅ |
| Grid/slots | Force-book / force-release with refund + de-install task | ✅ |
| Catalogs | Size catalog CRUD | ✅ |
| Catalogs | Add-on catalog CRUD | ✅ (narrower category taxonomy, §3.6) |
| Catalogs | Slot-type multiplier catalog | ✅ |
| Catalogs | Refund policy — versioned, snapshotted per booking | ✅ |
| Catalogs | Batch-tier discount **editor UI** | ❌ (§3.3 — data exists, no panel) |
| Catalogs | Global batch-booking on/off switch | ❌ (§3.4) |
| Catalogs | Global minimum-slots-per-booking | ❌ (§3.5) |
| Pricing | Type × duration × batch-tier × GST engine | ✅ (exceeds spec: configurable GST, surge pricing) |
| Booking | Atomic multi-slot hold, all-or-nothing | ✅ |
| Booking | End-of-run auto live→ended transition | ❌ (§3.7) |
| Payments | Webhook-verified, idempotent capture | ✅ (exceeds spec) |
| Payments | Manual/offline admin fallback | ✅ |
| Agreement | Hash-sealed, server-rebuilt e-signature | ✅ (exceeds spec) |
| Install | Window scheduling, auto-derived checklist | ✅ |
| Check-in | QR verify + checklist-complete gate | ✅ (exceeds spec) |
| Waitlist | Tiered priority + manual override + force-match | ✅ (exceeds spec) |
| Sponsors | Sponsor CRUD, payment tracking, visitor strip | ❌ (§3.1 — whole module) |
| Events | Events/workshops CRUD, registration, revenue | ❌ (§3.2 — whole module) |
| RP01 perk | Artist/visitor redemption, cost-bearer split | ✅ (exceeds spec) |
| UGC | Selfie submission | ⚠️ built, always fails validation (§2.1) |
| UGC | Moderation queue + community gallery | ⚠️ works, but sits on the broken migration (§2.2) |
| UGC | Withdrawal | ⚠️ works, but no ownership check (§2.4) |
| Search | Full-text search (server action + DB) | ⚠️ backend works, public API route broken (§2.3) |
| Audit | Append-only audit log | ✅ |
| Audit | Audit log viewer page | ⚠️ built, not linked in nav (§2.5) |
| Grievances | DPDP grievance inbox | ⚠️ built, not linked in nav (§2.5) |
| Identity verification | Artist KYC gating payouts | ❌ (DB tables exist, zero application code — matches prior audit) |
| Live carousel | Real-time slot updates | ❌ (matches prior audit — no realtime channel) |
| GST invoicing | Per-transaction GST invoice generation | ❌ (`pw_invoices` table unreferenced — matches prior audit) |

---

## 6. Carry-forward from prior audits (deduped, still open)

These were already found by `PHYSICAL_WALL_AUDIT.md`/`PRODUCTION_AUDIT.md`/`FINAL_PRODUCTION_READINESS.md` (2026‑08‑22) and remain open as far as this pass could tell. Not re-derived here — see those files for full detail/severity:

- **P0 launch blockers**: `RAZORPAY_WEBHOOK_SECRET` not set in production env; secret rotation + move to managed env vars; no staging environment.
- **P1**: no notification delivery cron (matches new finding in §2 that only a manual "send pending now" button exists); artwork upload has no MIME/magic-byte validation, EXIF stripping, or re-encoding; install-window scheduling has no venue-hours/conflict/no-show handling; identity verification workflow unbuilt; revenue dashboard has no daily/slot-type breakdown; ledger has no locked periods or GST invoice generation.
- **Security**: no CSRF tokens beyond framework defaults; no 2FA for staff/admin; in-memory rate limiting (won't work across serverless instances); no dependency/secret scanning in CI.
- **Infra/process**: no CI/CD, no staging, no monitoring/error tracking, no documented backup/DR test, no load testing.
- **Testing**: no integration tests against a real DB, no E2E, no accessibility or performance testing.

---

## 7. Suggested priority order

1. **Fix the two currently-broken-but-built flows** — UGC submission (§2.1) and public search route (§2.3) — these are small, isolated code fixes with outsized user-facing impact, and both were previously (incorrectly, as of this pass) marked "entirely missing."
2. **Resolve the duplicate `0008` migration** (§2.2) before this ever runs against a fresh database or a new environment — this is the one item here that can silently break a deploy.
3. **Link the audit log and grievance inbox into the admin nav** (§2.5) — near-zero effort, restores visibility into features you already built and likely believe are in use.
4. **Decide on Sponsors and Events/Workshops** (§3.1–3.2): are these in scope for this venue? If yes, they're net-new modules (schema + actions + admin UI + public UI) — worth scoping as their own piece of work rather than folding into a "fix a few bugs" pass. If no, no action needed, but it's worth confirming so the v1.1 reference file doesn't linger as an unaddressed expectation.
5. Small settings gaps (§3.3–3.5, batch-tier editor, batch on/off, min-slots) and the end-of-run sweep (§3.7) are moderate-effort, self-contained additions to the existing catalogs/settings surface.
6. Everything in §6 (carried forward) — unchanged priority from the existing audits; not re-ranked here.

---

*Compiled by tracing `artwall-wms-v2 final.jsx` in full against the current `src/features/physical-wall/**`, `src/app/physical-wall/**`, `src/app/api/physical-wall/**`, `src/lib/db/schema.ts`, and `db/migrations/*.sql`, plus the three pre-existing audit docs in this repo.*
