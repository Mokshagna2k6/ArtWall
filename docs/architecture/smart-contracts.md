# Smart contracts

The Foundry project at `contracts/` holds the Bible's five-contract architecture
(§19 Part 1, §79) plus `ArtwallCOA.sol`, the ERC-721 certificate contract that
predates it.

| Contract | What it holds | Bible ref |
|---|---|---|
| `ArtworkRegistry.sol` | Artwork identity, current owner, append-only ownership history, metadata hash, ERC-2981 royalty config, NFC tag uid **hash** | §79, §80, rule 30 |
| `WallRegistry.sol` | Wall slot identity: slot id, venue id (hash), owner wallet, dimensions in mm, revenue share bps, lifetime exhibition counter | §79 |
| `ExhibitionManager.sol` | Exhibition records: slot, artwork token, window, status | §79, §119 |
| `RevenueDistributor.sol` | Atomic five-way sale split; append-only price history | §79, rule 29 |
| `MerkleVerifier.sol` | Daily Merkle roots for lazy-mint proofs; `postRoot()` / `verifyProof()` | §14, §79 |
| `ArtwallCOA.sol` | ERC-721 + ERC-2981 certificate, EIP-712 voucher mint (pre-existing, not part of the five) | BC-1.02 |
| `ArtwallUpgradeable.sol` | Shared base: UUPS, roles, pause, upgrade timelock | §118 |

## The policy gate is the application, not the chain (§119, rule 41)

This is the single most important design constraint, and it shapes
`ExhibitionManager` specifically.

The Bible requires that an exhibition be rejected unless its artwork is **both
physically bound (NFC) and blockchain-approved**. `ExhibitionManager` enforces
that — `scheduleExhibition` reverts with `ArtworkNotEligible` — but it does not
*compute* it. Eligibility is a single attested bit with an expiry,
`eligibleUntil[tokenId]`, written by an `ATTESTOR_ROLE` holder: the application
gateway, which evaluated the real policy off-chain against the binding record,
the nine-layer anti-fraud stack, KYC and everything else the chain must never
see (§80).

Consequences of that split, all deliberate:

- The attestation **expires**, so a stale approval cannot be reused forever
  after an artwork is unbound or delisted.
- `activate()` re-checks eligibility, so an artwork whose attestation lapsed
  between scheduling and hanging does not go up.
- `revokeEligibility()` lets the gateway withdraw an approval immediately. It
  does not retroactively delete exhibitions; those are closed via `cancel()`,
  which keeps the record (rule 30).
- The contract never reads a KYC flag, a fraud score, or an image hash. It
  cannot, and it must not try.

## What is on-chain and what is not (§80)

On-chain: artwork identity, ownership, provenance commitments, royalty rules,
wall slot identity, exhibition records, revenue distribution.

Never on-chain, and absent from these contracts by construction: KYC, raw
images, visitor data, demand signals, shipping, condition photos, buyer
identity, internal notes, private business data.

Two places where the boundary is easy to get wrong:

- **NFC tags.** `ArtworkRegistry` stores `nfcTagUidHash`, never the uid. The
  uid is a physical authentication secret; publishing it on a public chain
  would let anyone clone a tag's claimed identity.
- **Venues.** `WallRegistry.venueId` is a `bytes32` commitment to the off-chain
  venue uuid. The chain needs to tell one venue's slots from another's; it does
  not need the venue's address, licence or contract terms.

## Immutability (rules 29 and 30)

- **Ownership history**: `ArtworkRegistry._ownershipHistory` is a per-token
  append-only array with no delete path. `registerArtwork` reverts on an id
  that already exists, so an entry can never be rewritten.
- **Price history**: every `RevenueDistributor.distribute` appends to
  `_priceHistory[tokenId]` under a single-use `saleId`.
- **Merkle roots**: once posted, permanent. There is no un-post, because a
  commitment that can be withdrawn is not a commitment. One root per day index.
- **Exhibition records**: slot, artwork and start are never rewritten. Only
  `status` and `endAt` advance, and only forward
  (`Scheduled → Active → Ended|Cancelled`).

Royalty *config* is deliberately mutable (a receiver address can be lost or
rotated) and is admin-gated, not operator-gated — changing where money goes is
not a routine gateway write.

## RevenueDistributor atomicity

The Bible requires all parties paid or none. The implementation is
atomic-by-revert: each of the five legs is a push via low-level `call`, and any
failed leg reverts the entire transaction (`PayoutFailed`). There is no partial
path and no "settle the rest later" escrow, so no observer can ever see three
of five parties paid.

Dust from integer division goes to the platform leg, which is computed as
`msg.value - (sum of the other four)` rather than from its bps, so the legs sum
to `msg.value` exactly and no wei is ever stranded in the contract. A fuzz test
asserts this across the whole value range.

**Known trade-off (documented in the contract):** one unpayable recipient — a
contract wallet whose `receive()` reverts — blocks that artwork's sales until
the gateway updates the address. That is the intended failure mode: a refused
sale beats a half-executed one. A pull-escrow fallback would weaken the
all-or-none guarantee and is not worth adding unless the failure is actually
observed.

A party with 0 bps may legitimately have the zero address (a sale with no
curator). A *nonzero* amount to the zero address is a misconfiguration and
reverts.

## §118 controls

All five contracts inherit `ArtwallUpgradeable`, so the controls exist once:

- **Multisig-ready ownership** — `DEFAULT_ADMIN_ROLE` is set at `initialize()`
  to whatever address is passed (a Safe in production), never implicitly to the
  deployer.
- **Role separation** — `DEFAULT_ADMIN_ROLE` (grants roles, schedules
  upgrades), `PAUSER_ROLE` (incident response only), `OPERATOR_ROLE` (the
  application gateway that writes records). `ExhibitionManager` adds
  `ATTESTOR_ROLE`, `MerkleVerifier` adds `ANCHOR_ROLE`. A compromised operator
  key cannot pause, upgrade or grant roles; a pauser cannot write records.
- **Pause** — every state-writing entrypoint is `whenNotPaused`. Reads,
  including `MerkleVerifier.verifyProof`, stay available during an incident
  pause.
- **Upgrade timelock** — `scheduleUpgrade(impl)` then a `UPGRADE_DELAY` (2
  days) wait before `_authorizeUpgrade` accepts it. The delay is a `constant`,
  not admin-tunable: an admin able to shorten its own timelock is not a
  timelock. Schedules are single-use.
- **Rate / amount caps** — `RevenueDistributor.maxSaleValue` bounds a single
  distribution; `MerkleVerifier` allows one root per day index;
  `ArtworkRegistry.MAX_ROYALTY_BPS` (10%) and
  `WallRegistry.MAX_REVENUE_SHARE_BPS` (50%) bound misconfiguration. These are
  on-chain *backstops* — the real, tunable business numbers live off-chain in
  `commission_policies`.
- **Event monitoring** — every state change emits.

Not done here, and still required before mainnet per §19: external audit,
bug bounty, transaction simulation, contract allowlist. **MVP is testnet.**

## Upgradeability notes

UUPS over `ERC1967Proxy`, OZ v5. Each contract's implementation disables
initializers in its constructor and is initialized through the proxy.

`ArtwallUpgradeable` declares storage, so a subclass must never reorder or
remove its variables across upgrades. New base variables go at the end of the
base contract, above its `__gap`.

`RevenueDistributor` uses OZ's non-upgradeable `ReentrancyGuard`, whose
constructor-set `_status` a proxy never sees. The guard still works — it only
compares against `ENTERED` — the first `distribute()` just pays cold-slot gas.
Not worth vendoring an upgradeable copy.

## Tests

`contracts/test/` has one suite per contract plus `ArtwallUpgradeable.t.sol`,
which covers the shared §118 surface once through `ArtworkRegistry`. The
load-bearing tests:

- `RevenueDistributor.t.sol` — `test_atomicity_oneFailingLegPaysNobody` and
  `test_atomicity_failingPlatformLegUnwindsEarlierPayouts` (the platform leg is
  paid last, so its failure must unwind four successful transfers), plus a fuzz
  test that every wei is accounted for.
- `ExhibitionManager.t.sol` — the §119 gate: unattested artwork rejected,
  expired attestation rejected, revoked attestation blocks activation.
- `MerkleVerifier.t.sol` — valid proof, forged leaf, tampered proof, truncated
  proof, unanchored root reverts rather than returning false.
- `ArtworkRegistry.t.sol` / `WallRegistry.t.sol` — append-only history, tag
  cannot be rebound, caps, role gating.

Run with `cd contracts && forge build && forge test`.
