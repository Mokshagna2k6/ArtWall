# Security Phase 2 task list — fetched verbatim from Notion

Source: https://app.notion.com/p/3e92da5aa27e8176bf9cf764996dab7b ("ArtWall — Production Readiness Tracker")
Fetched by the parent session via mcp__notion__notion-fetch and saved to this file so the task
list is verifiable from disk rather than taken on trust from a prompt.

---

- [ ] SEC-2.01. An automated BOLA/IDOR test suite exists. For every route and server action that takes a resource id, a test asserts that a different non-admin user gets 403 or 404. It runs in CI. [Source: Bible section 105; F08, F32, F41, F42]
- [ ] SEC-2.02. Ownership-chain validation per Bible section 105: for nested resources (booking, then invoice; artwork, then certificate, then mint voucher; tag, then binding, then artwork) every link in the chain is validated to belong to the caller, not only the leaf. Each chain has a test. [Source: Bible section 105; F32, F41]
- [ ] SEC-2.03. The Content-Security-Policy header is set with script-src nonces or hashes (no unsafe-inline for scripts), plus frame-ancestors, object-src none and base-uri self. Verified by the response header check. [Source: F40, F09; Bible section 102-119]
- [ ] SEC-2.04. The Strict-Transport-Security, X-Content-Type-Options nosniff, Referrer-Policy and Permissions-Policy headers are set in next.config.ts. [Source: Bible section 102-119]
- [ ] SEC-2.05. CSRF protection is confirmed for all non-server-action POST API routes (origin check or token). Server actions rely on the framework's origin check, and this is verified per the Next.js docs in node_modules. [Source: Bible section 102-119; AGENTS.md]
- [ ] SEC-2.06. XSS regression tests exist for the invoice HTML, JSON-LD, UGC captions, artist bio and exhibition description, using a standard payload list. [Source: F09, F40]
- [ ] SEC-2.07. Uploads validate type by magic bytes and size server-side for every upload path (UGC signature, identity documents, artwork images, IPFS). The Cloudinary signed upload params restrict allowed formats and folder. [Source: F35, F05]
- [ ] SEC-2.08. Identity documents are stored in private storage with short-lived signed URLs, accessible only to the owner and admins with the identity-review role. Access is audit-logged. [Source: F52, F50; Bible section 120-127]
- [ ] SEC-2.09. Secrets hygiene: no secret is logged. A gitleaks scan (or equivalent) runs in CI with no findings, and .env files are confirmed untracked. [Source: Bible section 102-119]
- [ ] SEC-2.10. Dependency scanning (pnpm audit or equivalent) runs in CI, and no high or critical advisories are unaddressed. [Source: Bible section 102-119]
- [ ] SEC-2.11. Admin and security-relevant actions (role grant, refund, identity approve/reject, curator approve, erasure, mint voucher issue) write to the append-only audit log with actor, target, timestamp and IP. [Source: F13, F46, F52; Bible section 69]
- [ ] SEC-2.12. The auth flows are tested for account enumeration: sign-in and password reset responses do not reveal whether an email exists. [Source: Bible section 102-119 ASVS]
- [ ] SEC-2.13. Every server action and route error response is reviewed so that stack traces and SQL errors are never returned to clients in production. [Source: Bible section 102-119; F06, F07]
- [ ] SEC-2.14. The webhook endpoints (Razorpay, Shiprocket when built) verify signatures and reject replays by event id and timestamp window. [Source: F12, F69]
- [ ] SEC-2.15. A security review checklist is added to the PR template and must be completed for changes touching auth, payments, blockchain or PII. [Source: F57; Bible section 102-119]

## Important context — don't duplicate work already done elsewhere
- BE-2.01/2.02 (Razorpay webhook signature verification + idempotency) are ALREADY DONE (verified in an earlier session) — SEC-2.14's Razorpay half is likely already satisfied; confirm by reading `src/app/api/physical-wall/razorpay/webhook/route.ts` yourself before building anything new. Shiprocket doesn't exist yet (BE-3.16 not built), so SEC-2.14's Shiprocket half is correctly out of scope until that exists.
- BC-1.20 (IPFS upload magic-byte detection) was just built in a parallel Blockchain Phase 1 session — `src/lib/blockchain/file-sniff.ts` already exists and does server-side magic-byte detection. SEC-2.07 overlaps with this for the IPFS path specifically — reuse `file-sniff.ts` for the other upload paths (UGC, identity documents, artwork images) rather than building a second file-type-detection mechanism.
- Security Phase 1 already closed admin takeover, OAuth pre-hijack, PII leak, cron bypass, invoice XSS+auth, feature-flag API bypass, admin page-level auth, weak admin password, and session cookie flags — read `src/features/physical-wall/authorize.ts`, `src/lib/auth.ts`, `src/features/admin/actions.ts` to understand what's already in place before duplicating effort.
- Backend Phase 3's PolicyEngine (`docs/policy-engine.md`, `src/features/policy/`) already exists — this is running in PARALLEL right now in a different worktree deepening Database Phase 3's schema (WallOS, escrow, admin_roles, etc.) and is NOT yet wired into live routes. Avoid touching files you don't need to for Security Phase 2's own scope to reduce collision risk with that parallel work.
