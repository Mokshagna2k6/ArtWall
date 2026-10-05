# Incident runbook (PERF-3.06)

On-call path and escalation for payment, mint, and data-breach incidents.
Reuses the alerting and logging already in the codebase — no new paging
service. See `docs/testing.md` for how to run any suite mentioned here.

## How you get paged

- **Cron failures** (`src/lib/cron.ts`, `runCron`): every job failure calls
  `alertAdmins` (`src/features/physical-wall/notifications.ts`) — a Resend
  email to every `role = 'admin'` user plus everyone in `ADMIN_EMAILS`, deduped
  per job per run. Structured JSON is also written to stdout
  (`{"event":"cron.error", ...}`) — search platform logs for that.
- **Razorpay webhook failures**: same `alertAdmins` path, deduped per Razorpay
  payment id (`src/app/api/physical-wall/razorpay/webhook/route.ts`).
- **Refunds stuck past 3 attempts** (BE-2.11): `alertAdmins`, deduped per
  refund (`src/features/physical-wall/refunds.ts`).
- **No `RESEND_API_KEY` configured**: alerts still land as `pending` rows in
  `pw_notifications` (visible on the admin panel) and as `console.error`
  (`{"level":"alert", ...}`) — an ops person watching platform logs is the
  fallback delivery path, not silence.

If nobody has ADMIN_EMAILS or an admin-role account with a real inbox
configured, alerts go nowhere. Confirm this is set in production before
relying on this runbook.

## Uptime checks (PERF-3.02)

Point an external uptime monitor (e.g. UptimeRobot, Better Stack — no
in-repo dependency, configure outside this codebase) at:

| Surface | URL | Healthy response |
|---|---|---|
| Home | `/` | 200 |
| Marketplace | `/discover` | 200 |
| Verify | `/verify/[hash]` (any known hash, or `/verify` if it 200s standalone) | 200 |
| Razorpay webhook | `GET /api/physical-wall/razorpay/webhook` | 200 `{"status":"ok"}` |

The webhook route is POST-only and signature-gated, so it had no GET surface
an uptime monitor could poll before PERF-3.02; the `GET` handler added to that
route checks database reachability and that `RAZORPAY_WEBHOOK_SECRET` is
configured, and returns 503 if either is wrong — the same two things that
would make the real POST handler fail.

Configure the monitor to alert on 2+ consecutive failures (avoid paging on a
single blip) to the same on-call channel as the code-level alerts above.

**In-repo backstop:** `src/app/api/cron/uptime-check/route.ts` polls the same
four surfaces once a day (`vercel.json`, 02:00 UTC — Vercel Hobby only
schedules crons daily) and calls `alertAdmins` on any failure. This exists so
an outage still pages someone even if the external monitor above is never
configured, but it is daily-granularity only — it does not replace the
external monitor for catching an incident within minutes.

## Triage by incident type

### Payment incident (Razorpay webhook down, or `alertAdmins` fired for `webhook.razorpay.failed:*`)

1. Check the uptime monitor / hit `GET /api/physical-wall/razorpay/webhook`
   yourself. `{"reason":"database"}` → database incident, see below.
   `{"reason":"config"}` → `RAZORPAY_WEBHOOK_SECRET` missing/rotated in the
   deploy environment, fix and redeploy.
2. If the endpoint reports `ok` but payments still aren't settling: check
   Razorpay's dashboard for webhook delivery failures/retries on their side.
   Webhooks are safe to be late — `settleFromWebhook` is idempotent on
   `event_id`/`payment_id`, so once the endpoint is healthy again, Razorpay's
   automatic retries (or `pnpm` — see refunds cron) settle the backlog with no
   manual replay needed.
3. Cross-check `pw_payments` for the affected `order_id`/`payment_id` to
   confirm whether the charge was actually captured on Razorpay's side before
   telling a customer anything.

### Mint incident (mint rate limit tripped, or `canMint` gate rejecting in bulk once BE-3.03 wires it up)

1. `policy_decisions` (migration `0043_be3_policy_engine.sql`) is the
   append-only audit log — query `gate = 'canMint' and allowed = false` for
   the affected window to see which `reasons` fired most (e.g.
   `BLOCKCHAIN_NOT_ANCHORED` spiking means the chain/anchoring side is down,
   not the mint gate itself).
2. If it's the PERF-3.03 rate limit blocking legitimate mints (`rate_limits`
   table, scope `policy:mint`), the limiter fails **closed** by design for
   this operation — confirm the block is real demand, not an attack, before
   raising per-role limits in `src/features/policy/rate-limit.ts`.
3. If the `rate_limits` store itself is down, mint requests fail closed
   (503, "Temporarily unavailable") rather than allowing unlimited mints
   during the outage — this is deliberate (see `src/lib/rate-limit.ts` header
   comment) and is not itself the incident to "fix" by making it fail open.

### Data-breach incident

1. This is the one class of incident where speed of containment beats speed
   of full diagnosis. Rotate `BETTER_AUTH_SECRET`, `ADMIN_PASSWORD`, and any
   third-party API keys (`RAZORPAY_KEY_SECRET`, `RESEND_API_KEY`,
   `CLOUDINARY_API_SECRET`) that may be exposed, immediately — this
   invalidates existing sessions and revokes leaked credentials without
   waiting for root cause. If `MINT_SIGNER_PRIVATE_KEY` is suspected exposed,
   follow the dedicated procedure below instead of just swapping the env var
   — the old key's on-chain `SIGNER_ROLE` must be explicitly revoked, or it
   can keep signing valid vouchers/root commits after rotation.
2. `policy_decisions`, `pw_notifications`, and the audit tables under
   `recordAuditIn`/`recordAudit` (`src/features/physical-wall/audit.ts`) are
   the append-only trails to pull for a timeline of what an attacker could
   have seen or done — none of them can be edited or deleted by application
   code, so they are trustworthy even if the attacker had app-level access.
3. DPDP-relevant: personal data exposure triggers the data-retention/consent
   obligations already documented for `PHYSICAL_WALL_ENABLED`/DPDP work
   elsewhere in this codebase — loop in whoever owns compliance before any
   public disclosure decision; this runbook covers technical containment
   only, not legal/regulatory response.

## Rotating `MINT_SIGNER_PRIVATE_KEY` (BC-2.05)

The platform voucher signer key lives only in the deploy environment's secret
store (Vercel/Railway/etc. environment variables) — never in the repo or a
committed `.env`. It signs two things: EIP-712 mint vouchers
(`src/lib/blockchain/mint-voucher.ts`) and `commitRoot` merkle-root anchoring
transactions (`src/features/blockchain/gateway.ts`), and on-chain it is the
`ArtwallCOA` contract's `SIGNER_ROLE` holder.

Rotate it on a suspected compromise (data-breach incident above), or on a
routine schedule if the team adopts one. Order matters — granting the new
key's role before revoking the old one avoids a window with zero valid
signer:

1. Generate a new key pair offline (e.g. `cast wallet new`); never generate
   it inside a script that could log or transmit it. Note the new address.
2. On-chain, grant the new address `SIGNER_ROLE` **before** touching the old
   key — any `DEFAULT_ADMIN_ROLE` holder can call
   `grantRole(SIGNER_ROLE, newSignerAddress)` (OpenZeppelin `AccessControl`,
   inherited by `ArtwallCOA`; no custom function needed). Confirm on a block
   explorer that the role is actually granted before proceeding.
3. Update `MINT_SIGNER_PRIVATE_KEY` in the deploy environment's secret store
   to the new key, and redeploy/restart so the running process picks it up
   (`mint-voucher.ts` and `gateway.ts` both read it at module load).
4. Revoke the old key's role: `revokeRole(SIGNER_ROLE, oldSignerAddress)`.
   Once revoked, any voucher still signed by the old key permanently fails
   `mintWithVoucher`'s `hasRole(SIGNER_ROLE, recoveredSigner)` check — this is
   intentional, not a bug to route around.
5. Any certificate with an unredeemed voucher issued by the old key (status
   `metadata_pinned` with no mint attempted yet) needs a fresh voucher from
   the new key before the artist can mint — the mint-voucher route always
   signs on demand from current DB state, so simply re-requesting a voucher
   through the normal flow is sufficient; nothing needs to be replayed or
   migrated by hand.
6. Confirm the old private key material is deleted everywhere it was ever
   placed (secret store history, any local `.env` used to generate/test it).

This procedure is intentionally runnable with only `cast` + a block explorer
— no custom tooling — since Phase 2 has no live deployment to rehearse it
against yet (BC-1.10 is pending funding). The `grantRole`/`revokeRole` calls
themselves are exercised for real in
`contracts/test/ArtwallCOASecurity.t.sol`'s
`testAdminCanGrantSignerRole`/`testAdminCanRevokeSignerRole` against a local
Foundry chain, so the on-chain half of this procedure is verified even
without Base Sepolia.

## Escalation

Single-admin-password model today (`SEC-1.16`/`ADMIN_PASSWORD`) — there is no
role hierarchy beyond `admin`/`staff` yet, so escalation is: whoever holds
`ADMIN_PASSWORD` and access to the Neon/Vercel dashboards is the on-call for
all three incident types above. If the team grows past one on-call person,
add a real rotation/paging tool here — deliberately not built now since one
person holds the shared secret today (YAGNI).
