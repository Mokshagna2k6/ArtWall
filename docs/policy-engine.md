# PolicyEngine (BE-3.01 – BE-3.06, BE-3.09, BE-3.10)

The single backend gate for every eligibility decision. Every server action
and API route that performs a gated operation (publish, exhibit, secondary
sell, list on the marketplace, mint) must call the matching gate function here
and reject on `allow: false`.

## Files

| File | Purpose |
|---|---|
| `src/features/policy/engine.ts` | The gates themselves. Pure, no DB, no `server-only`. |
| `src/features/policy/log.ts` | Writes every decision to `policy_decisions` for audit (BE-3.06). |
| `src/features/policy/commission.ts` | Reads the active `commission_policies` row for a rate `kind` (BE-3.09, BE-3.10). |
| `db/migrations/0043_be3_policy_engine.sql` | `policy_decisions` (append-only) + `commission_policies` tables, seeded with the two rates that used to be env vars. |
| `src/features/policy/__tests__/engine.test.ts` | Master Eligibility Matrix cell tests, including the section-14 four-combination test. |

## The gate functions

```ts
export interface TrustDimensions {
  identityVerified: boolean;
  physicalBindingVerified: boolean;
  blockchainAnchored: boolean;
  coaIssued: boolean;
  curationApproved: boolean;
}

export type ReasonCode =
  | "IDENTITY_NOT_VERIFIED"
  | "PHYSICAL_BINDING_NOT_VERIFIED"
  | "BLOCKCHAIN_NOT_ANCHORED"
  | "COA_NOT_ISSUED"
  | "CURATION_NOT_APPROVED"
  | "ARTWORK_NOT_PUBLISHED"
  | "ALREADY_LISTED"
  | "ALREADY_MINTED";

export interface Decision {
  allow: boolean;
  reasons: ReasonCode[];
}

function canPublishArtwork(facts: { hasTitle: boolean; hasImage: boolean }): Decision;
function canExhibit(facts: { trust: TrustDimensions }): Decision;
function canSecondarySell(facts: { trust: TrustDimensions; isPublished: boolean }): Decision;
function canList(facts: { trust: TrustDimensions; isPublished: boolean; alreadyListed: boolean }): Decision;
function canMint(facts: { trust: TrustDimensions; alreadyMinted: boolean }): Decision;
```

Each gate takes a small "facts" object rather than an artwork id, and is a
pure function — no database read inside the gate itself. **The caller is
responsible for assembling `TrustDimensions` from the database** before
calling the gate. This is deliberate: it is what makes every cell of the
Master Eligibility Matrix (BE-3.02) unit-testable with plain objects and no
connection, and it is what lets the other three Phase 3 tracks build against
a stable, synchronous contract today.

### The calling convention (BE-3.03)

```ts
import { canExhibit } from "@/features/policy/engine";
import { logPolicyDecision } from "@/features/policy/log";

const decision = canExhibit({ trust });
await logPolicyDecision({
  gate: "canExhibit",
  subjectType: "artwork",
  subjectId: artworkId,
  actorId: actor?.id ?? null,
  decision,
  inputs: { trust },
});
if (!decision.allow) {
  throw new PreconditionError(`Not eligible to exhibit: ${decision.reasons.join(", ")}`);
}
```

Verification for BE-3.03 ("every gated route calls the PolicyEngine") is a
grep for `from "@/features/policy/engine"` across `src/**/actions.ts` and
`src/app/api/**/route.ts`, plus a test per route — this is a follow-on task,
not yet done (see "What's not done" below).

## BE-3.04 — the section-14 hard gate, verbatim

> An artwork is exhibitable only when physical binding is verified
> (cryptographic, B-level per Bible) AND blockchain provenance is anchored.

`canExhibit` implements this as a literal AND over exactly two of the five
trust dimensions — `physicalBindingVerified` and `blockchainAnchored`.
Identity, COA and curation are **not** part of this gate; they gate other
operations (`canSecondarySell`, `canList`, `canMint`). All four truth-table
combinations are covered in `engine.test.ts`:

| physicalBindingVerified | blockchainAnchored | allow | reasons |
|---|---|---|---|
| false | false | false | `PHYSICAL_BINDING_NOT_VERIFIED`, `BLOCKCHAIN_NOT_ANCHORED` |
| true | false | false | `BLOCKCHAIN_NOT_ANCHORED` |
| false | true | false | `PHYSICAL_BINDING_NOT_VERIFIED` |
| true | true | true | (none) |

### Mapping trust dimensions to real columns today

DB-3.01 landed the canonical five-dimension loader:
`loadTrustDimensions(artworkId: string): Promise<TrustDimensions>` in
`src/features/policy/trust.ts`. Call it, pass the result straight to a gate:

```ts
import { loadTrustDimensions } from "@/features/policy/trust";
import { canExhibit } from "@/features/policy/engine";

const trust = await loadTrustDimensions(artworkId);
const decision = canExhibit({ trust });
```

It reads each dimension live from its existing source-of-truth table below —
deliberately not a sixth mirrored column, since keeping a copy in sync with
five different write paths is a drift bug waiting to happen:

- `physicalBindingVerified` → `art_tags.boundAt is not null` for a tag bound
  to the artwork (`src/features/art-tags/actions.ts`). An NFC/QR tag bound to
  an artwork record is the cryptographic physical binding the Bible calls
  "B-level".
- `blockchainAnchored` → `coa_certificates.status = 'minted'` (or a confirmed
  `merkle_roots` commitment covering the artwork's `mint_commitments` row) —
  i.e. an on-chain transaction exists, not merely a pending mint request.
- `identityVerified` → `user.identity_verified` (set by
  `pw_identity_verifications` review approval).
- `coaIssued` → `coa_certificates.status in ('issued', 'minted')`.
- `curationApproved` → an approved `curator_picks` row, or an equivalent
  platform-review flag. `curator_picks` has no separate approve/reject
  status — a pick row existing for the artwork IS the approval, since there
  is no curation workflow beyond a curator adding a pick.

**Caveat:** the actual Bible section-14 and section-3–11 text is not present
in this worktree (`docs/` has no "Bible" document checked in); this mapping
is inferred from column names, comments and the BE-3.xx task list's own
citations, not read from source. Whoever owns DB-3.01 should confirm or
correct this table against the real Bible text.

### The graded levels (DB-3.01, migration 0052)

The boolean `TrustDimensions` above answer "can the gate say yes right now".
A separate, GRADED set of five columns/views answers "how far along is this,
exactly" — what the not-yet-built trust-panel UI (FE-3.01-3.04) needs to show
"COA level 2 of 3" instead of a checkmark. `loadTrustDimensionLevels` in
`src/features/policy/trust.ts` is the loader:

| Dimension | Values | Storage |
|---|---|---|
| `artistVerificationStatus` | `unverified \| pending \| approved \| rejected` | Real stored column, `user.artist_verification_status`. Written by `reviewIdentity` — the same write path that already sets `identity_verified`. |
| `coaLevel` | 0-3 | Real stored column, `coa_certificates.coa_level` (0046/DB-3.02). Kept in sync by a trigger added in 0052 — see "coa_level drift fix" below. |
| `provenanceLevel` | 0-4 (P0-P4) | View `artwork_provenance_levels`. P0 none, P1 COA issued, P2 mint commitment opened, P3 commitment confirmed on-chain, P4 minted. |
| `bindingLevel` | 0-3 (B0-B3) | Generated column, `art_tags.binding_level` — `GENERATED ALWAYS AS ... STORED` from `binding_status`/`key_reference`/`sun_counter_last_seen` on the same row. |
| `transactionEligible` | boolean | View `artwork_transaction_eligibility` — literally `canSecondarySell`'s three preconditions (published, identity verified, COA issued) read live. |

**Why views/generated column instead of five more mirrored columns:**
`provenanceLevel` and `transactionEligible` need data from more than one
table (artworks + coa_certificates + mint_commitments + user), so they can't
be Postgres `GENERATED` columns (same-row only) — a stored+trigger column
would need triggers fanned out across three tables to stay correct, the
exact drift risk `loadTrustDimensions`'s own doc comment warns about. A view
recomputes live from the same tables the boolean loader already reads.
`bindingLevel`'s inputs are all on the same `art_tags` row, so it is a real
`GENERATED ALWAYS AS ... STORED` column — Postgres keeps it correct by
construction, the strongest guarantee available, and the literal "column
with a CHECK" the task text asks for. `artistVerificationStatus` has exactly
one write path already (`reviewIdentity`), so storing it is zero new sync
burden, not a drift risk.

**coa_level drift fix:** building `provenanceLevel` surfaced a real bug in
0046 — it backfilled `coa_level` once at migration time, but nothing kept it
in sync afterwards. Every status-writing call site (`issue`, `revoke`, the
mint-flow routes under `src/app/api/blockchain/certificates/**`) only ever
set `status`, never `coa_level`, so every certificate created or transitioned
since 0046 silently drifted back to level 0. Migration 0052 adds a
`before insert or update of status` trigger (`coa_certificates_sync_level`)
that derives `coa_level` from `status` on every write, including the
"revoked/failed keep whatever level they were at" rule 0046's comment
described but never enforced (`OLD.coa_level` is carried forward when
transitioning into `revoked`/`failed`). Verified against a real
`metadata_pinned` -> `minting` -> `failed` sequence: level stays 2 throughout,
never resets to 1.

**Known incomplete signal, not fabricated:** `bindingLevel`'s B2/B3 split is
meant (per the Bible's NTAG424/SUN model) to distinguish "a key reference is
on file" from "a live SUN-counter tap was cryptographically re-verified" —
real proof of a physical tap, not just a stored reference. Today's real
columns only capture `key_reference` (set at bind time) and
`sun_counter_last_seen` (a value, not a re-validation event), so B3 here
means "bound, with a key reference, and at least one observed SUN counter
value" — the best signal the database actually has, not "re-verified on
every scan". If a future Blockchain Phase 3 slice adds scan-time SUN counter
re-validation (a monotonic check against the tag's real NTAG424 state on
every read, not just at bind time), B3 should be redefined against that
event instead of mere presence of a last-seen value.

## Commission policies (BE-3.09, BE-3.10)

`commission_policies` replaces the two env-var-based rates that used to be
hardcoded defaults in `src`:

- `curators/actions.ts`'s `CURATOR_COMMISSION_BPS` (was default `1000` = 10%)
- `coa/actions.ts`'s `MINT_ROYALTY_BPS` (was default `400` = 4%)

```ts
type CommissionKind = "curator_commission" | "mint_royalty" | "platform_commission";
function getActiveCommissionPolicy(kind: CommissionKind): Promise<{ id: string; rateBps: number }>;
```

- At most one row per `kind` may have `active = true` (partial unique index).
- `getActiveCommissionPolicy` throws `PreconditionError` if no row is active
  for that `kind` — an unconfigured rate must refuse the operation, never
  silently default to 0 or fall back to a literal.
- Callers store the returned policy **id** (not just the bps number) on the
  record they write — `curators.commission_bps` already snapshots the
  resolved bps at approval time (pre-existing column, unchanged), and
  `mint_commitments.erc2981_royalty_bps` does the same. A future ledger entry
  that reads this policy for pricing should store `commission_policies.id`
  alongside the resolved amount, per BE-3.09's "stores that policy version id
  on every ledger entry it produces" — no ledger-producing commission flow
  exists yet in this codebase (see below), so this is written up as guidance
  for whoever adds one, not yet enforced by a stored column.
- `"platform_commission"` is defined as a `CommissionKind` but has no seeded
  row or caller yet — added because BE-3.11 (escrow release) will need it;
  seed it when that flow is built.

Migration `0043_be3_policy_engine.sql` seeds the two known rates as the
active row for their kind, carrying over the old env var defaults exactly
(1000 bps curator commission, 400 bps mint royalty) so this migration is a
storage-location change, not a rate change.

## `policy_decisions` (BE-3.06)

Append-only (trigger-enforced, same pattern as `coa_certificates` and other
Phase-2 tables) log of every gate call:

```sql
policy_decisions (
  id bigint identity primary key,
  gate text not null,            -- 'canExhibit', 'canMint', ...
  subject_type text not null,    -- 'artwork', 'edition', ...
  subject_id text,
  actor_id text,
  allowed boolean not null,
  reasons jsonb not null,        -- ReasonCode[]
  inputs jsonb not null,         -- whatever facts object was passed in
  decided_at timestamptz not null default now()
)
```

`logPolicyDecision` in `log.ts` is best-effort (catches and logs its own
errors) — mirrors `physical-wall/audit.ts`'s `recordAudit`: losing one
decision-log row must never fail the request it was only observing.

## What's done vs. not done in this contract

**Done, verified:**
- `engine.ts` — all five gates, pure, typed, unit-tested (20 new tests,
  including the full BE-3.04 four-combination matrix).
- `log.ts` — decision logging, best-effort, matches existing audit pattern.
- `commission.ts` — active-policy reader, throws on missing config.
- Migration 0043 — `policy_decisions` (append-only) + `commission_policies`
  (one-active-per-kind), seeded.
- BE-3.10 — both previously-hardcoded bps defaults (`curators/actions.ts`,
  `coa/actions.ts`) now read from `commission_policies`; grepped the rest of
  `src` for bps/percentage literals, none remain outside `money.ts`'s `BP`
  unit constant and `pw_settings`-driven pricing (pre-existing, out of this
  task's scope — those already come from the database, not a literal).
- Existing DB integration tests for curators and COA updated to swap the
  active commission_policies row instead of an env var, and pass.

**Not done — left for the rest of BE-3.xx or explicitly out of scope here:**
- No caller in the codebase yet invokes `canExhibit`/`canSecondarySell`/
  `canList`/`canMint`/`canPublishArtwork` from a real action or route (BE-3.03
  — "every gated operation calls the PolicyEngine" — requires touching the
  exhibition, marketplace and mint action files one at a time, each is its
  own diff to review against "does not break existing code"). The engine and
  logging exist and are tested; wiring every call site is the next slice of
  work.
- DB-3.01's five-dimension loader now exists —
  `loadTrustDimensions` in `src/features/policy/trust.ts`, DB-tested
  (`src/features/policy/__tests__/trust.db.test.ts`). BE-3.03 (wiring every
  gated call site) can call it directly; it is unblocked. The graded levels
  (`loadTrustDimensionLevels`, migration 0052, DB-tested in
  `trust-levels.db.test.ts`) are also done — see "The graded levels" above.
- BE-3.07/3.08 (orthogonal state machine domains, 15-stage exhibition
  lifecycle) not started.
- BE-3.11 – 3.25 not started (escrow, WallOS, demand engine, Shiprocket,
  DigiLocker, insurance, DPDP items, outbox ADR, editions cap, COA levels,
  Locked Product Rules traceability table).

## Admin roles (SEC-3.02, SEC-3.03)

The 8-role admin model from the Bible, real and enforced — not just schema.
This is a backend-only slice; FE-3.17 (a later, separate task) builds the
admin UI against the contract below.

### The two authorization axes

1. **Generic `role`** (`src/features/physical-wall/authorize.ts`,
   `ROLES`/`Role`/`requireRole`/`hasRole`/`getActor`) — unchanged, still the
   broad gate every existing admin page/action relies on. `visitor < artist <
   staff < admin`, stored on `"user".role`.
2. **Named admin role** (new, additive) — `admin_roles`/`admin_role_assignments`
   (migration `0049_db3_escrow_admin_tags_shipments.sql`, DB-3.10), now wired
   to real authorization decisions:

```ts
export const ADMIN_ROLES = [
  "super_admin", "curator_admin", "venue_admin", "finance_admin",
  "support_admin", "compliance_admin", "content_admin", "readonly_admin",
] as const;
export type AdminRoleName = (typeof ADMIN_ROLES)[number];

function hasAdminRole(actor: Actor | null, required: AdminRoleName): Promise<boolean>;
function requireAdminRole(required: AdminRoleName): Promise<Actor>; // throws NotAuthorisedAdminRoleError
```

`requireAdminRole` first calls `requireRole("admin")` (the existing gate),
then additionally checks `admin_role_assignments` for a live (unrevoked) row
matching the named role. A caller needs both: generic `admin` AND the
specific named role.

### Scope decision: which call sites were migrated

This task deliberately did **not** force every existing `requireRole("admin")`
call site onto the new system — that is a much larger, riskier sweep (dozens
of admin actions/pages across the app) than SEC-3.02/3.03 asks for. Instead,
the two clearest, highest-value existing admin actions that map 1:1 onto one
of the 8 Bible roles were migrated, as a real end-to-end proof the new system
works:

| Action | File | Now requires |
|---|---|---|
| `reviewIdentity` | `src/features/physical-wall/actions/identity.ts` | `requireAdminRole("compliance_admin")` — matches `admin_roles.description` ("DPDP, KYC, identity verification review") verbatim |
| `approveCurator` / `suspendCurator` (via `moveCurator`) | `src/features/curators/actions.ts` | `requireAdminRole("curator_admin")` — matches `admin_roles.description` ("Curation and exhibition approvals") |

Everything else on an admin surface (grid edits, ledger, grievances,
moderation, bookings, `getCuratorsForReview`'s read, `getIdentityDocumentUrl`'s
viewer check, …) is unchanged and still gated by the broad
`requireRole("admin")`/`hasRole(actor, "admin")` catch-all. Migrating the rest
is follow-on work, not part of this slice — each call site is its own diff to
review for "does this change behaviour for an existing admin."

### ADMIN_EMAILS removal and the bootstrap question

`getActor()` previously auto-promoted any session user whose *verified* email
matched the `ADMIN_EMAILS` env var, on every request. That live, request-time
bootstrap is **removed** (SEC-3.02's "the ADMIN_EMAILS allowlist is removed").

This was safe to remove outright, not just move, because
`scripts/seed-accounts.mjs` already creates the first admin a different way —
directly in the database (`update "user" set role = 'admin' ...`), run
out-of-band, never from live request-handling code. That script is now also
the only thing that assigns `super_admin` (the one admin role that can grant
others), since `grantAdminRole` itself requires an existing `super_admin` to
call it. So:

- **First admin, first super_admin:** `node --env-file=.env scripts/seed-accounts.mjs`
  — seeds the master admin AND grants them `super_admin` in
  `admin_role_assignments`.
- **Every admin/role after that:** `grantAdminRole`/`revokeAdminRole` below,
  called by an existing `super_admin`.
- `ADMIN_EMAILS` still exists as an env var, but only for
  `notifications.ts`'s `alertAdmins` (an alert-recipient mailing list, not a
  privilege grant) — unrelated to authorization, left untouched.

### `grantAdminRole` / `revokeAdminRole` (SEC-3.03)

`src/features/physical-wall/actions/admin-roles.ts`:

```ts
function grantAdminRole(targetUserId: string, role: AdminRoleName): Promise<Result<{ assignmentId: string }>>;
function revokeAdminRole(targetUserId: string, role: AdminRoleName): Promise<Result<{ revoked: boolean }>>;
function listAdminRoleAssignments(): Promise<{ id, user_id, name, email, role, granted_by, granted_at }[]>;
```

Guards, in order:
1. Caller must hold `super_admin` (`requireAdminRole("super_admin")`, which
   itself requires generic `admin` first).
2. No self-grant / no self-revoke: `targetUserId === actor.id` is rejected
   with a `PreconditionError` before any write.
3. Idempotent grant: a live assignment of the same (user, role) already
   existing returns that assignment rather than erroring (the schema's own
   partial unique index — `(user_id, role_id) where revoked_at is null` —
   would reject a raw duplicate insert; checked first for a clean message).
4. Revoke is append-only by schema (0049's `admin_role_assignments_no_mutate`
   trigger forbids UPDATE of anything but `revoked_by`/`revoked_at`, forbids
   DELETE entirely) — `revokeAdminRole` sets those two columns on the live
   row, same close-out-don't-delete pattern as `pw_consents` and
   `commission_policy_versions`.
5. Every grant/revoke writes `pw_audit_log` via `recordAudit` (SEC-2.11's
   existing pattern) — action `admin-role.granted` / `admin-role.revoked`,
   actor = the granting/revoking super_admin, subject = the target user,
   `after: { role, assignmentId }`.

Tests: `src/features/physical-wall/__tests__/admin-roles.db.test.ts` — a
non-super-admin (plain `admin`) is rejected; a non-admin is rejected before
the super_admin check even applies; self-grant and self-revoke by a
super_admin are both rejected; a legitimate grant/revoke by a super_admin
succeeds, is audit-logged, and takes effect immediately (`hasAdminRole` reads
live, no caching); granting the same role twice is idempotent (no duplicate
row, no second audit entry); revoking a role not held is a no-op, not an
error; `listAdminRoleAssignments` is itself `super_admin`-gated.

## BE-3.14 and BE-3.18 scope interpretation

Both tasks carry a tracker-native `(confirm scope: ...)` caveat, quoted
verbatim in `BE-3-TASKS.md`. Neither was started in this session (time went
to the PolicyEngine contract first, per the priority instruction), so this is
an interpretation for whoever picks them up next, not a report of work done:

- **BE-3.14** (WallOS on-chain slot IDs + venue revenue share): the caveat
  asks whether on-chain slot IDs are truly MVP-required or Growth-phase. Given
  this codebase's existing pattern — `pw_slots` has no chain-related columns
  today, and every other "smart contract" surface in Phase 2
  (`mint_commitments`, `coa_certificates`) is scoped to the *artwork*, never
  to a physical wall slot — the more consistent MVP scope is: **record the
  venue revenue share as a plain `commission_policies`-style rate (kind
  `"venue_revenue_share"`) computed and stored server-side, and treat the
  on-chain slot ID itself as Growth-phase / N/A for MVP**, same as the task's
  own text already defers "the WallOS B2B rental product". This keeps BE-3.14
  consistent with BE-3.15's explicit "predictive scoring is MVP-deferred"
  pattern elsewhere in the same list.
- **BE-3.18** (insurance coverage recording): the caveat flags thin grounding
  (F68 + a general MVP reference, no specific Bible section). Given the task
  text explicitly excludes "the insurance marketplace" and asks only for
  "basic insurance coverage recording for artworks in transit or on wall",
  the minimal MVP-consistent scope is a plain record table (policy number,
  insurer, coverage amount, covered artwork/booking, start/end dates) with no
  claims workflow, no premium calculation, and no integration — a data model
  for a fact the business already tracks manually, not a feature. Neither
  BE-3.14 nor BE-3.18 has any code written yet in this session; both are
  scoped here so whichever agent picks them up next does not have to
  re-derive the interpretation from scratch.
