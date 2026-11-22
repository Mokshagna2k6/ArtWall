/**
 * The artwork state machine, as four orthogonal domains (BE-3.07, Bible
 * section 17-19). `artworks.lifecycle_status`, `commerce_status`,
 * `exhibition_status` and `custody_status` (migration 0047) are independent
 * axes — an artwork can be `published` + `listed` + `on_display` +
 * `at_venue` all at once. Each domain has its own small transition graph and
 * its own assert function, same pattern as
 * src/features/physical-wall/state-machine.ts's slot lifecycle: pure, no
 * database, no session — every real write path goes through `assertX`
 * instead of writing the column directly, so an illegal move is a thrown
 * error, not a silently-accepted write.
 */

export const LIFECYCLE_STATES = ["draft", "published", "archived"] as const;
export type LifecycleStatus = (typeof LIFECYCLE_STATES)[number];
export const LIFECYCLE_TRANSITIONS: Record<LifecycleStatus, readonly LifecycleStatus[]> = {
  draft: ["published", "archived"],
  published: ["archived", "draft"],
  archived: ["draft"],
};

export const COMMERCE_STATES = ["unlisted", "listed", "sold", "withdrawn"] as const;
export type CommerceStatus = (typeof COMMERCE_STATES)[number];
export const COMMERCE_TRANSITIONS: Record<CommerceStatus, readonly CommerceStatus[]> = {
  unlisted: ["listed"],
  listed: ["sold", "withdrawn"],
  sold: [],
  withdrawn: ["unlisted"],
};

export const EXHIBITION_STATES = ["not_exhibited", "scheduled", "on_display", "returned"] as const;
export type ExhibitionStatus = (typeof EXHIBITION_STATES)[number];
export const EXHIBITION_TRANSITIONS: Record<ExhibitionStatus, readonly ExhibitionStatus[]> = {
  // not_exhibited -> on_display direct: this codebase's exhibitions have no
  // separate "scheduled" step today (publishExhibition goes straight live),
  // so that transition is real; "scheduled" stays modelled for a future
  // slice that adds a lead time between curation and going live.
  not_exhibited: ["scheduled", "on_display"],
  scheduled: ["on_display", "not_exhibited"],
  on_display: ["returned"],
  returned: ["not_exhibited", "scheduled"],
};

export const CUSTODY_STATES = ["with_artist", "in_transit", "at_venue", "returned_to_artist"] as const;
export type CustodyStatus = (typeof CUSTODY_STATES)[number];
export const CUSTODY_TRANSITIONS: Record<CustodyStatus, readonly CustodyStatus[]> = {
  with_artist: ["in_transit"],
  in_transit: ["at_venue", "returned_to_artist"],
  at_venue: ["in_transit"],
  returned_to_artist: ["with_artist"],
};

export type ArtworkDomain = "lifecycle" | "commerce" | "exhibition" | "custody";

const DOMAIN_TRANSITIONS: Record<ArtworkDomain, Record<string, readonly string[]>> = {
  lifecycle: LIFECYCLE_TRANSITIONS,
  commerce: COMMERCE_TRANSITIONS,
  exhibition: EXHIBITION_TRANSITIONS,
  custody: CUSTODY_TRANSITIONS,
};

export class IllegalArtworkTransitionError extends Error {
  readonly status = 409;
  constructor(
    readonly domain: ArtworkDomain,
    readonly from: string,
    readonly to: string
  ) {
    super(`An artwork's ${domain} status cannot move from ${from} to ${to}.`);
    this.name = "IllegalArtworkTransitionError";
  }
}

export function canTransitionArtwork(domain: ArtworkDomain, from: string, to: string): boolean {
  return (DOMAIN_TRANSITIONS[domain][from] ?? []).includes(to);
}

/** Guard a domain state change, or throw. Same no-op-is-fine convention as
 *  the slot machine: moving to the state already in place is left to the
 *  caller to decide whether that's worth a no-op short-circuit. */
export function assertArtworkTransition(domain: ArtworkDomain, from: string, to: string): void {
  if (!canTransitionArtwork(domain, from, to)) {
    throw new IllegalArtworkTransitionError(domain, from, to);
  }
}
