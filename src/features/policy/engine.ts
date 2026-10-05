/**
 * The PolicyEngine (BE-3.01, BE-3.02, BE-3.04, BE-3.05).
 *
 * The single backend gate for every eligibility decision — "can this artwork
 * be published / exhibited / sold / listed / minted, right now, by this
 * actor". Every server action and API route that performs a gated operation
 * must call one of these functions and reject on `allow: false` (BE-3.03).
 *
 * Deliberately pure — no database, no session, no `server-only`. That is what
 * makes the Master Eligibility Matrix (BE-3.02) testable cell-by-cell without
 * a connection, and it is what the other three Phase 3 tracks build against:
 * a gate function is a pure `(inputs) => Decision`, so callers just need to
 * assemble `EligibilityInputs` from whatever they already have in hand.
 *
 * Inputs come from the five independent trust dimensions (Bible section 3-11,
 * DB-3.01) — never from one collapsed "status" column. DB-3.01 (the Database
 * Phase 3 track) is expected to land the canonical loader that reads these
 * five dimensions out of Postgres; until then, callers assemble
 * `TrustDimensions` from whatever columns already exist (see
 * docs/policy-engine.md for today's best-effort mapping). The shape of
 * `TrustDimensions` is the contract — populating it correctly is a separate,
 * follow-on concern from gating on it correctly.
 */

/**
 * BC-3.08: blockchain provenance level, computed from actual on-chain
 * state (src/features/policy/levels.ts's computeProvenanceLevel) —
 *   P0 none            — no COA, no mint commitment
 *   P1 coa_issued       — a COA exists (off-chain certificate)
 *   P2 commitment_pending — a mint_commitments row exists but isn't on-chain yet
 *   P3 anchored         — the commitment's merkle root is confirmed on-chain
 *   P4 minted           — a full certificate NFT is minted and confirmed
 */
export type ProvenanceLevel = "P0" | "P1" | "P2" | "P3" | "P4";

/**
 * BC-3.12: physical binding level, computed from the cryptographic tag
 * verification state (levels.ts's computeBindingLevel) —
 *   B0 unbound    — no tag bound to this artwork
 *   B1 provisioned — a tag is bound, but no crypto-verified scan has ever
 *                    succeeded for it (just-installed, not yet confirmed live)
 *   B2 bound       — ownership-verified binding recorded in provenance
 *   B3 verified    — at least one real SUN (NFC) or signed-QR scan has
 *                    verified cryptographically against this tag
 */
export type BindingLevel = "B0" | "B1" | "B2" | "B3";

/** The five independent trust dimensions (Bible section 3-11). */
export interface TrustDimensions {
  /** Artist identity verified (DigiLocker / manual review). */
  identityVerified: boolean;
  /** The physical object is cryptographically bound to this artwork record
   *  (NFC/QR tag bound, B-level per Bible section 14). Derived from
   *  `bindingLevel >= B2`; kept for callers that only need a boolean. */
  physicalBindingVerified: boolean;
  /** Blockchain provenance anchored: a mint or a merkle-root commitment is
   *  confirmed on-chain for this artwork. Derived from
   *  `provenanceLevel >= P3`; kept for callers that only need a boolean. */
  blockchainAnchored: boolean;
  /** A Certificate of Authenticity has been issued (COA level >= 1). */
  coaIssued: boolean;
  /** Curator or platform review has approved the artwork for public listing. */
  curationApproved: boolean;
  /** BC-3.08: the granular on-chain provenance level. Optional so existing
   *  callers assembling only the boolean dimensions keep compiling — a gate
   *  that needs granularity (canExhibit) falls back to the boolean when this
   *  is absent, same effective behavior as before BC-3.08/3.12 landed. */
  provenanceLevel?: ProvenanceLevel;
  /** BC-3.12: the granular physical binding level. Same optionality reasoning. */
  bindingLevel?: BindingLevel;
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

function decide(reasons: ReasonCode[]): Decision {
  return { allow: reasons.length === 0, reasons };
}

/** Extra, operation-specific facts a gate needs beyond the trust dimensions. */
export interface PublishFacts {
  hasTitle: boolean;
  hasImage: boolean;
}
export interface ExhibitFacts {
  trust: TrustDimensions;
}
export interface SecondarySellFacts {
  trust: TrustDimensions;
  isPublished: boolean;
}
export interface ListFacts {
  trust: TrustDimensions;
  isPublished: boolean;
  alreadyListed: boolean;
}
export interface MintFacts {
  trust: TrustDimensions;
  alreadyMinted: boolean;
}

/** BE-3.01: an artwork is publishable once it has the minimum content. */
export function canPublishArtwork(facts: PublishFacts): Decision {
  const reasons: ReasonCode[] = [];
  if (!facts.hasTitle || !facts.hasImage) reasons.push("ARTWORK_NOT_PUBLISHED");
  return decide(reasons);
}

const PROVENANCE_RANK: Record<ProvenanceLevel, number> = { P0: 0, P1: 1, P2: 2, P3: 3, P4: 4 };
const BINDING_RANK: Record<BindingLevel, number> = { B0: 0, B1: 1, B2: 2, B3: 3 };

/**
 * BE-3.04/BC-3.15: the section-14 hard gate. An artwork is exhibitable only
 * when BOTH physical binding is verified AND blockchain provenance is
 * anchored — this is a literal AND, not "either dimension is enough".
 * Identity, COA and curation are not part of this specific gate; they gate
 * other operations.
 *
 * BC-3.15: when the caller supplies the granular `provenanceLevel`/
 * `bindingLevel` (BC-3.08/3.12's real on-chain/crypto-verification state),
 * this gate requires `provenanceLevel >= P3` (anchored on-chain, not merely
 * a pending commitment) and `bindingLevel >= B2` (an ownership-verified
 * binding, not just a tag installed with no confirmed scan) — strictly
 * stronger than the plain booleans, which only ask "does a row exist".
 * Falls back to the booleans when a caller hasn't wired the granular
 * loader yet, so this stays backward compatible rather than breaking every
 * existing caller in one commit.
 */
export function canExhibit(facts: ExhibitFacts): Decision {
  const reasons: ReasonCode[] = [];
  const { trust } = facts;

  const bindingOk = trust.bindingLevel
    ? BINDING_RANK[trust.bindingLevel] >= BINDING_RANK.B2
    : trust.physicalBindingVerified;
  const provenanceOk = trust.provenanceLevel
    ? PROVENANCE_RANK[trust.provenanceLevel] >= PROVENANCE_RANK.P3
    : trust.blockchainAnchored;

  if (!bindingOk) reasons.push("PHYSICAL_BINDING_NOT_VERIFIED");
  if (!provenanceOk) reasons.push("BLOCKCHAIN_NOT_ANCHORED");
  return decide(reasons);
}

/** BE-3.02: secondary sale requires a published, identity-verified, COA'd work. */
export function canSecondarySell(facts: SecondarySellFacts): Decision {
  const reasons: ReasonCode[] = [];
  if (!facts.isPublished) reasons.push("ARTWORK_NOT_PUBLISHED");
  if (!facts.trust.identityVerified) reasons.push("IDENTITY_NOT_VERIFIED");
  if (!facts.trust.coaIssued) reasons.push("COA_NOT_ISSUED");
  return decide(reasons);
}

/** BE-3.02: marketplace listing requires publish + identity + curation sign-off. */
export function canList(facts: ListFacts): Decision {
  const reasons: ReasonCode[] = [];
  if (!facts.isPublished) reasons.push("ARTWORK_NOT_PUBLISHED");
  if (!facts.trust.identityVerified) reasons.push("IDENTITY_NOT_VERIFIED");
  if (!facts.trust.curationApproved) reasons.push("CURATION_NOT_APPROVED");
  if (facts.alreadyListed) reasons.push("ALREADY_LISTED");
  return decide(reasons);
}

/** BE-3.02: minting requires identity + COA, and is one-shot per artwork/edition. */
export function canMint(facts: MintFacts): Decision {
  const reasons: ReasonCode[] = [];
  if (!facts.trust.identityVerified) reasons.push("IDENTITY_NOT_VERIFIED");
  if (!facts.trust.coaIssued) reasons.push("COA_NOT_ISSUED");
  if (facts.alreadyMinted) reasons.push("ALREADY_MINTED");
  return decide(reasons);
}
