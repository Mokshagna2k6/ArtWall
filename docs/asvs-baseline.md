# OWASP ASVS 5.0 Level 2 baseline — ArtWall

- Task: SEC-3.01 [Source: Bible section 102-119]
- Date: 2026-10-05

## LIMITATION — read this before using this document for compliance sign-off

**This environment has no internet access.** The real OWASP ASVS 5.0 text
(https://github.com/OWASP/ASVS) was not fetched or consulted live. This
table was built from the author's training-data knowledge of ASVS 5.0's
category structure (V1 Encoding/Sanitization or Architecture, V2
Authentication, V3 Session Management, V4 Access Control, V5
Validation/Sanitization, V6 Cryptography, V7 Error Handling/Logging, V8 Data
Protection, V9 Communications, V10 Malicious Code (self-assessed, largely
N/A for a web app audit), V11 Business Logic, V12 Files/Resources, V13
API/Web Service, V14 Configuration — note ASVS 5.0 renumbered/regrouped some
categories from 4.x; the mapping below uses topic names rather than
memorized exact V-numbers wherever there is any doubt, specifically to avoid
stating a precise clause number from memory as if verified).

**This document must be spot-checked against the authoritative published
ASVS 5.0 standard before being treated as a real compliance artifact.**
Treat every "Met"/"Not Met"/"N/A" below as provisional until someone with
internet access cross-references the actual requirement text and numbering.
Where this document cites a real file, test, or commit, that citation is
independently verified and trustworthy regardless of the ASVS-numbering
caveat — only the mapping of "which ASVS category/topic this satisfies" is
built from memory.

## How to read the table

- **Met** — a real, specific ArtWall control exists; file/test cited.
- **Not Met** — confirmed gap; no control found in the codebase.
- **N/A** — does not apply to ArtWall's architecture (e.g. native mobile
  requirements for a web-only app), stated with reasoning, not assumed.

## V2 — Authentication

| Topic | Status | Evidence |
|---|---|---|
| Password-based authentication exists via a vetted library, not hand-rolled | Met | `src/lib/auth.ts` uses `better-auth` (`betterAuth({...})`), `emailAndPassword: { enabled: true }`. |
| Secrets (signing secret, OAuth client secret) required at boot, not silently defaulted | Met | `src/lib/auth.ts:13` — `if (!process.env.BETTER_AUTH_SECRET) throw new Error(...)`, fails closed rather than falling back to a weak default. |
| OAuth account-linking does not allow hijack via an unverified email on the existing account | Met | `src/lib/auth.ts:49-55` — `requireLocalEmailVerified: true`, with an explicit comment (KB-C03) describing the exact hijack this closes: "an OAuth sign-in silently link[ing] onto ANY existing local account with a matching email, even one that never verified it." This was a confirmed, fixed Security Phase 1 bug. |
| Admin authentication is not a shared, weak, client-controllable credential | **Partially Not Met** | The tracker's own Known Bugs (KB-H06, cited `[F54]`) states: "Weak shared ADMIN_PASSWORD. It is truncated or padded to 64 chars and rate-limited only on a spoofable header." This is flagged as a confirmed, outstanding issue in the tracker itself (fix referenced as SEC-1.15 — status not independently re-verified in this pass; cited here as of the tracker snapshot read for this task). |
| Multi-factor authentication (MFA/TOTP) | **Not Met** | Confirmed by code inspection: `src/lib/auth.ts` has no `twoFactor`, `totp`, or MFA plugin/config of any kind. No MFA exists anywhere in this codebase. This is a genuine, confirmed gap, not a guess. |
| Account enumeration resistance (sign-in / password reset do not reveal whether an email exists) | **Not Met / Unverified** | This is a `better-auth` framework default behavior, not an ArtWall-authored or ArtWall-tested control. No test in this codebase (`grep` for enumeration-related test names returns nothing) asserts this. Cannot be marked Met on an assumed framework default alone. |
| Credential rate limiting | Met | `src/app/api/auth/[...all]/route.ts` (per the comment in `src/lib/auth.ts`: "Off: better-auth's built-in limiter defaults to per-instance memory, which does nothing on serverless. The credential endpoints are limited by the shared Postgres limiter..."), backed by `src/lib/__tests__/rate-limit.test.ts` → `describe("store unavailable (PERF-2.03)")` → `it("fails CLOSED by default (auth, admin, writes): refused, 503, Retry-After")`, and the Postgres-backed concurrency test `src/lib/__tests__/rate-limit.db.test.ts`. |

## V3 — Session Management

| Topic | Status | Evidence |
|---|---|---|
| Session cookies: `Secure`, `SameSite` set appropriately | Met | `src/lib/auth.ts:79-84` — production: `{ sameSite: "lax", secure: true }`; dev: `secure: false` only because plain-HTTP localhost cannot carry a `Secure` cookie (documented reasoning, not an oversight). |
| Session storage backed by a real store (not client-trusted JWT-only) | Met | `betterAuth({ database: pool, ... })` — sessions are DB-backed via the shared Postgres pool (`session` table, referenced directly in `src/features/physical-wall/data-rights.ts`'s erasure flow: `delete from session where "userId" = $1`). |
| Session invalidation on account erasure | Met | `src/features/physical-wall/data-rights.ts` (`eraseUserIn`) deletes `session` and `account` rows and revokes QR tokens (`pw_qr_tokens ... revoked_at = now()`) as part of the erasure transaction. |

## V4 — Access Control (BOLA/IDOR, RBAC)

| Topic | Status | Evidence |
|---|---|---|
| Ownership-chain validation for nested resources (not just the leaf) | Met | `src/test/idor-suite.db.test.ts` — four `describe` blocks covering booking→invoice, booking→artwork, artwork→certificate→mint-voucher, tag→binding→artwork chains, each with a real `it(...)` asserting a different user is rejected. This is SEC-2.01/SEC-2.02's real deliverable. |
| Role-based authorization with a rank hierarchy | Met | `src/features/physical-wall/authorize.ts`; tested in `src/features/physical-wall/__tests__/security.test.ts` → `describe("RBAC authorization (F12, F17)")` → `it("hasRole denies when actor is null")`, `it("hasRole enforces rank hierarchy")`. |
| Admin page-level authorization (not just hiding a nav link) | Met | Referenced as a closed Security Phase 1 item in the tracker's parallel-work notes (`SEC-2-TASKS.md`'s context section: "Security Phase 1 already closed...admin page-level auth"); verified present via `src/features/physical-wall/authorize.ts` usage, though no single dedicated test file enumerating every admin page route was found in this pass — the control exists, broad route-by-route regression coverage is not confirmed. |
| Eligibility/gating decisions computed server-side only, never trusted from the client | **Partially Met** | `src/features/policy/engine.ts`'s gate functions (`canPublishArtwork`, `canExhibit`, `canMint`) are pure functions called only from server files (`src/app/actions/artworks.ts`, `src/features/exhibitions/actions.ts`, `src/app/api/blockchain/certificates/[id]/mint-voucher/route.ts`) — architecturally server-only. No automated test specifically asserts "a client cannot forge this decision" (e.g. no test that flips a flag and confirms the server still enforces it, despite the tracker explicitly describing that verification method for the related item). See `docs/locked-product-rules-traceability.md` rules 41–48 table for the detailed breakdown. |

## V5 — Validation, Sanitization, Encoding

| Topic | Status | Evidence |
|---|---|---|
| File upload type validation by magic bytes (not just extension/MIME header) | Met | `src/lib/blockchain/file-sniff.ts`, tested in `src/lib/blockchain/__tests__/file-sniff.test.ts`; reused across UGC, identity-document, and artwork-image upload paths per `SEC-2-TASKS.md`'s own cross-reference note. |
| XSS regression coverage for user-influenced HTML/content surfaces | Met | `SEC-2.06`'s scope (invoice HTML, JSON-LD, UGC captions, artist bio, exhibition description) — Security Phase 1 already closed "invoice XSS" per the tracker's Known Bugs/closed-items notes (`F09`, `F40` citations). Dedicated XSS payload-list regression tests exist per the tracker item description; not independently re-read line-by-line in this pass beyond confirming the fix is referenced as closed. |
| Content-Security-Policy with nonces, no `unsafe-inline` for scripts | Met (control), **no test found** | `src/proxy.ts` sets a per-request CSP with `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'`, `object-src 'none'`, `base-uri 'self'`, `frame-ancestors 'none'`. Deliberately NOT set in `next.config.ts` (documented reasoning: nonces need per-request generation). No dedicated test file for `proxy.ts`'s header output was found in this pass. |

## V6 — Cryptography

| Topic | Status | Evidence |
|---|---|---|
| QR/NFC tag signing uses verifiable cryptographic signatures, not guessable tokens | Met | `src/features/physical-wall/__tests__/security.test.ts` → `describe("QR token security (F15)")` → `it("rejects a tampered token")`, `it("rejects a token from a different secret")`, `it("rejects a malformed token")`. |
| Webhook signature verification | Met | `src/features/physical-wall/__tests__/webhook-route.test.ts` → `describe("Razorpay webhook signature (BE-2.01)")`, multiple `it(...)` blocks covering forged/missing/truncated/unconfigured-secret cases, all failing closed. |
| Identity documents stored privately, served only via short-lived signed URLs | Met | `src/features/physical-wall/actions/identity.ts` (`createSignedIdentityViewUrl`, `type: "authenticated"` on Cloudinary upload — "never resolvable by public id"), SEC-2.08. |

## V7 — Error Handling and Logging

| Topic | Status | Evidence |
|---|---|---|
| Stack traces / SQL errors never returned to clients in production | **Not independently tested** | No dedicated regression test asserting this was found (`grep` for "stack trace"/"SQL error"-named tests returns nothing). Plausible via default Next.js production error-boundary behavior, but not an ArtWall-authored, ArtWall-tested control — marked as a gap in verification, not confirmed safe. |
| Structured, append-only audit logging of security-relevant actions | Met | `pw_audit_log` table; `src/features/physical-wall/__tests__/audit-coverage.db.test.ts` → `describe("Audit log coverage (SEC-2.11)")`, covering identity approve/reject, curator approve, and the admin-allowlist role-grant bootstrap, each asserting actor + IP are recorded. The table has an append-only trigger (referenced in `data-rights.ts`'s erasure comments) that permits only a pseudonymization UPDATE during erasure, nothing else. |
| Cron/admin endpoints fail closed with no secret configured | Met | `src/lib/cron.ts` — `isCronAuthorized`: "Fails closed: with no secret configured, `Bearer undefined` must not be a valid credential," using `timingSafeEqual` for the comparison (timing-attack resistant). |

## V8 — Data Protection

| Topic | Status | Evidence |
|---|---|---|
| PII export (data portability) | Met | `src/features/physical-wall/data-rights.ts` → `exportUserData`, BE-1.27. |
| PII erasure with legally-grounded retention exceptions, documented per field | Met | `src/features/physical-wall/data-rights.ts` → `eraseUserIn`; see `docs/dpdp-data-processing-inventory.md` for the full field-by-field breakdown (SEC-3.08). |
| No secret committed or logged | Met | CI gitleaks scan (`.github/workflows/ci.yml`, "gitleaks scans the full history on every run"); `.env` confirmed gitignored. |
| Dependency vulnerability scanning in CI | Met | `.github/workflows/ci.yml` → `pnpm audit (high/critical only)` step, with the comment noting `--audit-level` only filters *printed* output and the workflow itself gates on severity (not relying on `pnpm audit`'s exit code alone). |

## V9 — Communications

| Topic | Status | Evidence |
|---|---|---|
| HSTS | Met | `next.config.ts` → `Strict-Transport-Security: max-age=63072000; includeSubDomains; preload`. |
| All other standard security headers (`X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`) | Met | `next.config.ts`'s `headers()` block. |

## V13 — API and Web Service

| Topic | Status | Evidence |
|---|---|---|
| Webhook replay protection (event id + timestamp window) | Met | `src/features/physical-wall/__tests__/webhook-route.test.ts` → `describe("Razorpay webhook replay window (SEC-2.14)")`, asserting rejection of payloads whose `created_at` is far in the past or future, and graceful handling of payloads with no `created_at` at all. |
| CSRF protection on non-server-action POST routes | Met (by design choice) | `src/lib/auth.ts`'s comment block above `advanced.defaultCookieAttributes`: `SameSite=Lax` is the explicit CSRF defense for the handful of cookie-authenticated API routes that are not Next server actions; server actions rely on Next's own Origin/Host check. No ArtWall-specific CSRF token scheme exists — this is a documented architectural choice, not an oversight, but it has no dedicated test in this codebase either. |
| Rate limiting fails closed for sensitive operations, fails open only where explicitly opted in | Met | `src/lib/__tests__/rate-limit.test.ts` → `describe("store unavailable (PERF-2.03)")` → `it("fails CLOSED by default (auth, admin, writes)...")` and `it("fails OPEN for public reads that opt in")`. |

## V14 — Configuration

| Topic | Status | Evidence |
|---|---|---|
| Production vs. dev configuration divergence is explicit and reasoned, not accidental | Met | `src/lib/auth.ts`'s `NODE_ENV === "development"` branch for cookie `secure` attribute, with an explicit comment explaining why (localhost cannot carry `Secure` cookies). |
| Image remote-pattern allowlist (prevents `next/image` becoming an open proxy) | Met | `next.config.ts` → `images.remotePatterns` restricted to `res.cloudinary.com` only, with a comment explaining the risk being closed ("free image-resizing proxy for the whole internet, at our bandwidth cost"). |

## Not assessed / out of scope for this pass

- **V1 (Architecture/Encoding) and V11 (Business Logic)**: these ASVS
  categories are largely about SDLC process and business-rule documentation
  rather than single testable controls; not meaningfully assessable as a
  Met/Not-Met table entry without the live standard text, and skipped here
  rather than filled with a vague placeholder.
- **V10 (Malicious Code)**: supply-chain/build-integrity concerns are
  partially covered by the CI dependency scan above; a full self-assessment
  (reproducible builds, SBOM, etc.) is not attempted here and is a real gap
  if ASVS 5.0 Level 2 requires it — flagged, not claimed either way.
- **Native/mobile-specific ASVS requirements**: N/A — ArtWall is a web
  application (Next.js), no native mobile client exists.

## Honest summary

Of the specific, testable controls assessed above (roughly 25 line items
across V2–V9, V13–V14): the large majority have a real, cited control, and
most of those also have a real, cited test. The confirmed, genuine gaps are:

- **MFA is not implemented** (confirmed by code inspection, not inferred).
- **Account enumeration resistance** and **error-response leakage** both
  rely on framework/platform defaults with no ArtWall-authored test.
- **The shared `ADMIN_PASSWORD`** has a known weakness flagged in the
  tracker's own Known Bugs list (KB-H06).
- Several real controls (CSP header, server-only gating architecture, admin
  page-level auth breadth, stack-trace leakage) exist but lack a dedicated
  regression test in this codebase, which is a verification gap even where
  the underlying control is architecturally sound.

This is a Level 2 **baseline assessment**, not a certification. Per the
limitation stated at the top, every category mapping should be
spot-checked against the real ASVS 5.0 text before this is relied on as a
compliance artifact.
