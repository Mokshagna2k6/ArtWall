# ArtWall WMS — Final Production Readiness

> **Date:** 22 August 2026
> **Spec source:** `AWL/ENG/2026/WMS-SPEC-001` v1.0 — August 2026
> **Companion documents:** `PRODUCTION_AUDIT.md`, `PRODUCTION_GAP_ANALYSIS.md`

---

## Overall Status

# **NOT READY**

The application is **architecturally sound and functionally deep** — the core exhibition lifecycle (slots, booking, payments, agreements, check-in, visitor engagement) is genuinely implemented with server-enforced authorization, transactional integrity, and audit trails. Phase 0 critical fixes are complete and verified.

However, launch is blocked by **three entirely missing features (F25, F28, F30)**, **one external credential dependency** (`RAZORPAY_WEBHOOK_SECRET`), and the absence of production infrastructure (CI/CD, monitoring, backups/DR).

---

## Feature Score (F01–F32)

| ID | Feature | Status | Verified By |
| -- | ------- | ------ | ----------- |
| F01 | Dynamic Slot Grid Configuration | ✅ COMPLETE | Code review: version locking, occupied-slot protection |
| F02 | Visual Slot Map Editor | ✅ COMPLETE | Code review: drag-and-drop swap, atomic update, audit |
| F03 | Slot Size Categories | ✅ COMPLETE | Code review: catalog-driven pricing, no retroactive change |
| F04 | Slot Status Lifecycle | ✅ COMPLETE | 27 state-machine unit tests passing |
| F05 | Slot Types | ✅ COMPLETE | Multiplier pricing tests; sponsored grant UI missing (P2) |
| F06 | Calendar Availability | ✅ COMPLETE | Overlap detection inside reservation transaction |
| F07 | Multi-Slot Booking | ✅ COMPLETE | Concurrency test: 50 parallel attempts → exactly 1 success |
| F08 | Duration Selection | ✅ COMPLETE | Pricing discount curve unit tests |
| F09 | Artwork Upload | ⚠️ PARTIAL | Cloudinary signed uploads; missing MIME/magic-byte validation, EXIF removal, re-encoding, quarantine |
| F10 | Waitlist | ⚠️ PARTIAL | Queue + tier ordering work; notifications, offer acceptance UI, retention missing |
| F11 | Add-ons | ✅ COMPLETE | Line items, fulfillment status, line-item refunds |
| F12 | Admin Force Book / Force Release | ✅ COMPLETE | Server-side auth, reason capture, before/after audit trail |
| F13 | Installation Window Scheduling | ⚠️ PARTIAL | Booking linkage works; venue hours, conflicts, reminders, no-show handling missing |
| F14 | Pre-Installation Checklist | ⚠️ PARTIAL | Dynamic generation works; condition photo upload + damage records missing |
| F15 | Staff Check-in + QR Verification | ✅ COMPLETE | Signed tokens; tamper/wrong-secret rejection tested |
| F16 | Exhibition Calendar / Gantt | ✅ COMPLETE | Gap detection, waitlist suggestions |
| F17 | Razorpay Payments | ⚠️ PARTIAL | Order creation, HMAC verification, idempotency, amount verification all implemented and tested. **Blocked on `RAZORPAY_WEBHOOK_SECRET` config (external).** Currency check + partial refund state missing. |
| F18 | Revenue Dashboard | ⚠️ PARTIAL | Monthly summary exists; daily/weekly/slot-type breakdowns missing |
| F19 | Monthly P&L | ⚠️ PARTIAL | Summary + CSV export; locked periods, adjustments, GST tracking missing |
| F20 | Digital Exhibition Agreement | ✅ COMPLETE | Template hashing, e-signature, immutable copy, go-live gate |
| F21 | QR/NFC Scan Tracking | ✅ COMPLETE | Anonymous-by-default, rate-limited, deduplicated |
| F22 | Public Artwork Page | ✅ COMPLETE | SEO, OG, Schema.org VisualArtwork, archived pages |
| F23 | Social Sharing | ⚠️ PARTIAL | Web Share API only; platform-specific share + copy-link fallback missing |
| F24 | Reactions | ✅ COMPLETE | Rate limiting, deduplication, aggregate counters |
| F25 | Selfie UGC | ❌ MISSING | Not implemented |
| F26 | Walk-in Visitor Registration | ✅ COMPLETE | Consent-first, separate marketing consent, withdrawal action |
| F27 | Live Artwork Carousel | ⚠️ PARTIAL | Static feed only; no realtime updates |
| F28 | Full-Text Search | ❌ MISSING | Not implemented |
| F29 | Booking Confirmation Graphic | ⚠️ PARTIAL | Static branded card; async generation missing |
| F30 | Community Gallery | ❌ MISSING | Not implemented |
| F31 | Artist Registration | ⚠️ PARTIAL | Onboarding + consent + erasure work; identity verification + payout gating missing |
| F32 | Post-Exhibition Feedback | ⚠️ PARTIAL | Submission works; invitations, reminders, analytics missing |

**Score: 17 COMPLETE / 13 PARTIAL / 3 MISSING (of 32)**

---

## Critical Issues

### P0 — Launch Blockers

| # | Issue | Type | Resolution Path |
| - | ----- | ---- | --------------- |
| 1 | `RAZORPAY_WEBHOOK_SECRET` not configured | External dependency | Create webhook in Razorpay dashboard; set secret in Vercel env vars. Code path already verified by tests. |
| 2 | F25 Selfie UGC missing | Missing feature | Full pipeline: upload → validation → frame → moderation → gallery |
| 3 | F28 Full-Text Search missing | Missing feature | Postgres full-text search over artists/titles/mediums/cities/statements |
| 4 | F30 Community Gallery missing | Missing feature | UGC moderation states, report/hide/takedown, public gallery |
| 5 | Secrets in `.env` need rotation + proper management | Operational | Rotate all credentials; move to Vercel env vars / secret manager |

### P1 — Critical Production Functionality

Notification system · audit log viewer · grievance response inbox · artist scan analytics · offer acceptance UI · condition photo upload · visitor withdrawal UI · data retention jobs · CI/CD · monitoring/observability · backups/DR · identity verification · GST invoice generation.

---

## Security Status

### Passed ✅

- Server-side authorization on every write action (`requireRole`, default-deny)
- RBAC hierarchy enforced and unit-tested (artist < staff < admin)
- Webhook signature verification enforced; forgery/null/empty rejection tested
- Payment amount verification (`PreconditionError(422)` on mismatch) — Phase 0 fix
- Webhook idempotency via unique `event_id`; ledger dedup via unique `source_ref`
- QR tokens HMAC-signed; tampering and wrong-secret rejection tested
- No card data stored (Razorpay PCI-scoped); money as integer paise
- CSP + security headers (X-Frame-Options, nosniff, Referrer-Policy, Permissions-Policy, HSTS) — Phase 0 fix
- Audit logging on all sensitive operations; append-only `pw_audit_log`
- No IP/user-agent stored against scans; consent records with purpose/version/timestamp/withdrawal
- `server-only` imports prevent client bundle leakage
- Transactional integrity with `FOR UPDATE` row locks; double-booking proven impossible by test

### Open Findings ⚠️

| # | Finding | Severity |
| - | ------- | -------- |
| S2 | `RAZORPAY_WEBHOOK_SECRET` not configured in env | CRITICAL (external) |
| S4 | CSRF relies on Next.js defaults only | MEDIUM |
| S5 | No 2FA for staff/admin | MEDIUM |
| S6 | In-memory rate limiting (ineffective multi-instance) | MEDIUM |
| S8 | No server-side file content validation on uploads | MEDIUM |
| S10/S11 | No dependency vulnerability or secret scanning in CI | MEDIUM |

---

## Compliance Status

| Area | Status | Notes |
| ---- | ------ | ----- |
| DPDP consent records | ✅ Implemented | Purpose, version, timestamp, withdrawal, source |
| Data principal rights | ✅ Mostly implemented | Export, erasure, grievance, nomination built as product workflows |
| Marketing consent separation | ✅ Implemented | Never bundled with essential consent |
| Children's data | ⚠️ Partial | Age declaration exists; parental consent workflow missing |
| Retention/deletion jobs | ❌ Missing | Documented in DATA_RETENTION.md but not automated |
| Processor documentation | ❌ Missing | PROCESSORS.md drafted; formal DPAs not executed |
| Breach response | ❌ Missing | INCIDENT_RESPONSE.md drafted; not operationalized |
| GST invoicing | ❌ Missing | Rate calculation works; invoice generation does not exist |
| E-signature (IT Act) | ✅ Implemented | Typed signature + SHA-256 hash, immutable copy |
| IP/licence terms | ✅ Implemented | Artist retains copyright; display licence only |

**External legal dependencies:** DPA execution with processors, data fiduciary registration status, TDS/TCS applicability, GSTIN configuration — require counsel/accountant confirmation.

---

## Infrastructure Status

| Area | Status |
| ---- | ------ |
| Environments (local/staging/prod) | ❌ No staging |
| CI/CD | ❌ None |
| Monitoring/metrics/tracing | ❌ None |
| Structured logging | ❌ console.error only |
| Error tracking | ❌ None |
| Backups/PITR | ❌ Unverified (Neon has PITR but unconfigured/untested) |
| DR plan/RPO/RTO | ❌ Undocumented |
| Redis/cache | ❌ Not used (acceptable at current scale) |
| Queues/workers | ❌ Not used |
| Realtime | ❌ Not used |
| CDN | ✅ Cloudinary + Vercel |
| Database integrity | ✅ FKs, constraints, indexes, transactions, row locks, optimistic locking |

---

## Testing Status

```
Test Files   6 passed (6)
Tests        98 passed (98)
Duration     ~2.5s
Typecheck    PASS (tsc --noEmit, zero errors)
Build        PASS (all routes compiled)
```

| Suite | Count | What it proves |
| ----- | ----- | -------------- |
| money.test.ts | 24 | Paise arithmetic, basis-point application, INR formatting |
| pricing.test.ts | 26 | Duration curve, group discounts, surge, GST, refunds |
| state-machine.test.ts | 27 | All legal/illegal slot transitions, admin-only moves |
| qr.test.ts | 10 | Token minting, verification, tampering, expiry |
| security.test.ts | 10 | Webhook forgery, null/empty signatures, wrong-secret, RBAC ranks |
| concurrency.test.ts | 1 | **50 parallel bookings on one slot → exactly 1 success, 49 clean failures** |

Missing: integration tests against a real database, E2E journeys, accessibility audits, load testing.

---

## Remaining Blockers

Only genuine blockers:

1. **`RAZORPAY_WEBHOOK_SECRET`** — external credential from Razorpay dashboard.
2. **F25 / F28 / F30 implementation** — three features must be built.
3. **Credential rotation** — all secrets currently in `.env` must be rotated and moved to managed env vars.
4. **Staging environment** — required for migration safety and pre-launch verification.

Everything else (P1 list) is important but can proceed in parallel after launch-critical items.

---

## Deployment Checklist

Before production launch:

### Credentials & Config
- [ ] Rotate every secret currently in `.env`
- [ ] Move all secrets to Vercel environment variables (server-only; never `NEXT_PUBLIC_`)
- [ ] Create Razorpay webhook endpoint; set `RAZORPAY_WEBHOOK_SECRET`
- [ ] Verify `NEXT_PUBLIC_RAZORPAY_KEY_ID` matches live mode keys
- [ ] Set `ADMIN_EMAILS` allowlist for founder admin bootstrap
- [ ] Configure Cloudinary production cloud + signed upload preset

### Database
- [ ] Run migrations against staging first; verify row counts preserved
- [ ] Enable Neon PITR; document RPO/RTO; perform one restore test
- [ ] Confirm connection pooling limits for expected traffic

### Verification Gates
- [ ] `pnpm test` green (98/98)
- [ ] `pnpm typecheck` green
- [ ] `pnpm build` green
- [ ] Manual smoke: register → book → pay (test mode) → webhook settles → agreement signs → staff check-in → go-live
- [ ] Verify security headers present on deployed responses
- [ ] Verify webhook rejects a forged signature in staging

### Post-Launch (first week)
- [ ] Monitor payment success rate and webhook lag manually until observability lands
- [ ] Watch `pw_audit_log` for unexpected force actions
- [ ] Confirm hold-expiry releases lapsed reservations

---

## Verdict

The codebase is honest about what it does — there is no fake success messaging, no client-trusted payment confirmation, and no frontend-only authorization. The remaining work is well-scoped: three missing features, one external credential, and standard production infrastructure. With those closed, this system is fit for real artists paying real money.