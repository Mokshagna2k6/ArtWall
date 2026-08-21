# ArtWall WMS — Production Audit

> **Date:** 22 August 2026
> **Auditor:** Senior Staff Engineer / Production Readiness Audit
> **Spec source:** `AWL/ENG/2026/WMS-SPEC-001` v1.0 — August 2026
> **Codebase:** `a:\All projects\ArtWall`

---

## 1. Executive Summary

The ArtWall WMS is a **substantial, well-architected implementation** of the core exhibition lifecycle. The domain logic is pure and testable, transactions are correctly used for all multi-step mutations, RBAC is server-enforced, and the DPDP consent model is thoughtfully designed.

**However, the application is NOT production-ready.** Critical gaps exist in:

1. **Secrets management** — Real production credentials are committed to the repository in `.env` (database URL, Better Auth secret, Google OAuth, Cloudinary, Razorpay test keys).
2. **Payment integrity** — `RAZORPAY_WEBHOOK_SECRET` is not set, so webhook signature verification always fails. The webhook also does not verify the payment amount matches the booking.
3. **Testing** — Only 4 unit test files exist. No integration, concurrency, security, or E2E tests.
4. **Infrastructure** — No CI/CD, no monitoring, no structured logging, no backups/DR, no staging environment.
5. **Missing features** — F25 (Selfie UGC), F28 (Full-Text Search), F30 (Community Gallery) are entirely missing. F27 (Live Carousel) is partial.
6. **Compliance** — No data retention jobs, no processor documentation, no incident response plan, no breach response workflow.
7. **Operational gaps** — No notification system, no audit log viewer, no grievance response inbox, no artist scan analytics, no offer acceptance UI.

---

## 2. Master Feature Audit Table

| ID | Feature | Current Status | Evidence | Missing | Risk | Priority | Required Change |
| -- | ------- | -------------- | -------- | ------- | ---- | -------- | --------------- |
| F01 | Dynamic Slot Grid Configuration | **COMPLETE** | `actions/grid.ts` → `resizeGrid`; `pw_grid_config` table with version locking; occupied-slot protection | None | Low | P2 | None |
| F02 | Visual Slot Map Editor | **COMPLETE** | `components/grid-editor.tsx`, `components/wall-grid.tsx` (edit mode); drag-and-drop with swap; optimistic locking; audit logging | None | Low | P2 | None |
| F03 | Slot Size Categories | **COMPLETE** | `pw_size_catalog` table; `actions/catalogs.ts` → `upsertSize`; pricing reads from catalog; size change blocked on occupied slots | None | Low | P2 | None |
| F04 | Slot Status Lifecycle | **COMPLETE** | `state-machine.ts` — 9 states, legal transitions, admin-only moves; `expiry.ts` for hold expiry | None | Low | P2 | None |
| F05 | Slot Types | **COMPLETE** | `pw_slot_types` table with multiplier_bp; `requires_grant` flag; pricing applies multiplier | Sponsored slot grant workflow not implemented (no admin grant UI) | Medium | P2 | Add admin grant workflow for sponsored slots |
| F06 | Calendar Availability | **COMPLETE** | `data/wall.ts` → `listAvailableSlotIds`; overlap detection in reservation transaction | No cache layer (spec assumes Redis) — acceptable at current scale | Low | P2 | None |
| F07 | Multi-Slot Booking | **COMPLETE** | `actions/booking.ts` → `reserveBooking`; `FOR UPDATE` row locks; all-or-nothing transaction; group discounts | None | Low | P2 | None |
| F08 | Duration Selection | **COMPLETE** | `pricing.ts` → `DURATION_TIERS`; booking end date; buffer validation | None | Low | P2 | None |
| F09 | Artwork Upload | **PARTIAL** | Cloudinary signed uploads; `isOwnAsset` validation; moderation via Cloudinary | No MIME/magic-byte validation server-side; no EXIF removal; no image re-encoding; no quarantine on processing failure; no thumbnails | Medium | P1 | Add server-side file validation, EXIF stripping, re-encoding, quarantine, thumbnails |
| F10 | Waitlist | **PARTIAL** | `actions/waitlist.ts` — join/leave/queue control/force-match; tier ordering | No notifications; no time-limited offer acceptance UI; no consent tracking for waitlist data; no retention job | Medium | P1 | Add offer acceptance UI, notifications, consent tracking, retention |
| F11 | Add-ons | **COMPLETE** | `pw_addon_catalog`; line items in booking; fulfillment status; refunds | None | Low | P2 | None |
| F12 | Admin Force Book / Force Release | **COMPLETE** | `actions/admin-slots.ts` — `transitionSlot`, `forceRelease`, `setSlotServiceState`; server-side auth; reason capture; audit trail; refund workflow; de-install task | None | Low | P2 | None |
| F13 | Installation Window Scheduling | **PARTIAL** | `actions/ops.ts` → `chooseInstallWindow`; agreement gate | No venue hours enforcement; no 30-minute window enforcement (uses 1 hour); no conflict prevention; no staff task creation; no reminders; no no-show handling; no auto-reschedule; no escalation | High | P1 | Add venue hours validation, conflict prevention, staff tasks, reminders, no-show handling |
| F14 | Pre-Installation Checklist | **PARTIAL** | `checklist.ts` — dynamic generation; `actions/ops.ts` → `updateChecklist` | No condition photo upload (column exists but no UI); failed items don't create condition/damage records | Medium | P1 | Add condition photo upload, damage record creation |
| F15 | Staff Check-in + QR Verification | **COMPLETE** | `actions/ops.ts` → `verifyAndGoLive`; signed QR tokens; 4-gate verification; audit logging | None | Low | P2 | None |
| F16 | Exhibition Calendar / Gantt | **COMPLETE** | `data/calendar.ts` → `getCalendar`; gap detection; waitlist suggestions | None | Low | P2 | None |
| F17 | Razorpay Payments | **PARTIAL** | `razorpay.ts` — order creation, webhook verification, refunds; `actions/payment.ts` — settleBooking | **`RAZORPAY_WEBHOOK_SECRET` not set in `.env`** — webhook verification always fails; no amount verification in webhook; no currency verification; no replay protection beyond event_id; no `partially_refunded` state | **CRITICAL** | **P0** | Set webhook secret; add amount/currency verification; add replay protection; add partial refund state |
| F18 | Revenue Dashboard | **PARTIAL** | `data/ledger.ts` — monthly summary, perk summary; admin overview page | No daily/weekly revenue breakdown; no slot-type revenue; no settlement-aware reporting; no chargeback tracking | Medium | P1 | Add revenue breakdowns, settlement tracking |
| F19 | Monthly P&L | **PARTIAL** | `data/ledger.ts` — monthly summary; CSV export | No locked periods; no formal adjustment records; no GST tracking; no commission/venue share tracking; no payment fees tracking | Medium | P1 | Add locked periods, adjustment records, GST tracking |
| F20 | Digital Exhibition Agreement | **COMPLETE** | `agreement.ts` — text generation, hashing; `actions/agreement.ts` → `signAgreement`; gates install scheduling and go-live | None | Low | P2 | None |
| F21 | QR/NFC Scan Tracking | **COMPLETE** | `actions/visitor.ts` → `recordScan`; no IP/user-agent stored; rate limiting; deduplication | No queue/async ingestion (synchronous insert); no demand aggregation | Low | P2 | Add async ingestion queue |
| F22 | Public Artwork Page | **COMPLETE** | `app/physical-wall/a/[id]/page.tsx`; SEO, OG, Schema.org VisualArtwork; archived pages; no private contact info | None | Low | P2 | None |
| F23 | Social Sharing | **PARTIAL** | `artwork-actions.tsx` — Web Share API | No WhatsApp/Instagram/X specific share; no copy-link fallback | Low | P2 | Add platform-specific share + copy-link |
| F24 | Reactions | **COMPLETE** | `actions/engagement.ts` → `react`; aggregate counts; rate limiting; no account required | None | Low | P2 | None |
| F25 | Selfie UGC | **MISSING** | No implementation | Entire feature missing: upload, validation, branded frame, moderation, approval/rejection, gallery, consent, withdrawal, CDN purge, minor handling, deletion | **High** | **P0** | Implement full UGC pipeline |
| F26 | Walk-in Visitor Registration | **COMPLETE** | `actions/visitor.ts` → `registerVisitor`; consent-first; separate marketing consent; 90-day expiry; withdrawal action | No withdrawal UI (action exists but no page) | Medium | P1 | Add withdrawal UI |
| F27 | Live Artwork Carousel | **PARTIAL** | `data/wall.ts` → `listLiveArtworks`; static feed on wall page | No real-time updates; no Socket.IO/WebSocket; no Redis fan-out; no fallback REST refresh; no ISR cold-load support | Medium | P1 | Add real-time updates |
| F28 | Full-Text Search | **MISSING** | No implementation | Entire feature missing: search artists/titles/mediums/cities/statements; filters; async indexing; search logs | **High** | **P0** | Implement full-text search |
| F29 | Booking Confirmation Graphic | **PARTIAL** | `booking-flow.tsx` → `BookingConfirmed` — static branded card | No async generation; no shareable image generation | Low | P2 | Add async graphic generation |
| F30 | Community Gallery | **MISSING** | No implementation | Entire feature missing: UGC moderation, pending/approved/rejected states, report/hide, takedown, withdrawal, CDN purge, moderation audit trail, public gallery | **High** | **P0** | Implement community gallery |
| F31 | Artist Registration | **PARTIAL** | `actions/account.ts` → `completeOnboarding`; consent gate; age declaration; nominee; erasure | No identity verification workflow; no payout blocking for unverified artists; no duplicate phone protection; no public-profile consent enforcement on artist page | Medium | P1 | Add identity verification, payout gating, phone dedup |
| F32 | Post-Exhibition Feedback | **PARTIAL** | `actions/engagement.ts` → `submitFeedback`; one response per booking | No automatic invitation; no capped reminders; no analytics aggregation | Medium | P1 | Add invitation/reminder system, analytics |

---

## 3. Security Audit

### 3.1 Critical Findings

| # | Finding | Severity | Evidence | Risk |
| -- | ------- | -------- | -------- | ---- |
| S1 | **Real production credentials committed to git** | **CRITICAL** | `.env` contains: `DATABASE_URL` (Neon), `BETTER_AUTH_SECRET`, `GOOGLE_CLIENT_ID/SECRET`, `CLOUDINARY_URL` (with API secret), `RAZORPAY_KEY_ID/SECRET` | Database compromise, auth bypass, payment fraud, data breach |
| S2 | **Razorpay webhook secret not set** | **CRITICAL** | `RAZORPAY_WEBHOOK_SECRET` absent from `.env`; `verifyWebhookSignature` returns `false` when secret missing | Payments cannot be confirmed via webhook; booking confirmation broken |
| S3 | **No webhook amount verification** | **HIGH** | `settleFromWebhook` doesn't verify `payment.amount` matches `booking.total_amount_paise` | Payment manipulation — a lower amount could confirm a booking |
| S4 | **No CSRF protection beyond Next.js defaults** | **MEDIUM** | Server actions rely on Next.js built-in CSRF protection; no explicit CSRF tokens | Potential CSRF on state-changing actions |
| S5 | **No 2FA for staff/admin accounts** | **MEDIUM** | Better Auth configured with email/password + Google only; no TOTP/2FA | Admin account compromise |
| S6 | **In-memory rate limiting only** | **MEDIUM** | `rate-limit.ts` uses in-process Map; ineffective on serverless/multi-instance | Rate-limit bypass |
| S7 | **No CSP/security headers** | **MEDIUM** | No `next.config.ts` headers configuration; no CSP | XSS, clickjacking |
| S8 | **No file upload validation** | **MEDIUM** | Cloudinary handles uploads but no server-side MIME/magic-byte validation; `isOwnAsset` checks host but not file content | Malicious file upload |
| S9 | **No SSRF protection on Cloudinary URL** | **LOW** | `isOwnAsset` validates hostname but doesn't prevent SSRF via Cloudinary URL manipulation | SSRF |
| S10 | **No dependency vulnerability scanning** | **MEDIUM** | No `npm audit`/`pnpm audit` in CI; no Dependabot | Known CVEs |
| S11 | **No secret scanning** | **MEDIUM** | No secret scanning in CI; `.env` committed | Secret exposure |
| S12 | **No session revocation on role change** | **LOW** | Role read fresh from DB per request (good), but no explicit session revocation | Stale sessions |

### 3.2 Security Strengths

- Server-side authorization on every write action (`requireRole`)
- Default-deny RBAC with 4 roles
- Transactional integrity with `FOR UPDATE` row locks
- QR tokens are HMAC-signed, revocable, and contain no personal data
- Webhook signature verification (when secret is set)
- No card data stored — Razorpay is PCI-scoped
- Money stored as integer paise
- Audit logging on all sensitive operations
- Consent records with purpose, version, timestamp, withdrawal
- No IP/user-agent stored against scans
- `server-only` imports prevent client bundle leakage
- Cloudinary signed uploads (no unsigned presets)

---

## 4. Database Audit

### 4.1 Schema Quality

| Aspect | Status | Notes |
| ------ | ------ | ----- |
| Foreign keys | ✅ | All relationships have FKs with appropriate `ON DELETE` behavior |
| Unique constraints | ✅ | Email, handle, grid cell, booking-slot, event_id, source_ref, one-per-visit/booking |
| Check constraints | ✅ | State enums, money >= 0, date ranges, role values |
| Indexes | ✅ | All query paths have supporting indexes |
| Transactions | ✅ | `inTransaction` helper with proper rollback |
| Row locking | ✅ | `FOR UPDATE` on critical paths |
| Optimistic locking | ✅ | `version` column on slots and grid config |
| Money handling | ✅ | Integer paise throughout |
| Audit records | ✅ | `pw_audit_log` append-only |
| Soft deletion | ⚠️ | Used where appropriate (waitlist status, consent withdrawal) but not consistently |
| Immutable financial records | ⚠️ | Ledger entries are append-only via `source_ref` unique, but manual entries can be edited |
| Migration safety | ⚠️ | Migrations are idempotent but no expand-and-contract strategy; no rollback strategy |

### 4.2 Missing Database Features

- No `pw_ugc_submissions` table (F25/F30)
- No `pw_notifications` table
- No `pw_search_index` table (F28)
- No `pw_identity_verifications` table (F31)
- No `pw_retention_jobs` tracking
- No `pw_processor_agreements` documentation table
- No `pw_incident_reports` table

---

## 5. Authentication & RBAC Audit

| Role | Exists | Server-Enforced | Notes |
| ---- | ------ | --------------- | ----- |
| Visitor | ✅ | ✅ | No account needed for scans/reactions |
| Artist | ✅ | ✅ | `requireRole("artist")` on all artist actions |
| Staff | ✅ | ✅ | `requireRole("staff")` on ops actions |
| Admin | ✅ | ✅ | `requireRole("admin")` on all admin actions |
| Owner/System | ❌ | ❌ | No system-level role; admin is highest |

**Permission Matrix:**

| Action | Visitor | Artist | Staff | Admin |
| ------ | ------- | ------ | ----- | ----- |
| Browse wall | ✅ | ✅ | ✅ | ✅ |
| Scan artwork | ✅ | ✅ | ✅ | ✅ |
| React to artwork | ✅ | ✅ | ✅ | ✅ |
| Register as visitor | ✅ | ✅ | ✅ | ✅ |
| Join waitlist | ❌ | ✅ | ✅ | ✅ |
| Book slots | ❌ | ✅ | ✅ | ✅ |
| Sign agreement | ❌ | ✅ | ✅ | ✅ |
| Schedule install | ❌ | ✅ | ✅ | ✅ |
| Cancel booking | ❌ | ✅ | ✅ | ✅ |
| Submit feedback | ❌ | ✅ | ✅ | ✅ |
| Export my data | ❌ | ✅ | ✅ | ✅ |
| Erase my data | ❌ | ✅ | ✅ | ✅ |
| Raise grievance | ❌ | ✅ | ✅ | ✅ |
| Receive artwork | ❌ | ❌ | ✅ | ✅ |
| Verify QR / go-live | ❌ | ❌ | ✅ | ✅ |
| Redeem perk | ❌ | ❌ | ✅ | ✅ |
| Force slot transition | ❌ | ❌ | ❌ | ✅ |
| Force release | ❌ | ❌ | ❌ | ✅ |
| Edit grid | ❌ | ❌ | ❌ | ✅ |
| Edit catalogs | ❌ | ❌ | ❌ | ✅ |
| Manage queue | ❌ | ❌ | ❌ | ✅ |
| Mark booking paid | ❌ | ❌ | ❌ | ✅ |
| View ledger | ❌ | ❌ | ❌ | ✅ |
| View audit log | ❌ | ❌ | ❌ | ❌ (no UI) |

**Gaps:**
- No 2FA for staff/admin
- No audit log viewer (admin can't browse audit entries)
- No grievance response inbox (admin can't respond to grievances)
- No identity verification workflow

---

## 6. Payment Audit

| Aspect | Status | Notes |
| ------ | ------ | ----- |
| Order creation | ✅ | `createOrder` in `razorpay.ts` |
| Webhook verification | ❌ | `RAZORPAY_WEBHOOK_SECRET` not set |
| Webhook idempotency | ✅ | `event_id` unique on `pw_payments` |
| Webhook replay safety | ⚠️ | `event_id` handles duplicates but no replay window |
| Amount verification | ❌ | Webhook doesn't verify amount matches booking |
| Currency verification | ❌ | No currency check |
| Payment state machine | ⚠️ | `created/captured/failed/refunded/manual` — no `partially_refunded` |
| Refund workflow | ✅ | `createRefund` in `razorpay.ts`; policy-versioned |
| Ledger integration | ✅ | `source_ref` unique prevents double-counting |
| Client-side trust | ✅ | Booking only confirmed via verified webhook or admin manual action |
| Card data storage | ✅ | Never stored — Razorpay is PCI-scoped |

---

## 7. Compliance Audit

### 7.1 DPDP Act 2023

| Requirement | Status | Notes |
| ----------- | ------ | ----- |
| Consent records | ✅ | `pw_consents` with purpose, version, timestamp, withdrawal |
| Specific consent | ✅ | Per-purpose consent |
| Informed consent | ✅ | Plain-language notices in `consent.ts` |
| Affirmative consent | ✅ | Checkbox-based, no pre-ticked |
| Purpose-limited | ✅ | Each purpose has defined scope |
| Withdrawable | ✅ | One-click withdrawal |
| Marketing consent unbundled | ✅ | Separate from account consent |
| Data access/export | ✅ | `exportMyData` action |
| Correction | ⚠️ | No explicit correction workflow (profile edit exists but not formalized) |
| Erasure | ✅ | `eraseMyData` action with anonymisation |
| Grievance | ✅ | `raiseGrievance` action; 30-day response clock |
| Nomination | ✅ | `setNominee` action |
| Children's data | ⚠️ | Age declaration exists; no parental consent workflow |
| Retention | ❌ | No retention/deletion jobs implemented |
| Processor documentation | ❌ | No processor relationships documented |
| Breach response | ❌ | No incident response plan |
| Data fiduciary registration | ❌ | Not verified |

### 7.2 GST / Tax

| Requirement | Status | Notes |
| ----------- | ------ | ----- |
| GST rate | ✅ | Configurable in `pw_settings` |
| GST calculation | ✅ | `applyBp` in pricing |
| GST invoice | ❌ | No invoice generation |
| HSN/SAC | ❌ | Not configured |
| Place of supply | ❌ | Not configured |
| Tax split | ❌ | Not configured |
| GSTIN | ⚠️ | Hardcoded in `agreement.ts` |
| Refunds | ✅ | Policy-versioned refunds |
| TDS/TCS | ❌ | Not configured |
| Accounting ledger | ⚠️ | Manual ledger only; no Tally/Zoho integration |

### 7.3 IT Act / E-Sign

| Requirement | Status | Notes |
| ----------- | ------ | ----- |
| E-signature | ✅ | Typed name + agreement hash |
| IT Act s.6 | ✅ | Referenced in agreement text |
| Immutable signed copy | ✅ | Body + SHA-256 hash stored |

### 7.4 IP & Content

| Requirement | Status | Notes |
| ----------- | ------ | ----- |
| Artist retains copyright | ✅ | Agreement states this explicitly |
| Limited licence | ✅ | Agreement grants display/marketing licence only |
| Content ownership metadata | ⚠️ | Artwork table has basic metadata; no formal ownership record |
| Infringement reporting | ❌ | No workflow |
| Takedown | ⚠️ | Admin can hide tiles; no formal takedown workflow |
| Evidence/audit trail | ✅ | Audit log covers moderation actions |

---

## 8. Infrastructure Audit

| Aspect | Status | Notes |
| ------ | ------ | ----- |
| Environments | ❌ | No staging environment; only local + production (Vercel) |
| CI/CD | ❌ | No GitHub Actions; no automated pipeline |
| Database | ✅ | Neon PostgreSQL with pooling |
| Redis | ❌ | Not used |
| Queues | ❌ | Not used |
| Realtime | ❌ | No Socket.IO/WebSocket |
| Backups | ❌ | No documented backup strategy |
| DR | ❌ | No disaster recovery plan |
| Monitoring | ❌ | No metrics, tracing, or alerting |
| Structured logging | ❌ | `console.error` only |
| Error tracking | ❌ | No Sentry/ErrorBoundary integration |
| Rate limiting | ⚠️ | In-memory only |
| CDN | ✅ | Cloudinary for images; Vercel CDN for static |
| Deployment | ⚠️ | Vercel auto-deploy; no tagged releases |
| Rollback | ❌ | No rollback strategy |
| Load testing | ❌ | Not performed |
| Performance testing | ❌ | Not performed |

---

## 9. Testing Audit

| Test Type | Status | Files | Coverage |
| --------- | ------ | ----- | -------- |
| Unit tests | ⚠️ | 4 files | `money.test.ts`, `pricing.test.ts`, `qr.test.ts`, `state-machine.test.ts` |
| Integration tests | ❌ | 0 | None |
| Concurrency tests | ❌ | 0 | No proof of no-double-booking |
| Security tests | ❌ | 0 | No IDOR/auth/upload/XSS tests |
| E2E tests | ❌ | 0 | None |
| Accessibility tests | ❌ | 0 | None |
| Performance tests | ❌ | 0 | None |

---

## 10. Observability Audit

| Aspect | Status | Notes |
| ------ | ------ | ----- |
| Structured logs | ❌ | `console.error` only; no correlation IDs |
| Metrics | ❌ | No API availability, booking success, payment success, webhook lag, queue lag, error rate, DB health, cache health |
| Tracing | ❌ | No booking → payment → webhook → agreement → confirmation trace |
| Error tracking | ❌ | No release/version, environment, stack trace, correlation ID capture |

---

## 11. Accessibility Audit

| Aspect | Status | Notes |
| ------ | ------ | ----- |
| Keyboard navigation | ⚠️ | Wall grid editor has keyboard support; other components not verified |
| Focus states | ⚠️ | Not systematically verified |
| Semantic HTML | ⚠️ | Some components use divs where semantic elements would be better |
| Screen readers | ⚠️ | Not tested |
| Labels | ⚠️ | Form components have labels; not all verified |
| Form errors | ✅ | `FormStatus` component shows errors |
| Contrast | ⚠️ | Not verified |
| Alt text | ⚠️ | Artwork images have alt; not all images verified |
| Reduced motion | ⚠️ | Not verified |
| Dialogs | ⚠️ | Slot modal exists; not verified for accessibility |
| Tables | ⚠️ | Admin tables not verified |
| Touch targets | ⚠️ | Not verified |

---

## 12. Performance Audit

| Aspect | Status | Notes |
| ------ | ------ | ----- |
| Core Web Vitals | ❌ | Not measured |
| Bundle size | ❌ | Not measured |
| Image optimization | ✅ | Next.js Image + Cloudinary |
| Lazy loading | ⚠️ | Not systematically applied |
| Caching | ⚠️ | ISR on wall page; no Redis |
| N+1 queries | ⚠️ | `listAllBookings` uses batched queries; other paths not verified |
| API latency | ❌ | Not measured |
| Search latency | ❌ | No search |
| Page rendering | ⚠️ | Not measured |
| CDN behavior | ⚠️ | Vercel CDN; not verified |
| Realtime connections | ❌ | No realtime |

---

## 13. Feature × Compliance Traceability

| Feature | DPDP | GST | IT Act | IP | Accessibility | Security |
| ------- | ---- | --- | ------ | -- | ------------- | -------- |
| F01-F12 | ⚠️ | ✅ | — | — | ⚠️ | ✅ |
| F13-F16 | ⚠️ | — | — | — | ⚠️ | ✅ |
| F17-F20 | ⚠️ | ⚠️ | ✅ | ✅ | ⚠️ | ⚠️ |
| F21-F26 | ✅ | — | — | — | ⚠️ | ✅ |
| F27-F30 | ⚠️ | — | — | ⚠️ | ⚠️ | ⚠️ |
| F31-F32 | ✅ | — | — | — | ⚠️ | ✅ |

---

## 14. Production Blockers

### P0 — Launch Blockers

1. ~~**Secrets committed to git**~~ — **RESOLVED**: `.env` is gitignored and not tracked. However, credentials are still in `.env` which should be moved to proper environment variable management for production.
2. **Razorpay webhook secret missing** — `RAZORPAY_WEBHOOK_SECRET` must be set; webhook verification is currently broken.
3. **No webhook amount verification** — Payment amount must be verified against booking total.
4. **F25 (Selfie UGC) missing** — Entire feature absent.
5. **F28 (Full-Text Search) missing** — Entire feature absent.
6. **F30 (Community Gallery) missing** — Entire feature absent.
7. **No integration/concurrency/security tests** — Cannot prove correctness under load or attack.

### P1 — Critical Production Functionality

8. **No notification system** — Artists never notified of offers, install windows, hold expiry, survey invites.
9. **No audit log viewer** — Admin cannot browse audit entries.
10. **No grievance response inbox** — Grievances filed but cannot be responded to.
11. **No artist scan analytics** — Artists cannot see their own scan data.
12. **No offer acceptance UI** — Waitlist force-match creates offers but artists cannot accept them.
13. **No condition photo upload** — Checklist item exists but no upload mechanism.
14. **No visitor withdrawal UI** — Consent withdrawal action exists but no page.
15. **No data retention jobs** — Personal data lives forever.
16. **No CI/CD** — No automated testing, linting, or deployment pipeline.
17. **No monitoring/observability** — No metrics, tracing, or structured logging.
18. **No backups/DR** — No documented backup or recovery strategy.
19. **No identity verification** — Artists cannot be verified for payouts.
20. **No GST invoice generation** — No actual invoices produced.

---

## 15. Recommended Remediation Order

### Phase 0 — Critical Blockers (P0)
1. Remove `.env` from git; rotate all credentials; move to environment variables
2. Set `RAZORPAY_WEBHOOK_SECRET`; add amount/currency verification to webhook
3. Add integration tests for booking, payment, webhook, refund
4. Add concurrency test proving no double-booking
5. Add security tests (IDOR, auth, upload, XSS, injection, webhook forgery)

### Phase 1 — Core Business Engine
6. Add notification system (email/SMS queue)
7. Add audit log viewer
8. Add grievance response inbox
9. Add artist scan analytics dashboard
10. Add offer acceptance UI
11. Add condition photo upload
12. Add visitor withdrawal UI

### Phase 2 — Exhibition Operations
13. Add venue hours validation, conflict prevention, staff tasks, reminders, no-show handling for install windows
14. Add damage record creation for failed checklist items

### Phase 3 — Payments/Commercial
15. Add GST invoice generation with HSN/SAC, place of supply, tax split
16. Add locked periods and adjustment records for P&L
17. Add settlement-aware reporting

### Phase 4 — Visitor/Discovery
18. Implement F25 (Selfie UGC) — full pipeline
19. Implement F28 (Full-Text Search)
20. Implement F30 (Community Gallery)
21. Add real-time updates for F27 (Live Carousel)
22. Add platform-specific social sharing + copy-link

### Phase 5 — Compliance
23. Implement data retention/deletion jobs
24. Document processor relationships
25. Create incident response plan
26. Add identity verification workflow
27. Add parental consent workflow for minors

### Phase 6 — Infrastructure
28. Set up CI/CD (GitHub Actions)
29. Add monitoring/observability (structured logs, metrics, tracing, error tracking)
30. Set up backups/DR
31. Add security headers/CSP
32. Add 2FA for staff/admin
33. Add dependency vulnerability scanning
34. Add secret scanning

### Phase 7 — Final Production Certification
35. Full regression testing
36. E2E tests for all user journeys
37. Accessibility testing
38. Performance testing
39. Security testing
40. Deployment verification