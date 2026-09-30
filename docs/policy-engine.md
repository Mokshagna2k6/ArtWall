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
  gated call site) can call it directly; it is unblocked.
- BE-3.07/3.08 (orthogonal state machine domains, 15-stage exhibition
  lifecycle) not started.
- BE-3.11 – 3.25 not started (escrow, WallOS, demand engine, Shiprocket,
  DigiLocker, insurance, DPDP items, outbox ADR, editions cap, COA levels,
  Locked Product Rules traceability table).

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
