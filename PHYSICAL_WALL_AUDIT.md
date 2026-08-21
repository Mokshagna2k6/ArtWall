# Physical Wall — Codebase Audit & Build Plan

> **Purpose:** A one-stop audit of what the `physical-wall` feature has built, what the spec calls for but hasn't yet implemented, and a phased plan with copy-paste prompts to close every gap.
>
> **Spec sources:** `context_for_claude_for_physical_wall/` — three PDFs covering the consolidated spec (v1.1), Platter partnership revision, and production compliance.
>
> **Codebase roots analysed:** `src/features/physical-wall/`, `src/app/physical-wall/`, `db/migrations/0006_*.sql` and `0007_*.sql`, `CLAUDE.md`.

---

## 1. Executive Summary

The physical-wall feature is a **substantial, production-grade build** that implements the core exhibition lifecycle end-to-end: grid configuration → slot pricing → booking → payment → install → go-live → analytics → offboarding. It uses Next.js 15 server actions, PostgreSQL transactions, a 9-state slot state machine, RBAC with 4 roles, cryptographic agreement hashing, and comprehensive audit logging.

**Strengths:**
- Domain logic is in pure, DB-free modules (`pricing.ts`, `state-machine.ts`, `checklist.ts`, `agreement.ts`, `qr.ts`, `money.ts`) — trivially testable
- All multi-step mutations run in real `pg` Pool transactions with `FOR UPDATE` row locks
- Quotes are re-priced server-side inside the reservation transaction (no client-tampering)
- Consent model is DPDP-first: every purpose is granular, withdrawal is one click, erasure anonymises rather than hard-deletes
- Slot state machine forbids illegal transitions; the UI only shows buttons the server will accept
- QR tokens are signed, revocable, and resolved server-side before redirect (no guessable destinations)

**Critical gap:** **Zero tests exist** despite the architecture being explicitly designed for them, plus several user-facing features described in the spec or visible in the data schema have no UI or server-action to reach them.

---

## 2. Feature-by-Feature Status

### 2.1 Grid & Slot Management — ✅ Complete

| Spec ref | Feature | Status | Where |
|----------|---------|--------|-------|
| F01 | Resize wall (add/remove slots) | ✅ Done | `actions/grid.ts` → `resizeGrid` |
| F02 | Move a slot to another cell (swap) | ✅ Done | `actions/grid.ts` → `moveSlot` |
| F03 | Edit slot size class | ✅ Done | `actions/grid.ts` → `editSlot` |
| F05 | Edit slot type | ✅ Done | `actions/grid.ts` → `editSlot` |
| F12 | Force slot state transition | ✅ Done | `actions/admin-slots.ts` → `transitionSlot` |
| F12 | Force-release / cancel | ✅ Done | `actions/admin-slots.ts` → `forceRelease` |
| F12 | Take slot out of service | ✅ Done | `actions/admin-slots.ts` → `setSlotServiceState` |
| C01 | Save layout as template | ✅ Done | `actions/grid.ts` → `saveAsTemplate` |

**UI present:** `components/grid-editor.tsx`, `components/slot-modal.tsx` (modal with edit, move, force-release, service-state controls — all generated from state machine), `app/physical-wall/admin/grid/page.tsx` (read/edit toggle).

### 2.2 Pricing Catalogs — ✅ Complete

| Spec ref | Feature | Status | Where |
|----------|---------|--------|-------|
| C02 | Size catalog (dimensions, weight, base price) | ✅ Done | `actions/catalogs.ts` → `upsertSize` |
| C03 | Slot type catalog (multipliers) | ✅ Done | `actions/catalogs.ts` → `upsertSlotType` |
| — | Add-on catalog | ✅ Done | `actions/catalogs.ts` → `upsertAddon` |
| C05 | Versioned refund policy (INSERT, never UPDATE) | ✅ Done | `actions/catalogs.ts` → `setRefundPolicy` |
| — | Wall settings (hold timer, GST, surge, Platter rate) | ✅ Done | `actions/catalogs.ts` → `updateSettings` |
| — | Pricing engine (surge, GST, discount, group tiers) | ✅ Done | `features/physical-wall/pricing.ts` |

**Pure & testable:** `pricing.ts` (quote, base price, addons, surge, GST, group discounts), `money.ts` (INR formatting, paise↔rupee, BP math).

### 2.3 Booking & Reservation — ✅ Complete

| Spec ref | Feature | Status | Where |
|----------|---------|--------|-------|
| F04 | Slot selection on read-only grid | ✅ Done | `wall-browser.tsx`, `wall-grid.tsx` (read mode) |
| F04 | Slot selection on editable grid | ✅ Done | `wall-grid.tsx` (select mode), `booking-flow.tsx` |
| F06 | Quote a basket without holding | ✅ Done | `actions/booking.ts` → `quoteBooking` |
| F07 | Reserve slots (transactional, row-locked) | ✅ Done | `actions/booking.ts` → `reserveBooking` |
| F08 | Attach artwork to a booking | ✅ Done | `actions/booking.ts` → `attachArtwork` |
| F09 | Pick an artwork from the artist's own catalog | ✅ Done | `booking-flow.tsx` artwork picker |
| F11 | Offer slot from queue → artist accepts | ⚠️ Partial | `forceMatch` exists (admin) but **no artist-side offer acceptance UI** — see §4.6 |

**Security:** reservation holds slot locks via `FOR UPDATE`, re-prices from locked DB rows (not form data), checks artwork ownership, overlap detection in the same snapshot.

### 2.4 Install Operations — ✅ Complete

| Spec ref | Feature | Status | Where |
|----------|---------|--------|-------|
| F13 | Artist books install window | ✅ Done | `actions/ops.ts` → `chooseInstallWindow` |
| F14 | Pre-install checklist (auto-generated) | ✅ Done | `checklist.ts` → `generateChecklist`, `isChecklistComplete` |
| F14 | Tick checklist items + condition notes | ✅ Done | `actions/ops.ts` → `updateChecklist`, `install-panel.tsx` |
| F15 | Scan booking QR + verify to go-live | ✅ Done | `actions/ops.ts` → `verifyAndGoLive`, 4-gate check |
| F15 | Issue booking QR on demand | ✅ Done | `actions/ops.ts` → `issueBookingToken` |

**Notable:** `verifyAndGoLive` enforces 4 gates in a single transaction: (1) valid signed token, (2) token belongs to the slot being verified, (3) agreement signed, (4) checklist 100% complete. Artwork gets its own public QR minted here.

**Partial gap:** The checklist generates a "Photograph the work's condition on arrival" item and `pw_checkins.condition_photo_url` column exists (migration 0006), but the InstallPanel only has a text "condition notes" field — **no photo upload** (see §4.4).

### 2.5 Payments — ✅ Complete

| Spec ref | Feature | Status | Where |
|----------|---------|--------|-------|
| F17 | Razorpay order creation | ✅ Done | `actions/payment.ts` → `startPayment` |
| F17 | Confirm payment & set booking paid | ✅ Done | `actions/payment.ts` → `markBookingPaid` |
| F17 | Webhook verification & settlement | ✅ Done | `actions/payment.ts` → `settleFromWebhook`, API route |
| F17 | Admin manual confirmation | ✅ Done | `admin-bookings.tsx` → `markBookingPaid` (manual override) |

### 2.6 Analytics & Engagement — ✅ Complete

| Spec ref | Feature | Status | Where |
|----------|---------|--------|-------|
| F21 | Record visitor QR scan | ✅ Done | `actions/visitor.ts` → `recordScan` |
| F21 | Count scans per artwork | ✅ Done | `data/wall.ts` → `countScans` |
| F22 | Public artwork page | ✅ Done | `app/physical-wall/a/[id]/page.tsx` |
| F23 | Share buttons (Web Share / clipboard) | ✅ Done | `artwork-actions.tsx` → `share()` |
| F24 | Reaction taps (anonymous, aggregated) | ✅ Done | `actions/engagement.ts` → `react`, `getReactionCounts` |
| F25 | Community gallery UGC submission | ❌ Missing | See §4.3 |

### 2.7 Visitor & Perk — ✅ Complete

| Spec ref | Feature | Status | Where |
|----------|---------|--------|-------|
| F26 | Walk-in visitor registration | ✅ Done | `actions/visitor.ts` → `registerVisitor`, `visitor-register.tsx` |
| F26 | Visitor 90-day auto-expiry | ✅ Done | `registerVisitor` sets `expires_at` |
| F26 | Consent withdrawal (data erasure) | ⚠️ Partial | Action `withdrawVisitorConsent` exists but **no UI form** (see §4.5) |
| RP01 | Platter perk preview | ✅ Done | `actions/perk.ts` → `previewPerk` |
| RP01 | Platter perk redemption | ✅ Done | `actions/perk.ts` → `redeemPerk`, `perk-counter.tsx` |
| RP01 | Perk flag review | ❌ Missing | See §4.8 |
| C06 | QR token resolution (revocable) | ✅ Done | `qr.ts`, `data/tokens.ts`, `/q/[token]` resolver |

### 2.8 Survey & Feedback — ✅ Complete

| Spec ref | Feature | Status | Where |
|----------|---------|--------|-------|
| F32 | Post-exhibition survey (rating, NPS, note) | ✅ Done | `actions/engagement.ts` → `submitFeedback`, `feedback-form.tsx` |
| F32 | One response per booking (unique constraint) | ✅ Done | Enforced by `on conflict (booking_id) do nothing` |
| F32 | Survey link from ended booking | ✅ Done | `booking-card.tsx` shows "How was it?" link after exhibition ends |

### 2.9 Waitlist & Queue — ✅ Complete

| Spec ref | Feature | Status | Where |
|----------|---------|--------|-------|
| F10 | Join waitlist with auto-tiering | ✅ Done | `actions/waitlist.ts` → `joinWaitlist`, `waitlist-form.tsx` |
| F10 | Leave waitlist | ✅ Done | `actions/waitlist.ts` → `leaveWaitlist` |
| C04 | Admin queue control (promote/demote/remove) | ✅ Done | `actions/waitlist.ts` → `adjustQueue`, `admin-queue.tsx` |
| C04 | Force-match queue entry to a slot | ✅ Done | `actions/waitlist.ts` → `forceMatch` |
| F16 | Calendar with gap detection | ✅ Done | `data/calendar.ts` → `getCalendar`, `admin/calendar/page.tsx` |

**Known gap:** Waitlist offers and install window reminders are **not messaged** to artists — no email/SMS (see §4.2).

### 2.10 Consent & Rights (DPDP) — ✅ Complete

| Spec ref | Feature | Status | Where |
|----------|---------|--------|-------|
| §5.2 | Consent manager (grant/withdraw) | ✅ Done | `actions/account.ts` → `setConsent`, `data/consent.ts` |
| §5.2 | Onboarding gate (account consent + age) | ✅ Done | `completeOnboarding`, `onboarding-form.tsx` |
| §5.3 | Data export (JSON download) | ✅ Done | `actions/account.ts` → `exportMyData` |
| §5.3 | Data erasure (anonymise, keep contracts) | ✅ Done | `actions/account.ts` → `eraseMyData` |
| §5.3 | Grievance submission | ✅ Done | `actions/account.ts` → `raiseGrievance` |
| §5.3 | Grievance response inbox | ❌ Missing | See §4.7 |
| §5.3 | Nominee designations | ✅ Done | `actions/account.ts` → `setNominee` |
| F31 | Artist QR minted at onboarding | ✅ Done | `completeOnboarding` mints artist coupon |

### 2.11 Agreements — ✅ Complete

| Spec ref | Feature | Status | Where |
|----------|---------|--------|-------|
| F20 | Agreement text generation (pure) | ✅ Done | `agreement.ts` → `agreementClauses`, `agreementText` |
| F20 | Server-side recomputation + SHA-256 hash | ✅ Done | `actions/agreement.ts` → `signAgreement` |
| F20 | Versioned terms | ✅ Done | `TERMS_VERSION`, stored on row |
| F20 | Agreement gates install scheduling | ✅ Done | `chooseInstallWindow` + `verifyAndGoLive` both check |

### 2.12 Ledger — ✅ Complete

| Spec ref | Feature | Status | Where |
|----------|---------|--------|-------|
| F18 | Revenue & expense entries | ✅ Done | `actions/ledger.ts` → `addLedgerEntry`, `ledger-panel.tsx` |
| F18 | CSV export | ✅ Done | `actions/ledger.ts` → `exportLedgerCsv` |
| F18 | Monthly summary (by category) | ✅ Done | `data/ledger.ts` → `getMonthlySummary`, `getPerkSummary` |
| C07 | Platter perk attribution | ✅ Done | `redeemPerk` writes to `pw_ledger` as expense |

### 2.13 Audit Trail — ⚠️ Partial

| Spec ref | Feature | Status | Where |
|----------|---------|--------|-------|
| §7 | Audit writes on every action | ✅ Done | `recordAudit`/`recordAuditIn` called in every action |
| §7 | Audit log viewer UI | ❌ Missing | See §4.6 |

### 2.14 Developer Tooling

| Area | Status | Notes |
|------|--------|-------|
| Migrations | ✅ 7 files | `db/migrations/0001`–`0007` |
| Seeding | ✅ Partial | `scripts/seed-physical-wall.mjs` exists |
| Test runner | ❌ None | No `vitest`/`jest` config, 0 test files |
| Lint/format | ✅ Configured | `eslint.config.mjs`, `.prettierrc.json` |
| Type-checking | ✅ Configured | `tsconfig.json` |

---

## 3. Missing Features — Prioritized

| # | Feature | Priority | Why it matters |
|---|---------|----------|----------------|
| 1 | **Test suite** (unit + integration) | **P0** | 0 tests for testable pure modules; regression risk is high |
| 2 | **Artist-initiated booking cancellation** | **P0** | Artists cannot cancel their own bookings; refund policy exists but is unreachable |
| 3 | **Audit log viewer** | **P1** | Every action is logged but admins can't browse it |
| 4 | **Grievance response inbox** | **P1** | Grievances can be filed but not responded to in-app |
| 5 | **Community gallery (F25)** | **P1** | Consent granted but no UGC submission or gallery |
| 6 | **Notification system (F19)** | **P1** | No email/SMS for offers, install windows, survey invites, or hold reminders |
| 7 | **Artist scan analytics dashboard** | **P2** | `countScans` exists but artists never see their own data |
| 8 | **Artist offer acceptance (F11)** | **P2** | Admin can force-match but artist has no UI to see/accept |
| 9 | **Condition photo upload (F14)** | **P2** | Checklist item exists but no upload mechanism |
| 10 | **Visitor withdrawal UI** | **P2** | `withdrawVisitorConsent` action is unreachable |
| 11 | **Perk flag review (RP01)** | **P2** | Flagged redemptions tracked but not reviewable |
| 12 | **Cleanup: stale `App.js`** | **P3** | Root-level Cloudinary demo, not part of the app |

---

## 4. Phased Implementation Plan

Each phase below has a ready-to-paste prompt. Copy the prompt block, remove the `prompt` wrapper fences, and give it to an agent.

---

### Phase 1: Testing Foundation (P0)

**Gap:** The codebase has 5+ pure, testable modules (`pricing.ts`, `state-machine.ts`, `checklist.ts`, `money.ts`, `agreement.ts`, `qr.ts`, `expiry.ts`) but **zero test files**. The spec explicitly calls pricing and the state machine "tested."

**Files to create:**
- `vitest.config.ts` — Vitest config (already has `vitest` likely as a dep; if not, add it)
- `src/features/physical-wall/__tests__/pricing.test.ts`
- `src/features/physical-wall/__tests__/state-machine.test.ts`
- `src/features/physical-wall/__tests__/checklist.test.ts`
- `src/features/physical-wall/__tests__/money.test.ts`
- `src/features/physical-wall/__tests__/agreement.test.ts`

**Prompt:**

```
Add a test suite to the physical-wall feature using Vitest. Do not write any application code — only test files and config. Read these existing modules first to understand the exact exports and types:

- src/features/physical-wall/pricing.ts
- src/features/physical-wall/state-machine.ts
- src/features/physical-wall/checklist.ts
- src/features/physical-wall/money.ts
- src/features/physical-wall/agreement.ts

For each module, create a test file in src/features/physical-wall/__tests__/ that covers ALL exported functions with:
- Happy-path cases (normal inputs that produce expected outputs)
- Edge cases (boundary values, empty inputs, maximum inputs)
- Error/rejection cases (invalid inputs that should throw or return null)

If Vitest is not already a dependency, install it as a dev dependency and create vitest.config.ts at the project root.

The pricing engine is the most critical — it handles: base price × duration × size multiplier × type multiplier, occupancy surge, GST, group discounts (5+/10+/full-wall tiers), addon totals, and discount calculation. Test it against edge cases like zero occupancy, full occupancy, and negative discount protection.

The state machine must enforce: available→reserved→booked→received→installed→live→removed→available, with admin-only transitions and illegal moves throwing. Test every legal and illegal transition.

After writing, run `pnpm vitest run` and fix any failures. Confirm all tests pass before stopping.
```

---

### Phase 2: Artist-Initiated Cancellation (P0)

**Gap:** The refund policy is versioned and the admin force-release action (`forceRelease`) computes refunds. But an artist cannot cancel their own booking — booking-card.tsx only shows Pay / Sign Agreement / Schedule Install / Feedback, never Cancel.

**What to build:**
1. Server action: `cancelBooking` in `actions/cancellation.ts` (new file)
   - Artist owns the booking, booking is in `held` or `paid` state
   - Uses the booking's snapshotted refund policy version (not today's)
   - Computes refund via `refundAmountPaise()`, writes ledger entry
   - Transitions slot back to `available`
   - Audit-logged
2. Schema: `cancelBookingSchema` in `schema.ts`
3. UI: "Cancel booking" form on `booking-card.tsx` for `held` and `paid` states
   - Confirmation step: type "CANCEL"
   - Shows refund amount preview before submitting

**Prompt:**

```
Add artist-initiated booking cancellation to the physical-wall feature. Read these existing files to understand the patterns:

- src/features/physical-wall/actions/booking.ts (reserveBooking — the inverse flow)
- src/features/physical-wall/actions/admin-slots.ts → forceRelease (refund computation + ledger + slot release)
- src/features/physical-wall/pricing.ts → refundAmountPaise (refund calculator)
- src/features/physical-wall/actions/shared.ts (inTransaction, newId, recordAuditIn, fail, ok, PreconditionError)
- src/features/physical-wall/data/catalogs.ts → getCurrentRefundPolicy, getRefundPolicyVersion
- src/features/physical-wall/schema.ts (existing schemas, zod patterns)
- src/features/physical-wall/components/booking-card.tsx (where the cancel button goes)

Create a new file src/features/physical-wall/actions/cancellation.ts with:

export async function cancelBooking(previous, formData) — "use server"
  - requireRole("artist")
  - Parse bookingId + confirmation from formData
  - In a transaction:
    1. Load the booking + its refund_policy_version, scoped to artist_id
    2. If booking is 'held': release slots (no refund, nothing charged)
    3. If booking is 'paid': compute refund from the snapshotted policy version,
       write ledger expense entry, release slots, set status to 'refunded' or 'cancelled'
    4. Release all slots on the booking back to 'available'
    5. Set artworks physicalStatus to null
    6. Audit-log the cancellation with before/after
  - updateTag(WALL_TAG), LEDGER_TAG

Add cancelBookingSchema to schema.ts: bookingId (min 3), confirm (literal "CANCEL").

Add a "Cancel booking" section to booking-card.tsx that appears for `held` and `paid` bookings (not ended). It should show a refund preview (call a read-only `previewCancellation` helper) and require typing "CANCEL" to confirm. Use useActionState with the existing FormStatus / SubmitButton / Field components.

Follow the exact coding style: "use server" directive, JSDoc blocks with spec references, transactional writes, audit logging, cache tag invalidation.
```

---

### Phase 3: Audit Log Viewer (P1)

**Gap:** Every action writes to `pw_audit_log` via `recordAudit`/`recordAuditIn`, but there's no admin UI to browse, filter, or search it.

**Prompt:**

```
Build an audit log viewer for the physical-wall admin console. Read these files first:

- db/migrations/0006_physical_wall.sql (pw_audit_log table schema)
- src/features/physical-wall/actions/shared.ts (recordAudit, recordAuditIn signatures)
- src/app/physical-wall/admin/layout.tsx (admin nav structure — add a "Logs" item)

Create:

1. src/features/physical-wall/data/audit.ts — read functions:
   - listAuditEntries(opts: { actorId?, action?, subjectType?, since?, limit? }): Promise<AuditEntry[]>
   - countAuditEntries(opts): Promise<number>
   - AuditEntry type matching the pw_audit_log columns

2. src/app/physical-wall/admin/logs/page.tsx — page with:
   - Filter form: action (text), subject type (select), date range, actor ID
   - Table showing: timestamp, actor name (join pw_users), action, subject type+id, before/after JSON (collapsed)
   - Pagination (limit 100, offset)

3. Add "Logs" nav item to the admin layout (ITEMS array) with a FileText or History icon.

Use the existing styling conventions (border-hairline, text-label uppercase, etc.) and the shared editorial components where applicable.
```

---

### Phase 4: Grievance Response Inbox (P1)

**Gap:** `pw_grievances` has `responded_by`, `responded_at`, `due_at` columns (migration 0005), and `raiseGrievance` writes rows, but admins can't list or respond to grievances.

**Prompt:**

```
Build a grievance inbox for admins to view and respond to user complaints. Read these first:

- db/migrations/0005_founding_and_survey.sql (pw_grievances table schema including due_at, responded_by, responded_at)
- src/features/physical-wall/actions/account.ts → raiseGrievance (how they're created)
- src/features/physical-wall/actions/shared.ts (recordAuditIn, inTransaction, newId, ok, fail, toActionError)
- src/app/physical-wall/admin/layout.tsx (add a "Grievances" nav item)
- src/app/physical-wall/admin/ledger/page.tsx (follow this admin page pattern)

Create:

1. src/features/physical-wall/data/grievances.ts:
   - listGrievances(opts: { status?: "open" | "resolved", limit?, offset? }): Promise<Grievance[]>
   - getGrievance(id): Promise<GrievanceDetail | null>

2. src/features/physical-wall/actions/grievances.ts → "use server":
   - resolveGrievance(previous, formData) — requireRole("admin"), sets responded_by, responded_at, records audit

3. src/app/physical-wall/admin/grievances/page.tsx:
   - Table: subject, body preview, submitted by (join user), contact, due date, status
   - Click → detail page with full body + response form
   - Sort by due_at ascending (overdue ones highlighted)

4. Add "Grievances" to admin nav ITEMS.

Use the same patterns as the ledger/admin pages.
```

---

### Phase 5: Community Gallery — UGC Photos (F25) (P1)

**Gap:** The `ugc_publication` consent purpose exists in `consent.ts`, but there's no photo submission action, no gallery, and no moderation. The broader `community/page.tsx` is about Indiagrapher/indigenous traditions, not wall UGC.

**Prompt:**

```
Implement the F25 community gallery: artists who exhibited on the physical wall can submit photos from their exhibition (the work on the wall, diners engaging with it), which appear in a moderated gallery. Read:

- src/features/physical-wall/consent.ts (CONSENTS array — ugc_publication is present)
- src/features/physical-wall/actions/shared.ts (patterns, inTransaction, newId, recordAudit)
- src/features/physical-wall/types/ (existing types)
- src/lib/db (getSql pattern)
- src/features/physical-wall/actions/visitor.ts → registerVisitor (photo upload pattern reference)
- src/features/wall/use-upload.ts (existing upload utility)

Create:

1. Migration file 0008_ugc_gallery.sql — table pw_ugc_submissions (id, artist_id, booking_id, image_url, alt_text, status: pending/approved/rejected, reviewed_by, reviewed_at, created_at)

2. src/features/physical-wall/actions/ugc.ts → "use server":
   - submitUgcPhoto(previous, formData) — requireRole("artist"), require ugc_publication consent, validate image URL + alt text, insert as 'pending'
   - listApprovedPhotos(): read-only, for public gallery
   - listPendingPhotos() / approvePhoto() / rejectPhoto() — admin actions

3. src/app/physical-wall/community/page.tsx — public gallery of approved submissions, grid layout, artist attribution

4. src/app/physical-wall/account/community/page.tsx — artist's own submissions + "submit new" form

5. Add moderation UI to admin layout or as a tab on catalog-editor

Follow existing patterns: consent checks, audit logging, server actions, feature flag.
```

---

### Phase 6: Notification System (F19) (P1)

**Gap:** The system tracks waitlist offers (`offer_expires_at`), booking holds (`hold_expires_at`), install windows, and survey invites, but never messages anyone. A seeded `pw_notifications` table likely doesn't exist (check migrations 0001–0007; if absent, create it).

**Prompt:**

```
Build a notification system for the physical-wall feature that can send email and SMS reminders. Read these first to understand the trigger points:

- src/features/physical-wall/actions/waitlist.ts → forceMatch (offer_expires_at = now() + 48h — this needs a "you have an offer" notification)
- src/features/physical-wall/actions/booking.ts → reserveBooking (hold_expires_at — needs "your hold is about to expire" reminder)
- src/app/physical-wall/feedback/[bookingId]/page.tsx (survey invite — needs "we'd love your feedback" email after exhibition ends)
- CLAUDE.md for notification provider preferences
- db/migrations/0001–0007 (check if pw_notifications table exists; if not, plan migration 0008)
- src/lib/sms or src/lib/email (check if transport modules exist)

Create a minimal notification layer:

1. Migration 0008_notifications.sql (if missing): pw_notifications (id, user_id, channel: email|sms, template, subject, body, recipient, status: pending/sent/failed, sent_at, created_at)

2. src/lib/notifications.ts — interface:
   - queueNotification(opts: { userId, channel, template, data })
   - sendDue(limit?) — polls pending notifications, renders template, calls transport, marks sent/failed, retries once

3. Templates module: waitlist-offer, hold-expiry, install-window-reminder, survey-invite, perk-redemption-receipt

4. Trigger: call queueNotification from forceMatch, reserveBooking, issueBookingToken, and a daily cron (or background task) for expired holds and upcoming install windows.

Do ONE thing at a time: first build the migration + transport interface + queue function + 2 templates (waitlist-offer and hold-expiry), then wire the triggers. Do not integrate a real email/SMS provider unless one is already configured in .env — use a log-only transport in dev.

Follow the project's style: server-only imports, getSql pattern, audit logging on sends.
```

---

### Phase 7: Artist Scan Analytics Dashboard (P2)

**Gap:** `countScans` exists in `data/wall.ts` and the visitor-facing artwork page shows totals, but the artist never sees their own scan data. The spec says "Every scan is tracked; you see who looked and when."

**Prompt:**

```
Build an artist-facing analytics dashboard showing scan data for their work on the wall. Read these first:

- src/features/physical-wall/data/wall.ts → countScans (already exists, per-artwork)
- src/app/physical-wall/page.tsx → scanCounts (the query pattern for per-artwork)
- src/app/physical-wall/a/[id]/page.tsx (visitor-facing scan display pattern)
- src/app/physical-wall/bookings/page.tsx (artist's bookings list — this is where the analytics link should go)
- src/lib/db (getSql, sql tagged template)
- src/features/physical-wall/types/ (LiveArtwork, Booking types)

Create:

1. src/features/physical-wall/data/analytics.ts:
   - listArtistScans(artistId, opts?: { from?, to?, limit? }): Promise<ArtistScan[]>
     Join pw_scans → pw_visits → pw_bookings → pw_artworks, scoped to artist's work
     Return: scan date, artwork title, slot label, visitor (anonymised — no PII from scans)
   - scanTrend(artistId, days?): Promise<{ date, count }[]> — daily rollup

2. src/app/physical-wall/analytics/page.tsx:
   - Chart.js or CSS bar chart of scans over time (last 30 days default)
   - Table of recent scans with artwork + date
   - "Export CSV" button using a read-only action

3. Add a link to /physical-wall/analytics from the bookings page header.

Use the existing CountUp component (src/shared/count-up.tsx) for animated numbers, and follow the editorial Section/Container/Eyebrow pattern from the wall page.
```

---

### Phase 8: Artist Offer Acceptance (F11) (P2)

**Gap:** `forceMatch` in `waitlist.ts` reserves a slot and sets `offer_expires_at = now() + 48h`. But the artist has no UI to see this offer or convert it into a booking. The waitlist form only handles joining/leaving the queue.

**Prompt:**

```
Implement the artist-side waitlist offer acceptance flow (F11). Read:

- src/features/physical-wall/data/waitlist.ts → myQueueEntry, listQueue (shows matched_slot_id + offer_expires_at)
- src/features/physical-wall/actions/waitlist.ts → forceMatch (creates the offer)
- src/features/physical-wall/actions/booking.ts → reserveBooking (how an offer converts to a booking)
- src/features/physical-wall/components/booking-flow.tsx (the normal booking flow — the offer flow should branch into it)
- src/app/physical-wall/waitlist/page.tsx (artist waitlist page — this is where the offer should appear)
- src/features/physical-wall/data/wall.ts → getSlotLabel, getActiveGrid (to look up the offered slot)

Create:

1. src/features/physical-wall/actions/waitlist.ts → acceptOffer(previous, formData) "use server"
   - requireRole("artist")
   - Verify the waitlist entry belongs to the artist and has status='offered' and offer not expired
   - Insert a new booking in 'held' status for the matched slot, using the same pricing as a fresh reservation
   - Set waitlist status to 'accepted'
   - Redirect to the booking flow at step "install window" (agreement is already signed if they exhibited before)

2. Add an "offer banner" to waitlist-form.tsx or waitlist/page.tsx that appears when myQueueEntry shows matched_slot_id with status 'offered' — shows the slot label, expiry time, and an "Accept" button that converts to a booking.

Follow the same transaction + pricing + audit patterns as reserveBooking.
```

---

### Phase 9: Condition Photo Upload (F14) (P2)

**Gap:** The auto-generated checklist includes "Photograph the work's condition on arrival" and the `pw_checkins.condition_photo_url` column exists, but the InstallPanel only has a text field for condition notes. No image upload.

**Prompt:**

```
Add condition photo upload to the pre-install checklist (F14). Read:

- src/features/physical-wall/components/install-panel.tsx (existing checklist UI)
- src/features/physical-wall/checklist.ts → generateChecklist (the "condition" item with key "condition_photo")
- src/features/physical-wall/actions/ops.ts → updateChecklist (saves condition_notes but not photos)
- src/features/wall/use-upload.ts (existing upload utility — study its API)
- src/lib/db (getSql pattern)

Create:

1. src/features/physical-wall/actions/photos.ts → "use server":
   - uploadConditionPhoto(previous, formData) — requireRole("staff"), validate image type/size, upload to storage, update pw_checkins.condition_photo_url + condition_notes, audit-log
   - Return the URL so the UI can show the stored photo

2. Modify InstallPanel to show a file upload button next to "Condition notes" when the "condition_photo" checklist item is being worked on. Show the existing photo URL as a thumbnail if one exists. Use the same useActionState + FormStatus pattern.

3. The checklist completeness check should require the photo to be uploaded (not just the notes field filled).

Follow existing upload patterns from use-upload.ts. Support JPEG/PNG, max 5MB.
```

---

### Phase 10: Visitor Consent Withdrawal UI (P2)

**Gap:** `withdrawVisitorConsent` exists in `actions/visitor.ts` but no route or form lets a visitor actually call it. The action requires a token that resolves to a "visitor" subject type.

**Prompt:**

```
Build a visitor-facing UI for consent withdrawal. The action withdrawVisitorConsent already exists in src/features/physical-wall/actions/visitor.ts — it takes a token (QR code) and deletes the visitor record + revokes the token.

Create src/app/physical-wall/visit/withdraw/page.tsx:

- A page that asks the visitor to scan or type their code
- On submit, calls withdrawVisitorConsent
- Shows success/failure state
- Include this page as a link from the visitor registration confirmation and the scan landing flow

Use the existing form-bits.tsx (Field, SubmitButton, FormStatus) and follow the styling of visitor-register.tsx. The page should be reachable by anyone — no auth required — since visitors never have accounts.

Add a "Withdraw my data" link to the visitor-register confirmation state, and mention it in the DPDP notice copy.
```

---

### Phase 11: Perk Flag Review (P2)

**Gap:** `pw_perk_redemptions` has a `flagged` boolean column, and the admin overview page shows a count of flagged redemptions, but there's no UI to review why they were flagged or clear the flag.

**Prompt:**

```
Add a perk flag review interface for the Platter partnership. Read:

- src/features/physical-wall/data/ledger.ts → getPerkSummary (shows flagged count)
- db/migrations/0006_physical_wall.sql or 0007 (pw_perk_redemptions schema, including flagged column)
- src/app/physical-wall/admin/page.tsx (overview page — the flagged count links to it)
- src/features/physical-wall/actions/perk.ts → redeemPerk (where flagging logic should also live)

Create:

1. src/features/physical-wall/data/perks.ts:
   - listFlaggedRedemptions(): Promise<FlaggedRedemption[]> — joins pw_perk_redemptions with pw_visitors/users
   - clearFlag(id): sets flagged=false, records who cleared it

2. src/app/physical-wall/admin/perks/page.tsx:
   - Table of flagged redemptions: date, principal name, bill amount, discount, artwork ref, reason
   - "Clear flag" button per row (confirm via modal)

3. Add "Perks" nav item to admin layout.

4. Add flag-setting logic to redeemPerk: flag if bill_amount is null, if the same visit has multiple redemptions, or if bill_amount is significantly off expected range.

Follow the admin page patterns (table, alerts, Metric cards) from the existing admin pages.
```

---

### Phase 12: Cleanup (P3)

**Gap:** `App.js` at project root is a standalone Cloudinary demo, not part of the Next.js app.

**Prompt:**

```
Delete the standalone App.js file at the project root (a:\All projects\ArtWall\App.js). It is a Cloudinary demo snippet that imports React and @cloudinary/* packages, is not referenced by next.config.ts or any route, and is not part of the physical-wall feature. Removing it prevents confusion. Before deleting, confirm nothing in the project imports from it — grep for 'import.*from.*App.js' or 'import.*from.\s*"./App"' across the src/ directory.
```

---

## 5. Quick Reference: File Inventory

### Server Actions (14 files)
```
src/features/physical-wall/actions/
├── account.ts       (onboarding, consent, export, erase, grievance, nominee)
├── admin-slots.ts   (transition, force-release, service-state)
├── agreement.ts     (preview, sign)
├── booking.ts       (quote, reserve, attach-artwork)
├── catalogs.ts      (upsert size/type/addon, refund policy, settings)
├── engagement.ts    (reactions, feedback)
├── grid.ts          (resize, move, edit, save-as-template)
├── ops.ts           (install window, receive, checklist update, verify & go-live, issue token)
├── payment.ts       (start, confirm, webhook)
├── perk.ts          (preview, redeem)
├── shared.ts        (inTransaction, newId, ok/fail, error classes, cache tags)
├── visitor.ts       (register, scan, withdraw)
└── waitlist.ts      (join, leave, adjust, force-match)
```

### Data Access (9 files)
```
src/features/physical-wall/data/
├── bookings.ts    (list/ detail for artist + admin, install queue)
├── calendar.ts    (gap detection, 28-day view)
├── catalogs.ts    (sizes, types, addons, settings, refund policy reads)
├── consent.ts     (live consents, history, account facts, onboarding gate)
├── ledger.ts      (entries, monthly summary, perk summary)
├── ops.ts         (checkins, install windows)
├── tokens.ts      (token resolution, QR metadata)
├── wall.ts        (slots, live artworks, scan counts, reaction counts)
└── waitlist.ts    (queue list, personal entry, position, count)
```

### Components (21 files)
```
src/features/physical-wall/components/
├── admin-bookings.tsx     (admin booking table + manual pay)
├── admin-queue.tsx        (waitlist queue management)
├── agreement-panel.tsx    (read + sign agreement modal)
├── artwork-actions.tsx    (reactions, share)
├── booking-card.tsx       (per-booking state machine UI)
├── booking-flow.tsx       (multi-step booking wizard)
├── catalog-editor.tsx     (size/type/addon/settings editor)
├── feedback-form.tsx      (survey form)
├── form-bits.tsx          (SubmitButton, FormStatus, Field, inputClass)
├── grid-editor.tsx        (wall map editor)
├── install-panel.tsx      (checklist + go-live controls)
├── ledger-panel.tsx       (revenue/expenses + CSV export)
├── onboarding-form.tsx    (F31 consent gate)
├── perk-counter.tsx       (Platter counter UI)
├── qr-code.tsx            (QR display component)
├── rights-centre.tsx      (consent + data rights)
├── slot-modal.tsx         (slot config + force actions)
├── stepper.tsx            (progress rail)
├── visitor-register.tsx   (walk-in visitor form)
├── waitlist-form.tsx      (join/leave queue)
├── wall-browser.tsx       (live artwork browser)
└── wall-grid.tsx          (grid renderer: read/select/edit mode)
```

### Pure Domain Modules
```
src/features/physical-wall/
├── pricing.ts         (quote engine — NOT tested)
├── state-machine.ts   (9 states, legal transitions — NOT tested)
├── checklist.ts       (auto-generate from booking facts — NOT tested)
├── agreement.ts       (text generation + hashing — NOT tested)
├── money.ts           (INR/paise/BP math — NOT tested)
├── qr.ts              (token minting)
├── audit.ts           (audit log writers)
├── authorize.ts       (RBAC, 4 roles)
├── consent.ts         (consent purposes, notice versions)
├── action-state.ts    (IDLE constant + ActionState type)
├── types.ts           (all domain types)
├── schema.ts          (zod schemas for all actions)
├── expiry.ts          (hold release cron)
└── razorpay.ts        (PSP integration)
```

### Migrations (7 files)
```
db/migrations/
├── 0001_waitlist.sql              (waitlist + queue overrides)
├── 0002_artwork.sql               (artworks table)
├── 0003_studio.sql                (studio + tasks + contacts)
├── 0004_artist_profiles.sql       (artist_profiles table)
├── 0005_founding_and_survey.sql   (founding, survey, grievances, consents)
├── 0006_physical_wall.sql         (the big one: grids, slots, bookings, checkins, ledger, qr, payments, visits, scans, reactions)
└── 0007_physical_wall_engagement.sql (feedback, agreements, perk redemptions, consent refinements)
```

### Route Inventory
```
src/app/physical-wall/
├── layout.tsx                    (feature flag gate)
├── page.tsx                      (F28 overview — wall browser, stats, how-it-works)
├── book/page.tsx                 (F04-06 booking flow)
├── bookings/page.tsx             (F13 artist bookings list)
├── feedback/[bookingId]/page.tsx (F32 survey)
├── visit/page.tsx                (F26 visitor registration)
├── waitlist/page.tsx             (F10 join/leave queue)
├── welcome/page.tsx              (F31 onboarding gate)
├── account/                      (artist account: consent, rights)
├── admin/
│   ├── layout.tsx                (admin nav rail)
│   ├── page.tsx                  (overview dashboard)
│   ├── grid/page.tsx             (F01-02 grid editor)
│   ├── calendar/page.tsx         (F16 calendar + gaps)
│   ├── bookings/page.tsx         (F17 admin booking table)
│   ├── queue/page.tsx            (C04 queue control)
│   ├── catalogs/page.tsx         (C02-05 pricing admin)
│   └── ledger/page.tsx           (F18 ledger + CSV export)
├── a/[id]/page.tsx               (F22 public artwork page)
└── ops/
    ├── page.tsx                  (F14 install queue)
    └── perk/
        ├── page.tsx              (RP01 manual code entry)
        └── [token]/page.tsx      (RP01 counter screen)
```

---

## 6. Technical Debt & Observations

| Issue | Impact | Recommendation |
|-------|--------|----------------|
| `App.js` at root | Low — confusing leftover | Delete (Phase 12) |
| `d:/ig reels/artwall-wms.jsx` | Low — external prototype file | Review for design insights, do not import |
| `groupDiscountTiers` in settings | Medium — "invented numbers" not in spec | Document or remove; flag in admin page (done) |
| `surgeEnabled` in settings | Medium — not in written spec | Flag as prototype-only (done in admin page) |
| No `data/visitor.ts` | Low — visitor reads are inline | Acceptable for current scale |
| `requireRole` reads from DB on every request | Low — no caching | Acceptable for a staff-facing app at this scale |
| `features.physicalWall` flag only checks existence | Low — no sub-flags | Consider per-subfeature flags for staged rollout |
| Scan count query in `/physical-wall/page.tsx` is inline | Low — not in data layer | Move to `data/wall.ts` for consistency |

---

## 7. Priority Summary

```
Phase 1  [P0]  Test suite                     →  vitest.config + 5 test files
Phase 2  [P0]  Artist cancellation            →  actions/cancellation.ts + booking-card UI
Phase 3  [P1]  Audit log viewer               →  data/audit.ts + admin/logs/page.tsx
Phase 4  [P1]  Grievance inbox                →  data/grievances.ts + actions + admin/grievances/page.tsx
Phase 5  [P1]  Community gallery (F25)        →  migration + ugc.ts + 2 routes + admin moderation
Phase 6  [P1]  Notification system (F19)      →  migration + notifications.ts + templates + triggers
Phase 7  [P2]  Artist scan analytics          →  data/analytics.ts + analytics page
Phase 8  [P2]  Offer acceptance (F11)         →  acceptOffer action + waitlist offer banner
Phase 9  [P2]  Condition photo upload (F14)   →  photos.ts + form-bits integration
Phase 10 [P2]  Visitor withdrawal UI          →  withdraw page + links from registration
Phase 11 [P2]  Perk flag review (RP01)        →  data/perks.ts + admin/perks/page.tsx
Phase 12 [P3]  Cleanup App.js                 →  delete standalone file
```
