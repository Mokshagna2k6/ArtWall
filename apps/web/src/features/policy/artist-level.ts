/**
 * Bible §4: the artist verification ladder A0-A4, as ONE derived, public-facing
 * summary level.
 *
 * Pure on purpose (no db, no `server-only`): it reads nothing, it only folds
 * facts that already have owners elsewhere —
 *
 *   identity  -> `user.identityVerified` / `user.artistVerificationStatus`
 *   portfolio -> `artist_profiles.published` (today's proxy for "a human
 *                reviewed this portfolio"; publishing is the review step)
 *   peer      -> `artist_profiles.verification_status === 'peer_verified'`
 *   curator   -> `artist_profiles.verification_status === 'curator_verified'`
 *                — both computed by features/social/endorsements.ts, which
 *                owns the thresholds. Never redefined here.
 *
 * Two Bible rules constrain this file, and both are the reason it is a
 * display-only helper rather than an input to anything:
 *
 *   §3 — the five trust dimensions must never collapse into one "Verified".
 *        This level is a SUMMARY shown ALONGSIDE the dimensions, never in
 *        place of them.
 *   §5 — "Artist verification never automatically means every artwork is
 *        authentic or documented." So the A-level is deliberately NOT wired
 *        into canExhibit/canList/canMint, and must not be: those gates read
 *        the artwork's own dimensions.
 *
 * The ladder is CUMULATIVE. Each rung requires every rung below it, so peer
 * endorsements on an artist who has never passed an identity check do not
 * reach A3 — they stay at A0. That is the whole point of the function.
 */

/** A0-A4 (Bible §4). */
export type ArtistLevel = "A0" | "A1" | "A2" | "A3" | "A4";

/** The three independent axes the ladder folds, in the form the DB holds them. */
export interface ArtistLevelInputs {
  /** `user.identityVerified` — an admin's document check. */
  identityVerified: boolean;
  /** `user.artistVerificationStatus`: unverified | pending | approved | rejected.
   *  Only 'approved' counts, and only as an alternative route to the identity
   *  axis — the two share a write path, but a legacy row can have one without
   *  the other. */
  artistVerificationStatus: string | null;
  /** `artist_profiles.published` — portfolio review proxy. */
  portfolioPublished: boolean;
  /** `artist_profiles.verification_status` from endorsements.ts. */
  endorsementStatus: "unverified" | "peer_verified" | "curator_verified" | string | null;
}

export interface ArtistLevelSummary {
  level: ArtistLevel;
  /** Short public label, e.g. "Portfolio verified". */
  label: string;
  /** Which rungs are satisfied, so the UI can show the ladder, not just the top. */
  identity: boolean;
  portfolio: boolean;
  peer: boolean;
  curator: boolean;
  /** The next rung's name, or null at A4. Drives "what's missing" copy. */
  nextStep: string | null;
}

export const ARTIST_LEVEL_LABELS: Record<ArtistLevel, string> = {
  A0: "Unverified",
  A1: "Identity verified",
  A2: "Portfolio verified",
  A3: "Community verified",
  A4: "Curator verified",
};

/**
 * Derive the artist's single A-level.
 *
 * | identity | portfolio | peer | curator | level |
 * |----------|-----------|------|---------|-------|
 * | no       | any       | any  | any     | A0    |
 * | yes      | no        | any  | any     | A1    |
 * | yes      | yes       | no   | any     | A2    |
 * | yes      | yes       | yes  | no      | A3    |
 * | yes      | yes       | yes  | yes     | A4    |
 *
 * `curator` implies `peer` for laddering purposes: a curator endorsement
 * outranks peers in endorsements.ts, which stores one status, not two counts,
 * so 'curator_verified' is read as satisfying the community rung as well.
 */
export function deriveArtistLevel(inputs: ArtistLevelInputs): ArtistLevelSummary {
  const identity = inputs.identityVerified || inputs.artistVerificationStatus === "approved";
  const portfolio = inputs.portfolioPublished;
  const curator = inputs.endorsementStatus === "curator_verified";
  const peer = curator || inputs.endorsementStatus === "peer_verified";

  const level: ArtistLevel = !identity
    ? "A0"
    : !portfolio
      ? "A1"
      : !peer
        ? "A2"
        : !curator
          ? "A3"
          : "A4";

  const nextStep =
    level === "A0"
      ? "Identity verification"
      : level === "A1"
        ? "Portfolio review"
        : level === "A2"
          ? "Peer endorsement"
          : level === "A3"
            ? "Curator review"
            : null;

  return {
    level,
    label: ARTIST_LEVEL_LABELS[level],
    identity,
    portfolio,
    peer,
    curator,
    nextStep,
  };
}
