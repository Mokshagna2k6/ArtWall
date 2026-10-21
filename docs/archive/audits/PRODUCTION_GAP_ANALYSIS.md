# ArtWall WMS — Production Gap Analysis

> **Date:** 22 August 2026
> **Spec source:** `AWL/ENG/2026/WMS-SPEC-001` v1.0 — August 2026
> **Companion document:** `PRODUCTION_AUDIT.md`

---

## 1. Executive Summary

The ArtWall WMS is a **well-engineered foundation** with strong domain modeling, transactional integrity, and DPDP-aware consent design. The core exhibition lifecycle (grid → booking → payment → install → go-live → analytics) is implemented end-to-end with server-side authorization and audit logging.

**However, the system is NOT production-ready.** The most critical issues are:

1. **Secrets exposure** — Real production credentials are committed to the repository.
2. **Payment webhook broken** — `RAZORPAY_WEBHOOK_SECRET` is not set, so no payment can be confirmed via webhook.
3. **Three entire features missing** — F25 (Selfie UGC), F28 (Full-Text Search), F30 (Community Gallery).
4. **No integration/concurrency/security tests** — Cannot prove correctness under load or attack.
5. **No CI/CD, monitoring, backups, or DR** — No production infrastructure.
6. **No notification system** — Artists never receive offers, reminders, or survey invites.
7. **No data retention jobs** — Personal data lives forever.

**Overall readiness: NOT READY**

---

## 2. Architecture Assessment

### 2.1 Strengths

- **Next.js 16 App Router** with server actions for all mutations
- **PostgreSQL (Neon)** with proper transactions, row locking, and constraints
- **Drizzle ORM** for schema definition; raw SQL for complex queries
- **Better Auth** for authentication with email/password + Google OAuth
- **RBAC** with 4 roles, server-enforced on every write
- **Pure domain modules** (`pricing.ts`, `state-machine.ts`, `checklist.ts`, `agreement.ts`, `qr.ts`, `money.ts`) — testable and DB-free
- **Cloudinary** for signed direct uploads
- **Razorpay** for payments with webhook verification
- **ISR** for public wall pages
- **Feature flags** for staged rollout

### 2.2 Weaknesses

- **No staging environment** — only local + production
- **No CI/CD pipeline** — no automated testing, linting, or deployment
- **No Redis/queues** — no caching, no async processing, no realtime
- **No monitoring/observability** — no metrics, tracing, or structured logging
- **No backups/DR** — no documented recovery strategy
- **No error tracking** — no Sentry or equivalent
- **In-memory rate limiting** — ineffective on serverless
- **No security headers/CSP** — no `next.config.ts` headers
- **No 2FA** for staff/admin accounts

---

## 3. Feature Audit

### 3.1 Complete (18/32)

| Feature | Status |
| ------- | ------ |
| F01 — Dynamic Slot Grid Configuration | ✅ COMPLETE |
| F02 — Visual Slot Map Editor | ✅ COMPLETE |
| F03 — Slot Size Categories | ✅ COMPLETE |
| F04 — Slot Status Lifecycle | ✅ COMPLETE |
| F05 — Slot Types | ✅ COMPLETE |
| F06 — Calendar Availability | ✅ COMPLETE |
| F07 — Multi-Slot Booking | ✅ COMPLETE |
| F08 — Duration Selection | ✅ COMPLETE |
| F11 — Add-ons | ✅ COMPLETE |
| F12 — Admin Force Book / Force Release | ✅ COMPLETE |
| F15 — Staff Check-in + QR Verification | ✅ COMPLETE |
| F16 — Exhibition Calendar / Gantt | ✅ COMPLETE |
| F20 — Digital Exhibition Agreement | ✅ COMPLETE |
| F21 — QR/NFC Scan Tracking | ✅ COMPLETE |
| F22 — Public Artwork Page | ✅ COMPLETE |
| F24 — Reactions | ✅ COMPLETE |
| F26 — Walk-in Visitor Registration | ✅ COMPLETE |
| F31 — Artist Registration | ✅ COMPLETE (core) |

### 3.2 Partial (9/32)

| Feature | Missing |
| ------- | ------- |
| F09 — Artwork Upload | No MIME/magic-byte validation, EXIF removal, re-encoding, quarantine, thumbnails |
| F10 — Waitlist | No notifications, offer acceptance UI, consent tracking, retention |
| F13 — Installation Window Scheduling | No venue hours, 30-min windows, conflict prevention, staff tasks, reminders, no-show handling |
| F14 — Pre-Installation Checklist | No condition photo upload, damage records |
| F17 — Razorpay Payments | Webhook secret missing, no amount verification, no partial refund state |
| F18 — Revenue Dashboard | No daily/weekly breakdown, slot-type revenue, settlement tracking |
| F19 — Monthly P&L | No locked periods, adjustment records, GST tracking |
| F23 — Social Sharing | No platform-specific share, no copy-link fallback |
| F27 — Live Artwork Carousel | No real-time updates |
| F29 — Booking Confirmation Graphic | No async generation |
| F32 — Post-Exhibition Feedback | No automatic invitation, reminders, analytics |

### 3.3 Missing (3/32)

| Feature | Status |
| ------- | ------ |
| F25 — Selfie UGC | ❌ MISSING |
| F28 — Full-Text Search | ❌ MISSING |
| F30 — Community Gallery | ❌ MISSING |

---

## 4. Security Audit

### 4.1 Critical Findings

| # | Finding | Severity | Impact |
| -- | ------- | -------- | ------ |
| S1 | Real credentials in `.env` committed to git | **CRITICAL** | Database compromise, auth bypass, payment fraud |
| S2 | `RAZORPAY_WEBHOOK_SECRET` not set | **CRITICAL** | Payments cannot be confirmed via webhook |
| S3 | No webhook amount verification | **HIGH** | Payment manipulation |
| S4 | No 2FA for staff/admin | **MEDIUM** | Admin account compromise |
| S5 | In-memory rate limiting | **MEDIUM** | Rate-limit bypass on serverless |
| S6 | No CSP/security headers | **MEDIUM** | XSS, clickjacking |
| S7 | No file upload validation | **MEDIUM** | Malicious file upload |
| S8 | No dependency vulnerability scanning | **MEDIUM** | Known CVEs |
| S9 | No secret scanning | **MEDIUM** | Secret exposure |

### 4.2 Security Strengths

- Server-side authorization on every write
- Default-deny RBAC
- Transactional integrity with row locks
- HMAC-signed QR tokens
- Webhook signature verification (when configured)
- No card data stored
- Integer paise money handling
- Audit logging on sensitive operations
- Consent records with purpose/version/timestamp/withdrawal
- No IP/user-agent stored against scans
- `server-only` imports prevent client bundle leakage

---

## 5. Database Audit

### 5.1 Schema Quality

| Aspect | Status |
| ------ | ------ |
| Foreign keys | ✅ |
| Unique constraints | ✅ |
| Check constraints | ✅ |
| Indexes | ✅ |
| Transactions | ✅ |
| Row locking | ✅ |
| Optimistic locking | ✅ |
| Money handling | ✅ |
| Audit records | ✅ |
| Soft deletion | ⚠️ |
| Immutable financial records | ⚠️ |
| Migration safety | ⚠️ |

### 5.2 Missing Tables

- `pw_ugc_submissions` (F25/F30)
- `pw_notifications`
- `pw_search_index` (F28)
- `pw_identity_verifications` (F31)
- `pw_retention_jobs`
- `pw_processor_agreements`
- `pw_incident_reports`

---

## 6. Authentication/RBAC Audit

### 6.1 Roles

| Role | Server-Enforced | Notes |
| ---- | --------------- | ----- |
| Visitor | ✅ | No account needed |
| Artist | ✅ | All artist actions |
| Staff | ✅ | Ops actions |
| Admin | ✅ | All admin actions |

### 6.2 Gaps

- No 2FA for staff/admin
- No audit log viewer
- No grievance response inbox
- No identity verification workflow
- No permission matrix documentation

---

## 7. Payment Audit

### 7.1 Critical Issues

1. **`RAZORPAY_WEBHOOK_SECRET` not set** — webhook verification always fails
2. **No amount verification** — webhook doesn't check payment amount matches booking
3. **No currency verification**
4. **No `partially_refunded` state**
5. **No replay window** — only `event_id` uniqueness

### 7.2 Working

- Order creation ✅
- Webhook idempotency ✅
- Refund workflow ✅
- Ledger integration ✅
- Client-side trust prevention ✅
- No card data storage ✅

---

## 8. Compliance Audit

### 8.1 DPDP Act 2023

| Requirement | Status |
| ----------- | ------ |
| Consent records | ✅ |
| Specific consent | ✅ |
| Informed consent | ✅ |
| Affirmative consent | ✅ |
| Purpose-limited | ✅ |
| Withdrawable | ✅ |
| Marketing consent unbundled | ✅ |
| Data access/export | ✅ |
| Correction | ⚠️ |
| Erasure | ✅ |
| Grievance | ✅ |
| Nomination | ✅ |
| Children's data | ⚠️ |
| Retention | ❌ |
| Processor documentation | ❌ |
| Breach response | ❌ |

### 8.2 GST / Tax

| Requirement | Status |
| ----------- | ------ |
| GST rate | ✅ |
| GST calculation | ✅ |
| GST invoice | ❌ |
| HSN/SAC | ❌ |
| Place of supply | ❌ |
| Tax split | ❌ |
| GSTIN | ⚠️ (hardcoded) |
| Refunds | ✅ |
| TDS/TCS | ❌ |

### 8.3 IT Act / E-Sign

| Requirement | Status |
| ----------- | ------ |
| E-signature | ✅ |
| IT Act s.6 | ✅ |
| Immutable signed copy | ✅ |

### 8.4 IP & Content

| Requirement | Status |
| ----------- | ------ |
| Artist retains copyright | ✅ |
| Limited licence | ✅ |
| Content ownership metadata | ⚠️ |
| Infringement reporting | ❌ |
| Takedown | ⚠️ |
| Evidence/audit trail | ✅ |

---

## 9. Infrastructure Audit

| Aspect | Status |
| ------ | ------ |
| Environments | ❌ (no staging) |
| CI/CD | ❌ |
| Database | ✅ (Neon) |
| Redis | ❌ |
| Queues | ❌ |
| Realtime | ❌ |
| Backups | ❌ |
| DR | ❌ |
| Monitoring | ❌ |
| Structured logging | ❌ |
| Error tracking | ❌ |
| Rate limiting | ⚠️ (in-memory) |
| CDN | ✅ |
| Deployment | ⚠️ (Vercel auto-deploy) |
| Rollback | ❌ |
| Load testing | ❌ |
| Performance testing | ❌ |

---

## 10. Testing Audit

| Test Type | Status | Files |
| --------- | ------ | ----- |
| Unit tests | ⚠️ | 4 files (money, pricing, qr, state-machine) |
| Integration tests | ❌ | 0 |
| Concurrency tests | ❌ | 0 |
| Security tests | ❌ | 0 |
| E2E tests | ❌ | 0 |
| Accessibility tests | ❌ | 0 |
| Performance tests | ❌ | 0 |

---

## 11. Accessibility Audit

| Aspect | Status |
| ------ | ------ |
| Keyboard navigation | ⚠️ |
| Focus states | ⚠️ |
| Semantic HTML | ⚠️ |
| Screen readers | ⚠️ |
| Labels | ⚠️ |
| Form errors | ✅ |
| Contrast | ⚠️ |
| Alt text | ⚠️ |
| Reduced motion | ⚠️ |
| Dialogs | ⚠️ |
| Tables | ⚠️ |
| Touch targets | ⚠️ |

---

## 12. Performance Audit

| Aspect | Status |
| ------ | ------ |
| Core Web Vitals | ❌ |
| Bundle size | ❌ |
| Image optimization | ✅ |
| Lazy loading | ⚠️ |
| Caching | ⚠️ |
| N+1 queries | ⚠️ |
| API latency | ❌ |
| Search latency | ❌ |
| Page rendering | ⚠️ |
| CDN behavior | ⚠️ |
| Realtime connections | ❌ |

---

## 13. Observability Audit

| Aspect | Status |
| ------ | ------ |
| Structured logs | ❌ |
| Metrics | ❌ |
| Tracing | ❌ |
| Error tracking | ❌ |

---

## 14. Deployment Audit

| Aspect | Status |
| ------ | ------ |
| Tagged releases | ❌ |
| Automated deployment | ⚠️ (Vercel auto-deploy) |
| Rolling/blue-green | ❌ |
| Migration safety | ⚠️ |
| Rollback strategy | ❌ |
| Release tracking | ❌ |

---

## 15. Production Blockers

### P0 — Launch Blockers

1. **Secrets committed to git** — must be removed, rotated, moved to env vars
2. **Razorpay webhook secret missing** — payment confirmation broken
3. **No webhook amount verification** — payment manipulation risk
4. **F25 (Selfie UGC) missing**
5. **F28 (Full-Text Search) missing**
6. **F30 (Community Gallery) missing**
7. **No integration/concurrency/security tests**

### P1 — Critical Production Functionality

8. **No notification system**
9. **No audit log viewer**
10. **No grievance response inbox**
11. **No artist scan analytics**
12. **No offer acceptance UI**
13. **No condition photo upload**
14. **No visitor withdrawal UI**
15. **No data retention jobs**
16. **No CI/CD**
17. **No monitoring/observability**
18. **No backups/DR**
19. **No identity verification**
20. **No GST invoice generation**

---

## 16. Recommended Remediation Order

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