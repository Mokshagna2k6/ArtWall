# Locked Product Rules traceability (Bible section 166, rules 1–48)

- Tasks: BE-3.25, SEC-3.06 (rules 41–48 subset)
- Source of the rule groupings: every `section 166` citation found in the
  Notion tracker (`https://app.notion.com/p/3e92da5aa27e8176bf9cf764996dab7b`),
  cross-checked against the local mirrors `BE-3-TASKS.md`, `FE-3-TASKS.md`,
  `FE-3-REMAINING-TASKS.md`. The tracker does not contain the Locked Product
  Rules document itself (rule-by-rule text) — only task-level citations that
  say which rule range a given task maps to. This table is built **only**
  from those real citations plus direct reading of the current codebase; no
  rule number or grouping below was guessed.

## Method and an honest limitation

The tracker's `section 166` citations, verbatim, are:

| Citation (as written in the tracker) | Task |
|---|---|
| `section 166 rules 1-8` | BE-3.07, BE-3.23 |
| `section 166 rules 16-24` | BE-3.04, BE-3.08 |
| `section 166 rules 25-30` | BE-3.11 |
| `section 166 rules 31-35` | BE-3.13 |
| `section 166 rules 41-42` | BE-3.01, FE-3.05, SEC-2.15 |
| `section 166 rules 41-48` | SEC-3.06 (defines its own scope) |
| `section 166, rules 1-48` (whole range, no sub-group) | BE-3.25 (defines its own scope) |

That accounts for topical groupings for rules **1–8, 16–24, 25–30, 31–35, and
41–48**. **Rules 9–15 and 36–40 are never independently cited anywhere in the
tracker** — no task, in any pillar, cites a `section 166` range that falls
inside those two gaps. This is stated plainly rather than papered over with
an invented grouping: the table below marks rules 9–15 and 36–40 as
**"ungrouped — no tracker citation exists for this rule number"**, and
assigns them no specific enforcing check, because doing so would mean
inventing a rule topic that no real source in this codebase supports. If the
original Bible document (not present in this repository) defines rules 9–15
and 36–40, a future pass with access to that source should replace this
section rather than this table guessing at it now.

Within each cited group, individual rule numbers (e.g., rule 3 vs. rule 7
inside the 1–8 "artwork rules" group) are not separately distinguished by the
tracker either — the citations only ever give a range, never a single rule
number with its own description. So within a group, every rule is mapped to
the same set of enforcing checks/N/A status that the group's task(s)
describe; this is the finest grain of real citation available.

## Rule table

### Rules 1–8 — Artwork rules (artwork state machine, editions)

Cited by: BE-3.07 ("artwork state machine...orthogonal domains"), BE-3.23
("numbered editions with an edition size cap...artist proof designation").

| Rule(s) | Status | Enforcing check |
|---|---|---|
| 1–8 | **Partially met** | `canPublishArtwork` (`src/features/policy/engine.ts`) is a real, wired gate — called from `src/app/actions/artworks.ts` (BE-3.03 wiring confirmed for this one call site). The artwork **state machine as orthogonal domains** (BE-3.07 — lifecycle/commerce/exhibition/custody as separate tracked dimensions) is **not built**: `docs/policy-engine.md` states BE-3.07 "not started" and there is no dedicated state-machine module beyond `src/features/artworks/` basic status transitions (see `src/features/artworks/__tests__/state-machine.test.ts`, which tests a simpler illegal-transition guard, not the four-domain model the rule describes). Edition numbering/size cap (BE-3.23) has **no code**: no `editions` cap-enforcement logic found outside the `editions` table existing in migrations. |
| — | **Not met (sub-items)** | BE-3.07's orthogonal-domain state machine and BE-3.23's edition cap enforcement are genuinely absent — not "N/A for MVP" (they are not on the MVP-deferred list), just not yet built. |

### Rules 9–15 — ungrouped, no tracker citation exists for this rule number

| Rule(s) | Status | Enforcing check |
|---|---|---|
| 9–15 | **Not determinable from this repository** | No task in the tracker cites `section 166` for this range. Cannot responsibly mark "met" or "N/A" without inventing what the rule says. Flagged for follow-up against the authoritative Bible document. |

### Rules 16–24 — Exhibition rules (exhibition lifecycle, exhibit eligibility)

Cited by: BE-3.04 (`canExhibit` hard gate: binding B-level + blockchain
provenance anchored), BE-3.08 (15-stage exhibition lifecycle).

| Rule(s) | Status | Enforcing check |
|---|---|---|
| 16–24 | **Partially met** | `canExhibit` (`src/features/policy/engine.ts:141`) is real and wired — called from `src/features/exhibitions/actions.ts` (both the gating call at line ~178 and the per-artwork eligibility list at ~272). BE-3.08's full 15-stage exhibition lifecycle with server-enforced transitions and an audit entry per transition is **not built**: `docs/policy-engine.md` states "BE-3.07/3.08...not started." There is no `exhibition_transitions`-driving state-machine module in `src/features/exhibitions/` beyond the basic actions file — the migration table `exhibition_transitions` (0051/0053) exists in the DB schema but is not populated by application code outside the DPDP-erasure delete path (`src/features/physical-wall/data-rights.ts`, which only deletes rows, does not create lifecycle transitions). |

### Rules 25–30 — Escrow rules (dual-channel escrow, release/refund ledger)

Cited by: BE-3.11 ("dual-channel escrow flow: funds captured, held, released
to artist/platform/curator per commission policy after delivery confirmation
or dispute window").

| Rule(s) | Status | Enforcing check |
|---|---|---|
| 25–30 | **Not met** | The `escrow_holds` and `escrow_releases` tables exist (`db/migrations/0049_db3_escrow_admin_tags_shipments.sql`), but **no application code references them** (`grep` for `escrow_holds`/`escrow_releases`/`escrow_ledger` usage outside migrations and tests returns nothing). There is no server action, route, or cron that captures, holds, or releases escrow funds for marketplace purchases. This is genuinely unbuilt, not N/A — escrow is in-scope for MVP per the tracker (BE-3.11/3.12 exist as open tracker items, not on the MVP-deferred list). |

### Rules 31–35 — WallOS rules (venue/wall/slot hierarchy, revenue share)

Cited by: BE-3.13 ("WallOS hierarchy service supports CRUD for
Organization, Venue, Building, Floor, Room/Zone, Wall and Slot with
parent-child integrity").

| Rule(s) | Status | Enforcing check |
|---|---|---|
| 31–35 | **Not met** | `db/migrations/0050_db3_wallos_hierarchy.sql` defines the hierarchy tables, and `db/migrations/0055_bc3_venue_revenue_share.sql` defines revenue-share schema, but there is no CRUD service, server action, or admin UI reading/writing them (`grep` for `wallos_organizations`/`wallos_venues` usage outside migrations/tests returns nothing). The existing booking flow still uses the older flat `pw_slots`/`pw_bookings` model, not this hierarchy. Genuinely unbuilt; the WallOS **B2B rental product** specifically is on the MVP-deferred list (confirmed in the tracker's MVP-deferred items line), but the base hierarchy CRUD itself (BE-3.13) is not deferred — it is an open, unstarted tracker item. |

### Rules 36–40 — ungrouped, no tracker citation exists for this rule number

| Rule(s) | Status | Enforcing check |
|---|---|---|
| 36–40 | **Not determinable from this repository** | No task in the tracker cites `section 166` for this range. The adjacent groups (31–35 WallOS, 41–48 security) suggest this range might cover something between WallOS and security (e.g. demand/pricing, commission policy) but that is speculation, not a citation, so it is not stated as fact here. Flagged for follow-up against the authoritative Bible document. |

### Rules 41–48 — Security group

Cited by: BE-3.01 and FE-3.05 (`section 166 rules 41-42` — PolicyEngine
server-side gating, never client-computed) and SEC-3.06 itself
(`section 166 rules 41-48`). See the dedicated breakdown in the
"Rules 41–48" section below (shared with SEC-3.06).

## Rules 41–48 (Security group) — shared with SEC-3.06, enforcing control + test id

SEC-3.06 requires each of rules 41–48 to have both a real enforcing control
**and** a real test id. The tracker only ever cites this range as a block
(`rules 41-42` for the PolicyEngine server-side-only gating rule, and
`rules 41-48` for the SEC-3.06 task's own scope statement) — it does not
split 41 from 42 from 43...48 individually. The table below maps the block
to the concrete Security Phase 1/2 controls that are the realistic
candidates for "security rules," with a real test id for each control that
has one, and marks the rest honestly as gaps.

| Security control | Real file | Real test id | Status |
|---|---|---|---|
| Server-side-only eligibility gating (the rule BE-3.01/FE-3.05 cite directly: decisions never computed client-side) | `src/features/policy/engine.ts` (pure gate functions); called server-side only from `src/app/actions/artworks.ts`, `src/features/exhibitions/actions.ts`, `src/app/api/blockchain/certificates/[id]/mint-voucher/route.ts` | No dedicated "gate decisions are never sent raw to the client" test exists; `src/features/policy/__tests__/` covers the gate functions' logic, not the client/server boundary itself. | **Partially met** — the architecture is server-only by construction (pure functions never imported into a `"use client"` module; none of the three call sites are client components), but there is no automated test asserting this boundary, so "verified by removing a flag in a test" (the tracker's own verification method for the related SEC item) does not exist yet. |
| BOLA/IDOR ownership-chain validation | `src/test/idor-suite.db.test.ts` | `describe("IDOR sweep: booking -> invoice chain (SEC-2.02)")`, `describe("IDOR sweep: booking -> artwork chain (SEC-2.02)")`, `describe("IDOR sweep: artwork -> certificate -> mint voucher chain (SEC-2.02)")`, `describe("IDOR sweep: tag -> binding -> artwork chain (SEC-2.02)")` (plus their nested `it(...)` blocks, e.g. `"getInvoice: only the invoiced artist or staff may read it; a different artist gets null"`) | **Met** |
| RBAC / role hierarchy enforcement | `src/features/physical-wall/authorize.ts` | `src/features/physical-wall/__tests__/security.test.ts` → `describe("RBAC authorization (F12, F17)")` → `it("hasRole denies when actor is null")`, `it("hasRole enforces rank hierarchy")` | **Met** |
| Content-Security-Policy (nonce-based, no unsafe-inline) | `src/proxy.ts` (per-request nonce; `next.config.ts` explicitly does NOT set CSP, by design — see comment at `next.config.ts:23`) | **No dedicated test file found** for `src/proxy.ts`'s CSP header generation. | **Gap** — control exists and is real, but has no automated test, so SEC-2.03/SEC-3.06's "verified by the response header check" is not currently backed by a runnable test. |
| CSRF protection | Server actions rely on Next.js's built-in origin check (framework-provided, per `SEC-2.05`'s own citation of "verified per the Next.js docs"); no ArtWall-authored CSRF code | None found. | **Gap** — relies entirely on framework behavior, unverified by a project test. Not independently testable without a dedicated route-level test. |
| Webhook signature + replay protection | `src/features/physical-wall/notifications.ts` is unrelated; the real control is in the Razorpay webhook route and `src/features/physical-wall/security.ts`/payments code. | `src/features/physical-wall/__tests__/webhook-route.test.ts` → `describe("Razorpay webhook signature (BE-2.01)")` and `describe("Razorpay webhook replay window (SEC-2.14)")`, e.g. `it("rejects a validly-signed payload whose created_at is far in the past (replay)")` | **Met** |
| Audit logging of security-relevant actions | `pw_audit_log` table, written from multiple admin/identity/curator actions | `src/features/physical-wall/__tests__/audit-coverage.db.test.ts` → `describe("Audit log coverage (SEC-2.11)")` → `it("identity.approved / identity.rejected are audited with actor and IP")`, `it("curator.approved is audited with actor and IP")`, `it("admin-role.granted is audited with actor and IP (SEC-3.03)")` | **Met** |
| Account enumeration resistance (sign-in / password reset) | Relies on better-auth's (`src/lib/auth.ts`, `emailAndPassword: { enabled: true }`) default response shape; no ArtWall-authored enumeration-safe-response code | None found in this codebase. | **Not met / unverified** — this is a framework default, not something this codebase tests or explicitly hardens. Cannot be marked "met" on a framework assumption alone. |
| Error-response leakage (no stack traces/SQL errors to clients) | Next.js production error boundary behavior + no custom error-detail-leaking code found in a scan of API routes | None found as a dedicated regression test. | **Gap** — plausible by default Next.js production behavior, not independently tested here. |

**Honest rollup for rules 41–48:** of the 8 realistic security-control
candidates mapped above, **4 have both a real control and a real test id**
(BOLA/IDOR, RBAC, webhook replay, audit logging), **1 has a real control but
no test** (CSP), **1 has a real control but no test** (server-side-only
gating architecture), and **2 rely on framework defaults with no
project-authored control or test** (account enumeration, error leakage).
SEC-3.06 is therefore **not fully satisfiable as "met" today** — see the
Report section of this task for the tick decision.

## Summary

- Rules with a real, cited tracker grouping: 1–8, 16–24, 25–30, 31–35, 41–48
  (37 of 48 rules have *some* tracker-cited topic).
- Rules with no tracker citation at all: 9–15, 36–40 (11 of 48 rules —
  genuinely undeterminable from this repository without the source Bible
  document).
- Of the 37 grouped rules: artwork (1–8) and exhibition (16–24) groups have
  a real, wired, partial enforcement (PolicyEngine gates exist and are
  called), but the deeper state-machine/lifecycle rules in those same groups
  (BE-3.07, BE-3.08) are unbuilt. Escrow (25–30) and WallOS (31–35) have
  schema only, zero application code — genuinely not met, not N/A. Security
  (41–48) is a mixed bag per the table above.
- Nothing in rules 1–48 is marked "N/A for MVP" in this table: cross-checking
  against the tracker's own MVP-deferred list (CLIP matching, art-on-rent,
  EMI/BNPL, soulbound tokens, AI pricing assistant, order-book exchange,
  visual search, AR preview, gift cards, Robinhood distribution, WhatsApp
  Business API, custom 3D templates, multi-city rollout, SOC2/ISO27001,
  international shipping/Stripe, NRI portal, white-label engine, public dev
  API, predictive demand scoring, multi-region deploy, ONDC, WallOS B2B
  rental, protocol licensing, insurance marketplace, heritage documentation
  platform) — none of these map onto rules 1–48's cited topics (artwork,
  exhibition, escrow, WallOS base hierarchy, security). The one partial
  exception is **WallOS B2B rental**, which is on the deferred list and is a
  narrower scope than BE-3.13's base hierarchy CRUD (rules 31–35) — so the
  base hierarchy remains "not met," not "N/A."
