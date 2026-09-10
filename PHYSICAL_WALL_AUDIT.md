# Physical Wall Feature Audit
## Prototype JSX (`context_for_claude_for_physical_wall/artwall-wms.jsx`) vs Next.js Implementation (`src/features/physical-wall/`)

**Date:** 2026-08-22  
**Spec:** AWL/ENG/2026/WMS-SPEC-002 v1.1 · 32 features · 6 pillars  
**Auditor:** Kilo  

---

## Executive Summary

The prototype JSX is a **single-file in-memory reference** covering all 32 WMS features across 4 roles (Visitor, Artist, Admin, Platter). The Next.js `physical-wall` feature is a **production-grade partial implementation** of the same spec, with server actions, Postgres, and proper RBAC — but it is **not a complete port** of the prototype. Several features exist only in the prototype, and several production features have no prototype counterpart.

| Layer | Scope | Status |
|-------|-------|--------|
| Prototype JSX | Full WMS (all 32 features, 4 roles) | Complete as prototype |
| Next.js physical-wall | Subset focused on wall booking/lifecycle | Production-ready for implemented features |
| Public `/physical-wall` page | Visitor discovery + booking entry | Complete |

---

## Feature-by-Feature Audit

### F01 — Dynamic Slot Grid Configuration

| Aspect | Prototype JSX | Next.js Implementation |
|--------|--------------|----------------------|
| **Present** | ✅ `GRID_RESIZE`, `SLOT_ADD`, `TEMPLATE_SAVE`, `SLOT_REMOVE` | ✅ `resizeGrid`, `saveAsTemplate` in `actions/grid.ts` |
| **DB Schema** | In-memory `state.grid` | `pw_grid_config`, `pw_slots` with versioning |
| **Locked slots protected** | ✅ `LOCKED` set blocks re-config | ✅ `isOccupied()` check in `resizeGrid` |
| **Audit** | ✅ `grid.reconfigured` | ✅ `recordAuditIn` with before/after |
| **Gaps** | No optimistic locking (in-memory) | ✅ Row versioning (`version` column) |

**Verdict:** Both implement F01. Production adds transaction safety and version checks the prototype lacks.

---

### F02 — Visual Slot Map Editor / Atomic Swap

| Aspect | Prototype JSX | Next.js Implementation |
|--------|--------------|----------------------|
| **Present** | ✅ `SWAP_SLOTS` (atomic coordinate swap) | ✅ `moveSlot` in `actions/grid.ts` |
| **Drag & drop** | ✅ HTML5 DnD in `WallGrid` | ✅ `WallGrid` component with `onDrop` |
| **Keyboard accessible** | ❌ Not in prototype | ✅ Edit mode: focus + Enter to pick up/drop |
| **Swap safety** | In-memory map swap | ✅ Park-at-negative-row trick to avoid unique-index collision |
| **Audit** | ✅ `slot.moved` | ✅ `slot.moved` with before/after coordinates |

**Verdict:** Both implement F02. Production is more robust (transactional swap, keyboard path, optimistic locking).

---

### F03 — Slot Size Categories (Editable Catalog · C02)

| Aspect | Prototype JSX | Next.js Implementation |
|--------|--------------|----------------------|
| **Present** | ✅ `SIZE_SAVE` (CRUD size catalog) | ✅ `actions/catalogs.ts` |
| **DB Schema** | `state.sizeCatalog` array | `pw_size_catalog` table |
| **Re-price future bookings only** | ✅ Comment notes this | ✅ Explicit: "A size change re-prices future bookings only" |
| **Active/inactive** | ✅ `active` flag | ✅ `active` boolean column |

**Verdict:** Both implement C02. Production persists to Postgres.

---

### F04 — Slot Status Lifecycle (State Machine)

| Aspect | Prototype JSX | Next.js Implementation |
|--------|--------------|----------------------|
| **Present** | ✅ `MACHINE` object with 9 states + transitions | ✅ `SLOT_TRANSITIONS` in `state-machine.ts` |
| **States** | 9 states (available → live → ended) | Same 9 states |
| **Illegal transition guard** | ✅ `legal = MACHINE[slot.state].includes(to)` | ✅ `assertTransition()` throws `IllegalTransitionError` (409) |
| **Admin-only transitions** | ✅ Not explicitly separated | ✅ `ADMIN_ONLY` set + `ForbiddenTransitionError` (403) |
| **Locked states (C01)** | ✅ `LOCKED = new Set(["booked", "received", "installed", "live"])` | ✅ `OCCUPIED_STATES` + `isOccupied()` |

**Verdict:** Both implement F04 + C01. Production adds typed errors and explicit admin gating.

---

### F05 — Slot Types (with Multipliers)

| Aspect | Prototype JSX | Next.js Implementation |
|--------|--------------|----------------------|
| **Present** | ✅ `TYPES` object (standard 1.0x → sponsored 0x) | ✅ `pw_slot_types` table + `multiplier_bp` |
| **Types** | 6 types: standard, premium, featured, workshop, walkin, sponsored | Same 6 types |
| **Multipliers** | Float multipliers (1.0, 1.4, 1.8, 1.5, 1.3, 0) | Basis points (10000 = 1.0x) — integer math |
| **Editable** | ✅ `SLOT_EDIT` patches type | ✅ `editSlot` action |

**Verdict:** Both implement F05. Production uses integer basis points to avoid float rounding errors in money calculations.

---

### F06 — Calendar Availability

| Aspect | Prototype JSX | Next.js Implementation |
|--------|--------------|----------------------|
| **Present** | ✅ Implicit in booking flow (available slots shown) | ✅ `listAvailableSlotIds` in `data/wall.ts` |
| **Date overlap check** | ✅ Clash detection in `CREATE_BOOKING` | ✅ SQL overlap query inside `reserveBooking` transaction |
| **Buffer days** | ❌ Not in prototype | ✅ `buffer_days` setting |
| **Lapsed hold handling** | ❌ Not in prototype | ✅ `releaseLapsedHoldsIn` + computed state in `listSlots` |

**Verdict:** Both implement F06. Production adds buffer days and lapsed-hold cleanup the prototype lacks.

---

### F07 — Multi-Slot Booking (All-or-Nothing)

| Aspect | Prototype JSX | Next.js Implementation |
|--------|--------------|----------------------|
| **Present** | ✅ `CREATE_BOOKING` with atomic slot reservation | ✅ `reserveBooking` with `for update` locks |
| **Rollback on clash** | ✅ "full rollback, nothing reserved" | ✅ Transaction throws → all slot updates + booking row roll back |
| **Concurrency safety** | In-memory single-user | ✅ Row-level locks + snapshot isolation |
| **Artwork ownership check** | ❌ Not in prototype | ✅ `exists (select 1 from artworks where id = $1 and userId = $2)` |

**Verdict:** Both implement F07. Production is transactionally safe; prototype is single-user so concurrency is moot.

---

### F08 — Duration Selection (Discount Curve)

| Aspect | Prototype JSX | Next.js Implementation |
|--------|--------------|----------------------|
| **Present** | ✅ `DUR` array (1d/3d/7d/14d/30d with discount factors) | ✅ `DURATION_TIERS` in `pricing.ts` |
| **Discount curve** | Float factors (1.0 → 0.72) | Basis points (10000 → 7200) |
| **Visible in UI** | ✅ Duration buttons with `×{f}` label | ✅ `DURATION_TIERS` rendered in `BookingFlow` |

**Verdict:** Both implement F08. Same tiers, different numeric representation.

---

### F09 — Artwork Upload

| Aspect | Prototype JSX | Next.js Implementation |
|--------|--------------|----------------------|
| **Present** | ✅ Upload UI in `BookingFlow` step 1 | ✅ `attachArtwork` action + Cloudinary signed upload |
| **MIME/magic-byte validation** | ❌ Not in prototype | ⚠️ Partial — schema validates, but migration notes say "No MIME/magic-byte validation" |
| **EXIF stripping** | ❌ Not in prototype | ❌ Not implemented (gap) |
| **Re-encoding** | ❌ Not in prototype | ❌ Not implemented (gap) |
| **Thumbnails** | ❌ Not in prototype | ⚠️ Cloudinary transforms serve as thumbnails |

**Verdict:** Prototype has UI only. Production has attachment flow but lacks image validation/processing per spec.

---

### F10 — Waitlist

| Aspect | Prototype JSX | Next.js Implementation |
|--------|--------------|----------------------|
| **Present** | ✅ `WL_JOIN`, `WL_MOVE`, `WL_REMOVE`, `WL_NOTE`, `WL_MATCH` | ✅ `actions/waitlist.ts` |
| **Priority tiers** | ✅ founding > repeat > referred > new | ✅ `tier` column in `pw_waitlist_entries` |
| **Admin override** | ✅ `WL_MOVE` (promote/demote) + `WL_MATCH` | ✅ Admin queue component |
| **Notifications** | ❌ Not in prototype | ❌ Missing (gap) |
| **Offer acceptance UI** | ❌ Not in prototype | ❌ Missing (gap) |
| **Consent/retention** | ⚠️ Mentioned in comments | ⚠️ Not fully implemented |

**Verdict:** Core waitlist exists in both. Production lacks notifications and offer acceptance.

---

### F11 — Add-ons (Editable Catalog · C03)

| Aspect | Prototype JSX | Next.js Implementation |
|--------|--------------|----------------------|
| **Present** | ✅ `ADDON_SAVE` (CRUD add-on catalog) | ✅ `actions/catalogs.ts` |
| **DB Schema** | `state.addonCatalog` array | `pw_addon_catalog` table |
| **Categories** | ✅ `category: "coffee"` vs `"general"` | ✅ `category` check constraint |
| **Applies-to gating** | ✅ `applies_to: "artist"/"visitor"/"both"` | ✅ `appliesTo` enum |
| **Active/inactive** | ✅ `active` flag | ✅ `active` boolean |

**Verdict:** Both implement F11 + C03. Production persists to Postgres with constraints.

---

### F12 — Admin Force Book / Force Release

| Aspect | Prototype JSX | Next.js Implementation |
|--------|--------------|----------------------|
| **Present** | ✅ `FORCE_RELEASE` + `FORCE_BOOK` | ✅ `forceRelease` + `transitionSlot` in `actions/admin-slots.ts` |
| **Refund on release** | ✅ C05 refund policy applied | ✅ Snapshotted policy version → `refundAmountPaise` |
| **Razorpay refund** | ❌ Not in prototype | ✅ `createRefund` call when PSP payment exists |
| **De-install task** | ❌ Not in prototype | ✅ Inserts into `tasks` table when releasing live slot |
| **Audit** | ✅ `slot.forced` | ✅ `slot.force-released` with before/after JSONB |

**Verdict:** Both implement F12. Production adds real Razorpay refunds and de-install task creation.

---

### F13 — Installation Window Scheduling

| Aspect | Prototype JSX | Next.js Implementation |
|--------|--------------|----------------------|
| **Present** | ✅ `PICK_WINDOW` (3 hardcoded windows) | ✅ `pw_install_windows` table |
| **Venue hours** | ❌ Not in prototype | ✅ `venue_open_hour`, `venue_close_hour` in `pw_settings` |
| **30-min windows** | ❌ Not in prototype | ⚠️ Schema supports timestamps; UI not confirmed |
| **Conflict prevention** | ❌ Not in prototype | ⚠️ Overlap check exists in booking but not explicitly for install windows |
| **Staff tasks** | ❌ Not in prototype | ✅ De-install task on force-release |
| **Reminders** | ❌ Not in prototype | ❌ Missing |
| **No-show handling** | ❌ Not in prototype | ✅ `status` enum includes `missed` |

**Verdict:** Prototype has basic window picker. Production has schema and some logic but lacks full scheduling UX.

---

### F14 — Pre-Installation Checklist

| Aspect | Prototype JSX | Next.js Implementation |
|--------|--------------|----------------------|
| **Present** | ✅ `deriveChecklist` (derived from slot size/type/add-ons) | ✅ `checklist` JSONB in `pw_checkins` |
| **Derived** | ✅ "F14 checklist is derived, not manual" | ✅ Checklist generated from slot metadata |
| **Condition photos** | ❌ Not in prototype | ✅ `condition_photo_url` + `condition_notes` columns |
| **Damage records** | ❌ Not in prototype | ⚠️ `condition_notes` serves this purpose |

**Verdict:** Both implement F14. Production adds condition photo/notes fields.

---

### F15 — Staff Check-in + QR Verification

| Aspect | Prototype JSX | Next.js Implementation |
|--------|--------------|----------------------|
| **Present** | ✅ `CHECKIN_COMPLETE` (QR verify + checklist → live) | ✅ `verifyAndGoLive` in `actions/ops.ts` |
| **QR verification** | ✅ "QR signed-redirect verified on staff device" | ✅ HMAC-signed `pw_qr_tokens` with resolver |
| **Checklist 100% required** | ✅ All items must be ticked | ✅ Server refuses incomplete checklist |
| **Tamper-evident labels** | ✅ `downloadCard` generates print-ready PNG | ✅ QR label generation in prototype; production QR resolver |

**Verdict:** Both implement F15. Production adds server-side QR token resolution.

---

### F16 — Exhibition Calendar / Gantt

| Aspect | Prototype JSX | Next.js Implementation |
|--------|--------------|----------------------|
| **Present** | ✅ `GanttCalendar` component | ✅ `data/calendar.ts` |
| **Gantt view** | ✅ 21-day horizontal bars per booking | ✅ Query-based calendar data |
| **Gap detection** | ❌ Not in prototype | ⚠️ Mentioned in comments ("Gaps of 3+ days trigger waitlist auto-rotation") |

**Verdict:** Both implement F16. Production has data layer; prototype has UI.

---

### F17 — Razorpay Payments

| Aspect | Prototype JSX | Next.js Implementation |
|--------|--------------|----------------------|
| **Present** | ✅ `PAY` action (webhook-verified only) | ✅ `startPayment`, `settleBooking`, `settleFromWebhook` |
| **Order creation** | ❌ Not in prototype | ✅ `createOrder` in `razorpay.ts` |
| **Webhook verification** | ✅ "PAID ONLY on HMAC-verified webhook" | ✅ `razorpay/webhook/route.ts` with signature verification |
| **Amount verification** | ❌ Not in prototype | ✅ `options.amountPaise !== amount` check |
| **Idempotency** | ✅ "signature verified · idempotent" | ✅ `event_id` unique + `on conflict do nothing` |
| **Admin fallback** | ❌ Not in prototype | ✅ `markBookingPaid` for cash/UPI-in-person |
| **Refund** | ✅ `FORCE_RELEASE` refund | ✅ `createRefund` via Razorpay API |

**Verdict:** Production F17 is far more complete. Prototype simulates payment; production has real Razorpay integration with webhooks, idempotency, and admin fallback.

---

### F18 — Revenue Dashboard

| Aspect | Prototype JSX | Next.js Implementation |
|--------|--------------|----------------------|
| **Present** | ✅ `AdminOverview` stats + `LedgerPanel` | ✅ `data/analytics.ts` |
| **Revenue by day** | ✅ `state.revenueByDay` bar chart | ✅ Queries available |
| **Slot-type revenue** | ❌ Not in prototype | ⚠️ Not explicitly broken out |
| **Settlement tracking** | ❌ Not in prototype | ⚠️ `pw_payments` table tracks status |

**Verdict:** Both have basic revenue display. Production has data layer; detailed analytics not confirmed in UI.

---

### F19 — Monthly P&L / Ledger

| Aspect | Prototype JSX | Next.js Implementation |
|--------|--------------|----------------------|
| **Present** | ✅ `LedgerPanel` (two-list ledger, CSV export) | ✅ `pw_ledger` table + `actions/ledger.ts` |
| **Two-list design** | ✅ revenue / expense | ✅ `type` check constraint |
| **GST invoices** | ❌ Not in prototype | ❌ Missing (gap) |
| **HSN/SAC** | ❌ Not in prototype | ❌ Missing |
| **Locked periods** | ❌ Not in prototype | ❌ Missing |
| **Adjustment records** | ❌ Not in prototype | ⚠️ Corrections are new entries (per spec intent) |

**Verdict:** Both implement C07 minimal ledger. Production lacks GST invoice generation and locked periods.

---

### F20 — Digital Exhibition Agreement

| Aspect | Prototype JSX | Next.js Implementation |
|--------|--------------|----------------------|
| **Present** | ✅ Agreement text + e-sign checkbox + `SIGN` action | ✅ `agreement.ts` + `actions/agreement.ts` |
| **E-signature** | ✅ "IT Act §6 · terms_hash sealed" | ✅ `terms_hash` stored |
| **Refund policy embedded** | ✅ "refund policy v{version} embedded" | ✅ `refund_policy_version` snapshotted on booking |
| **IP clause** | ✅ "Artist retains copyright; Artwall holds display licence" | ✅ Present in agreement text |

**Verdict:** Both implement F20. Production adds proper agreement generation and storage.

---

### F21 — QR/NFC Scan Tracking

| Aspect | Prototype JSX | Next.js Implementation |
|--------|--------------|----------------------|
| **Present** | ✅ `SCAN` action (increments `artwork.scans`) | ✅ `recordScan` in `actions/visitor.ts` |
| **No IP stored** | ✅ "async queue ingest · no raw IP stored" | ✅ `pw_scans` has no IP/user-agent columns |
| **Rate limiting** | ❌ Not in prototype | ✅ Rotating hash key, 30 req/min per artwork |
| **Dedup window** | ❌ Not in prototype | ✅ 30-second dedup in SQL |
| **NFC** | Mentioned in UI ("NFC + QR verified") | ⚠️ QR-only per C06; NFC mentioned but not implemented |

**Verdict:** Both implement F21 (QR). Production adds rate limiting and dedup. NFC is UI-only in both.

---

### F22 — Public Artwork Page

| Aspect | Prototype JSX | Next.js Implementation |
|--------|--------------|----------------------|
| **Present** | ✅ `ArtworkModal` (full detail view) | ✅ `/physical-wall/a/[artworkId]` route + `getPublicArtwork` |
| **Artist info** | ✅ Name, city, medium | ✅ Public fields only from `user` + `artist_profiles` |
| **Contact never exposed** | ✅ "Contact is never exposed" | ✅ Only `name`, `handle`, `location` selected |
| **Interest routes through platform** | ✅ `INTEREST` action | ✅ Interest button present |

**Verdict:** Both implement F22. Production has dedicated route; prototype has modal.

---

### F23 — Social Sharing

| Aspect | Prototype JSX | Next.js Implementation |
|--------|--------------|----------------------|
| **Present** | ✅ Share buttons (WhatsApp, Instagram, X, Copy link) | ⚠️ Not confirmed in production files read |
| **Platform-specific** | ✅ "Shared to {ch} — public artwork page + OG image" | ⚠️ OG tags may exist in metadata but not confirmed |
| **Copy-link fallback** | ✅ "Copy link" button | ⚠️ Not confirmed |

**Verdict:** Prototype has F23 UI. Production status unclear from files read.

---

### F24 — Reactions

| Aspect | Prototype JSX | Next.js Implementation |
|--------|--------------|----------------------|
| **Present** | ✅ `REACT` action + reaction buttons | ✅ `react` in `actions/engagement.ts` |
| **Aggregate counts** | ✅ `artwork.reactions` object | ✅ `pw_reactions` table with `count` column |
| **No per-person row** | ✅ "no who reacted to leak" | ✅ Aggregate-only design |
| **Rate limiting** | ❌ Not in prototype | ✅ 20/min per artwork per rotating key |

**Verdict:** Both implement F24. Production adds rate limiting.

---

### F25 — Selfie UGC

| Aspect | Prototype JSX | Next.js Implementation |
|--------|--------------|----------------------|
| **Present** | ✅ `SelfieBooth` component + `UGC_SUBMIT` | ❌ Missing (gap per PRODUCTION_GAP_ANALYSIS.md) |
| **Consent** | ✅ Explicit consent checkbox + adult checkbox | ❌ Missing |
| **Moderation** | ✅ `UGC_MODERATE` (approve/remove) | ❌ Missing |
| **CDN purge** | ✅ "CDN purged" in audit | ❌ Missing |

**Verdict:** ❌ Prototype has F25. Production does NOT implement F25. This is a confirmed P0 gap.

---

### F26 — Walk-in Visitor Registration

| Aspect | Prototype JSX | Next.js Implementation |
|--------|--------------|----------------------|
| **Present** | ✅ `WalkInRegister` + `VISITOR_REGISTER` | ✅ `registerVisitor` in `actions/visitor.ts` |
| **Consent-first** | ✅ "Consent-first. Purpose stated at collection" | ✅ `consent_purpose` required, `consent_marketing` separate |
| **Contact validation** | ✅ Email or 10-digit phone regex | ✅ Same validation in action |
| **QR reward** | ✅ QR code generated + displayed | ✅ `mintQrToken` + `pw_qr_tokens` |
| **Retention** | ⚠️ Mentioned in comments | ✅ `expires_at = now() + 90 days` |
| **Withdrawal/erasure** | ❌ Not in prototype | ✅ `withdrawVisitorConsent` deletes row + revokes token |

**Verdict:** Both implement F26. Production adds retention expiry and withdrawal/erasure.

---

### F27 — Live Artwork Carousel

| Aspect | Prototype JSX | Next.js Implementation |
|--------|--------------|----------------------|
| **Present** | ✅ Horizontal marquee of live artworks | ✅ `WallBrowser` scroll-snapping rail |
| **Real-time updates** | ❌ Not in prototype | ❌ Missing (gap) |
| **Falls back to REST** | ✅ Comment notes REST fallback | ⚠️ ISR revalidate = 30s provides periodic refresh |

**Verdict:** Both have F27 UI. Production lacks real-time socket updates (noted gap).

---

### F28 — Full-Text Search

| Aspect | Prototype JSX | Next.js Implementation |
|--------|--------------|----------------------|
| **Present** | ✅ `SearchPage` (client-side filter by title/medium/artist/city) | ✅ `WallBrowser` client-side search |
| **Meilisearch** | ❌ Not in prototype | ❌ Missing (confirmed P0 gap) |
| **No PII in logs** | ✅ Comment notes this | ✅ No PII in search queries |

**Verdict:** Both have basic search. Production lacks Meilisearch (confirmed P0 gap).

---

### F29 — Booking Confirmation Graphic

| Aspect | Prototype JSX | Next.js Implementation |
|--------|--------------|----------------------|
| **Present** | ✅ `ConfirmationGraphic` (shareable card) | ⚠️ Not confirmed in files read |
| **Download/share** | ✅ "Share graphic" button | ⚠️ May exist in booking flow component |

**Verdict:** Prototype has F29. Production status unclear.

---

### F30 — Community Gallery

| Aspect | Prototype JSX | Next.js Implementation |
|--------|--------------|----------------------|
| **Present** | ✅ `CommunityGallery` + `UGC_SUBMIT` | ❌ Missing (confirmed P0 gap) |
| **Approved UGC only** | ✅ `gallery = state.ugc.filter(u => u.status === "approved")` | ❌ Missing |
| **Withdrawal + CDN purge** | ✅ "item removed + CDN purged" | ❌ Missing |

**Verdict:** ❌ Prototype has F30. Production does NOT implement F30. Confirmed P0 gap.

---

### F31 — Artist Registration / Verification

| Aspect | Prototype JSX | Next.js Implementation |
|--------|--------------|----------------------|
| **Present** | ✅ `ArtistRegister` + `ARTIST_VERIFY` | ✅ `actions/account.ts` |
| **DigiLocker verification** | ✅ "Verify with DigiLocker before first payout" | ⚠️ Schema for verification exists but workflow not confirmed |
| **Founding Member badge** | ✅ `founding: true` badge | ✅ `founding` flag present |
| **Consent records** | ✅ `consent: { account, marketing }` | ✅ `pw_visitors` has consent columns; artist consent not fully confirmed |

**Verdict:** Both implement F31 core. Production has account creation; DigiLocker workflow not fully confirmed.

---

### F32 — Post-Exhibition Feedback

| Aspect | Prototype JSX | Next.js Implementation |
|--------|--------------|----------------------|
| **Present** | ✅ `FeedbackSurvey` (NPS + rating + note) | ✅ `submitFeedback` in `actions/engagement.ts` |
| **One per booking** | ✅ `state.feedback.some(f => f.bookingId === a.bookingId)` | ✅ Unique index on `pw_feedback(booking_id)` |
| **Automatic invite** | ❌ Not in prototype | ❌ Missing (no notification system) |
| **Analytics** | ❌ Not in prototype | ⚠️ Data captured; analytics UI not confirmed |

**Verdict:** Both implement F32 data capture. Production lacks automatic invitation (no notification system).

---

## Cross-Cutting Concerns (C01–C07, RP01)

### C01 — Locked Slots Across Re-configs

| Prototype JSX | Next.js |
|---------------|---------|
| ✅ `LOCKED` set blocks size/type edits + removal | ✅ `isOccupied()` blocks resize + slot edit |

### C02 — Editable Size Catalog

| Prototype JSX | Next.js |
|---------------|---------|
| ✅ `SIZE_SAVE` CRUD | ✅ `pw_size_catalog` table + `actions/catalogs.ts` |

### C03 — Editable Add-on Catalog

| Prototype JSX | Next.js |
|---------------|---------|
| ✅ `ADDON_SAVE` CRUD | ✅ `pw_addon_catalog` table + `actions/catalogs.ts` |

### C04 — Admin Queue Override

| Prototype JSX | Next.js |
|---------------|---------|
| ✅ `WL_MOVE`, `WL_MATCH`, `WL_REMOVE` | ✅ Admin queue component |

### C05 — Single-Line Refund Policy (Versioned)

| Prototype JSX | Next.js |
|---------------|---------|
| ✅ `REFUND_POLICY` action, versioned, uniform % | ✅ `pw_refund_policy` table, append-only, snapshotted on booking |

### C06 — QR-Only (No NFC Data Storage)

| Prototype JSX | Next.js |
|---------------|---------|
| ✅ "QR-only (C06) · real QRs resolve through signed server-side redirect" | ✅ `pw_qr_tokens` HMAC-signed, no NFC storage |

### C07 — Minimal Ledger

| Prototype JSX | Next.js |
|---------------|---------|
| ✅ `LedgerPanel` (revenue/expense, CSV export) | ✅ `pw_ledger` table + `actions/ledger.ts` |

### RP01 — Ric Platter Counter / Perk Redemption

| Prototype JSX | Next.js |
|---------------|---------|
| ✅ `REDEEM` action (artist + visitor paths) | ✅ `previewPerk` + `redeemPerk` in `actions/perk.ts` |
| **Bill amount = sale signal** | ✅ `bill_amount_paise` required | ✅ `billPaise` validated > 0 |
| **One per visit/booking** | ✅ Checked in reducer | ✅ Unique indexes on `visit_ref` + `booking_ref` |
| **Artwork attribution** | ✅ "attributed to the artwork that drove the visit" | ✅ `artwork_ref` from last scan (visitor) or booking (artist) |
| **Cost bearer** | ⚠️ Not in prototype | ✅ `perk_cost_bearer` setting (artwall/platter/split) |

---

## Public `/physical-wall` Page

| Feature | Status |
|---------|--------|
| Hero with live count | ✅ |
| Stats strip (works hanging, slots available, scans, positions) | ✅ |
| "Hanging now" section with `WallBrowser` | ✅ |
| Slot map with `WallGrid` (read mode) | ✅ |
| "How it works" 4-step flow | ✅ |
| "For visitors" section | ✅ |
| Venue info | ✅ |
| Final CTA | ✅ |
| Links to `/book`, `/waitlist`, `/visit` | ✅ |

---

## Database Schema Coverage

| Table | Purpose | Features |
|-------|---------|----------|
| `pw_grid_config` | Wall layouts + templates | F01, C01 |
| `pw_slots` | Individual positions | F01, F02, F04, C01 |
| `pw_size_catalog` | Size classes (editable) | F03, C02 |
| `pw_slot_types` | Type multipliers (editable) | F05, C03 |
| `pw_addon_catalog` | Add-ons (editable) | F11, C03 |
| `pw_refund_policy` | Versioned refund % | C05 |
| `pw_settings` | Tunables (hold, GST, perk, surge, venue hours) | F08, F17, RP01 |
| `pw_bookings` | Bookings with snapshotted pricing | F07, F08, F11, C05 |
| `pw_booking_slots` | Slot-to-booking lines | F07 |
| `pw_booking_addons` | Add-on lines per booking | F11 |
| `pw_payments` | Razorpay references | F17 |
| `pw_ledger` | Minimal revenue/expense ledger | C07, F18, F19 |
| `pw_install_windows` | Scheduled install slots | F13 |
| `pw_checkins` | Pre-install checklist + condition photos | F14, F15 |
| `pw_qr_tokens` | HMAC-signed QR tokens | C06, F15, F26, F31 |
| `pw_visitors` | Walk-in registrations with consent | F26 |
| `pw_visits` | Visit sessions (for perk capping) | F21, RP01 |
| `pw_scans` | QR scan events (no IP) | F21 |
| `pw_perk_redemptions` | Coupon redemptions with bill tracking | RP01 |
| `pw_audit_log` | Append-only audit trail | All admin actions |
| `pw_reactions` | Aggregate reaction counts | F24 |
| `pw_feedback` | Post-exhibition surveys | F32 |
| `artworks` (extended) | Physical status + QR token | F09, F22 |

---

## Confirmed Gaps (Production vs Prototype)

| # | Feature | Gap | Severity |
|---|---------|-----|----------|
| 1 | F25 — Selfie UGC | Entirely missing in production | P0 |
| 2 | F30 — Community Gallery | Entirely missing in production | P0 |
| 3 | F28 — Full-Text Search | Meilisearch not implemented | P0 |
| 4 | F09 — Artwork Upload | No MIME/magic-byte, EXIF strip, re-encode | P1 |
| 5 | F10 — Waitlist | No notifications, no offer acceptance UI | P1 |
| 6 | F13 — Install windows | No venue-hours validation, 30-min slots, reminders | P1 |
| 7 | F17 — Payments | Webhook secret missing (per PRODUCTION_GAP_ANALYSIS) | P0 |
| 8 | F23 — Social Sharing | Not confirmed in production code | P2 |
| 9 | F29 — Confirmation graphic | Not confirmed in production code | P2 |
| 10 | F31 — DigiLocker | Verification workflow not confirmed | P2 |
| 11 | F32 — Feedback | No automatic invitation (no notification system) | P2 |

---

## Prototype-Only Features (Not in Production Physical Wall)

| Feature | Notes |
|---------|-------|
| Ric Platter counter surface (`PlatterSurface`) | Production has `perk.ts` actions but no dedicated counter UI page confirmed |
| Admin queue manager with tier display | Production has admin queue component but tier display not confirmed |
| Admin bookings table with advance/release | Production has `admin-bookings` component |
| Admin finance P&L panel | Production has ledger but auto-P&L not confirmed |
| Admin community moderation | Production lacks F25/F30 so moderation UI is moot |
| Admin audit log viewer | Production has `pw_audit_log` but viewer not confirmed |

---

## What the Prototype Does NOT Have (Production-Only)

| Feature | Notes |
|---------|-------|
| Server-side authorization (`requireRole`) | Prototype is client-side only |
| Transactional integrity (`inTransaction`) | Prototype is in-memory single-user |
| Optimistic locking (`version` columns) | Prototype has no concurrency |
| HMAC-signed QR tokens | Prototype uses deterministic hash visual only |
| Real Razorpay integration | Prototype simulates payment |
| Redis/queues | Not in prototype |
| Data retention/expiry | Prototype has no expiry jobs |
| Rate limiting | Prototype has no rate limiting |
| Consent withdrawal/erasure | Prototype has no withdrawal flow |
| ISR/caching | Prototype is SPA |

---

## Recommendations

1. **F25 + F30 are P0 blockers** — the prototype proves the UX; port the data models and moderation flow.
2. **F28 Meilisearch** — the prototype's client-side filter is fine for one wall; Meilisearch is needed for the full catalogue.
3. **F17 webhook secret** — already flagged in PRODUCTION_GAP_ANALYSIS.md; fix before any real payments.
4. **F09 image pipeline** — add MIME/magic-byte validation, EXIF stripping, and re-encoding before allowing uploads to S3/Cloudinary.
5. **Notification system** — F10, F13, F32 all depend on it. Add email/SMS queue before building per-feature workarounds.
6. **Prototype as spec supplement** — the JSX is an accurate behavioural spec for the missing features; use it as the reference when porting F25, F30, and the remaining admin surfaces.
