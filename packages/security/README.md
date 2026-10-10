# @artwall/security

Pure (no DB, no Next) security primitives, shipped as TypeScript source (`transpilePackages` in `apps/web/next.config.ts`).

| Module | What | Used by (via shims left in place) |
|---|---|---|
| `hmac.ts` | `safeEqual`, `hmacSha256Hex`, `verifyHmacSha256` (constant-time, fails closed) | `physical-wall/razorpay.ts` (`verifyPaymentSignature`, `verifyWebhookSignature`), `lib/cron.ts` (`isCronAuthorized`) |
| `allowlist.ts` | `isAllowedHttpsUrl`, `isCloudinaryUrl` (https + exact host, no userinfo) | `coa/pdf-service.ts` certificate image fetch |
| `redact.ts` | `redactString`, `redact` (emails, bearer, DB URLs, long hex, sensitive keys). **Not yet wired into any logger.** | available |
| `headers.ts` | `buildCsp`, `buildCspReportOnly`, `STATIC_SECURITY_HEADERS` | `src/proxy.ts`, `next.config.ts` |
| `authz.ts` | `ROLES`, `Role`, `roleSatisfies` (default-deny rank check) | `physical-wall/authorize.ts` (re-exports `ROLES`/`Role`, `hasRole` delegates) |

DB-bound authz (`getActor`, `requireRole`, `hasAdminRole`, admin-team roles) stays in `apps/web/src/features/physical-wall/authorize.ts`; it supplies the role string, this package decides.
The Zod `parseInput`/`attempt` contract stays in `actions/shared.ts` (it imports `pg`, `server-only`, and is statically scanned by `action-contracts.test.ts`).

## Headers

- Enforced (unchanged policy): nonce CSP from the proxy, HSTS (2y, preload), X-Frame-Options DENY, nosniff, Referrer-Policy `strict-origin-when-cross-origin`, Permissions-Policy (camera/mic/geo off), `frame-ancestors 'none'`.
- New: `Content-Security-Policy-Report-Only` = enforced policy minus style `'unsafe-inline'` (nonce only) plus `upgrade-insecure-requests`. Nothing is blocked. There is no `report-to` collector yet, so violations are only visible in the browser console; add a collector before promoting.
- Not added on purpose: COOP/COEP (break wallet popups / Razorpay iframe), `payment=` in Permissions-Policy (Razorpay Checkout works today).
- Google OAuth is a top-level redirect (better-auth), so it needs no CSP entry.

## Threat model (summary)

Assets: user accounts and sessions, payments (Razorpay), identity documents and PII (DPDP), artwork provenance (certificates / NFT mint), admin tooling.
Actors: anonymous internet, authenticated visitor/artist abusing IDOR, malicious uploader, compromised third-party script, stolen cron/webhook secrets, insider with one admin role.
Main abuse paths: payment-callback forgery, webhook replay, privilege escalation across the three authz axes, SSRF via stored image URLs, XSS via user content, brute force / scraping, mint/cost abuse.

## OWASP Top 10 (2021) mapping

| # | Where handled | Honest gaps |
|---|---|---|
| A01 Broken access control | `requireRole`/`requireAdminRole` default-deny (`authorize.ts`), `roleSatisfies`, `PHYSICAL_WALL_ENABLED` gate, identity-document access tests | No DB-level backstop (see RLS). Per-route coverage depends on every route calling a guard; only the action-contract test enforces this for actions, not API routes. |
| A02 Cryptographic failures | HSTS, HMAC verify constant-time, better-auth hashing, Neon TLS | Secrets are env vars with no rotation procedure. |
| A03 Injection | Drizzle parameterised queries, Zod at action boundaries, `html-escape.ts`, nonce CSP | Raw SQL in some `pool.query` paths relies on author discipline. |
| A04 Insecure design | State machine for slots, settlement idempotency, threat notes in `*-TASKS.md` | No formal threat-model review. |
| A05 Misconfiguration | Static headers + CSP, `images.remotePatterns` Cloudinary-only | CSP still has style `'unsafe-inline'` (report-only candidate drafted). No CSP report collector. |
| A06 Vulnerable components | `pnpm.overrides` for audited deps, `scripts/audit-high.mjs` | `braces` high finding has no upstream patch. |
| A07 Auth failures | better-auth sessions, Google OAuth, rate limiting (`lib/rate-limit.ts`, moving to `@artwall/ratelimit`) | No MFA; admin password-era paths should be re-audited. |
| A08 Integrity failures | Razorpay signature + webhook HMAC, EIP-712 certificates, lockfile | Webhook replay protection relies on idempotent settlement, not timestamps. |
| A09 Logging/monitoring | Structured cron logs, `alertAdmins` | `redact()` exists but is not applied to `console.error` call sites; no central log scrubbing. |
| A10 SSRF | `isCloudinaryUrl` before server fetch in certificate PDF | Other server-side fetches (IPFS upload/verify, Cloudinary admin calls) were not audited here. |

## Cloudflare WAF / bot protection checklist

Proxy and TLS
- [ ] DNS proxied (orange cloud); SSL mode **Full (strict)**; Always Use HTTPS; min TLS 1.2.
- [ ] Lock the origin: only accept Cloudflare IPs / authenticated origin pulls (Vercel: Deployment Protection or a shared-secret header).
- [ ] Do not enable Rocket Loader, Auto Minify, or Email Obfuscation (they rewrite HTML and break the CSP nonce / React hydration).
- [ ] Trust `CF-Connecting-IP` for client IP; make the rate limiter read it only when the request really came via Cloudflare.

Cache
- [ ] Cache Rule: **bypass cache** for `/api/*`, `/admin/*`, `/studio/*`, `/account/*`, `/sign-in*`, and any request carrying the `better-auth.session_token` cookie. Never cache HTML for authed routes (per-request CSP nonce).
- [ ] Cache static assets (`/_next/static/*`) with Respect Origin headers; cache `res.cloudinary.com` is already CDN-served, no rule needed.

WAF rules
- [ ] Managed rulesets: Cloudflare Managed + OWASP Core (anomaly threshold: start at log, then block).
- [ ] Custom rule: block/challenge `/api/physical-wall/razorpay/*` webhook from non-Razorpay sources only if Razorpay IPs are allowlisted; otherwise leave open (HMAC is the control).
- [ ] Custom rule: challenge requests to `/api/blockchain/*` and `/api/*/cron/*` without expected `Authorization` header shape.
- [ ] Block known-bad methods (TRACE/CONNECT), oversized bodies on non-upload routes.

Rate limits and bots
- [ ] Rate limiting rules: sign-in / sign-up / password reset (e.g. 10 / min / IP), checkout and order creation, upload signature endpoints, waitlist.
- [ ] Bot Fight Mode (or Super Bot Fight Mode) on, with verified bots allowed (Googlebot) so SEO and sitemap crawls are unaffected.
- [ ] Turnstile on sign-up and waitlist forms (not integrated yet).

## RLS plan (placeholder)

Defence in depth only; application-level authorization stays primary.
1. Not started. Prerequisite: the app connects as a single Neon role and uses the HTTP driver for reads, so per-request identity (`set_config('app.user_id', ..., true)`) needs a transaction-scoped path (`pg` pool via `inTransaction`).
2. Pilot on the highest-risk tables first: identity documents, orders/payments, DPDP consent.
3. Policies keyed on `current_setting('app.user_id')` plus an `app.role` setting; a bypass role for migrations/cron.
4. Ship in permissive mode with tests in `*.db.test.ts` against disposable Postgres before enabling `FORCE ROW LEVEL SECURITY`.
