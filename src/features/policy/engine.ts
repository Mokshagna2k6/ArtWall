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

/** The five independent trust dimensions (Bible section 3-11). */
export interface TrustDimensions {
  /** Artist identity verified (DigiLocker / manual review). */
  identityVerified: boolean;
  /** The physical object is cryptographically bound to this artwork record
   *  (NFC/QR tag bound, B-level per Bible section 14). */
  physicalBindingVerified: boolean;
  /** Blockchain provenance anchored: a mint or a merkle-root commitment is
   *  confirmed on-chain for this artwork. */
  blockchainAnchored: boolean;
  /** A Certificate of Authenticity has been issued (COA level >= 1). */
  coaIssued: boolean;
  /** Curator or platform review has approved the artwork for public listing. */
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

/**
 * BE-3.04: the section-14 hard gate. An artwork is exhibitable only when
 * BOTH physical binding is verified AND blockchain provenance is anchored —
 * this is a literal AND, not "either dimension is enough". Identity, COA and
 * curation are not part of this specific gate; they gate other operations.
 */
export function canExhibit(facts: ExhibitFacts): Decision {
  const reasons: ReasonCode[] = [];
  if (!facts.trust.physicalBindingVerified) reasons.push("PHYSICAL_BINDING_NOT_VERIFIED");
  if (!facts.trust.blockchainAnchored) reasons.push("BLOCKCHAIN_NOT_ANCHORED");
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
