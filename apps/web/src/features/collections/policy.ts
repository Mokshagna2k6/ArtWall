/**
 * Collection authorization gates (section 9 of the Collections spec).
 *
 * Pure decision functions, same shape as src/features/policy/engine.ts's
 * PolicyEngine: no database, no session — callers assemble facts from
 * whatever they already loaded and reject on `allow: false`. This is the one
 * place collection permission logic lives; actions.ts must call these
 * instead of re-deriving role checks inline.
 */

export type CollectionType = "BUYER" | "ARTIST" | "CURATOR";

export interface Decision {
  allow: boolean;
  reason?: string;
}

function decide(reason?: string): Decision {
  return reason ? { allow: false, reason } : { allow: true };
}

/** Only the owner may edit/delete/reorder their own collection, of any type. */
export function canManageCollection(facts: { actorId: string; ownerId: string }): Decision {
  if (facts.actorId !== facts.ownerId) return decide("You can only manage your own collections.");
  return decide();
}

/**
 * Can `actorId` add `artworkOwnerId`'s artwork to a collection of `type`,
 * owned by `ownerId`?
 *   BUYER   — owner must be the actor; the artwork can belong to anyone.
 *   ARTIST  — owner must be the actor AND the artwork must be the actor's own.
 *   CURATOR — owner must be an active curator (checked by the caller before
 *             calling this); the artwork can belong to anyone.
 */
export function canAddArtworkToCollection(facts: {
  actorId: string;
  ownerId: string;
  type: CollectionType;
  artworkOwnerId: string;
}): Decision {
  if (facts.actorId !== facts.ownerId) return decide("You can only add artwork to your own collections.");
  if (facts.type === "ARTIST" && facts.artworkOwnerId !== facts.actorId) {
    return decide("Artist collections can only contain your own artworks.");
  }
  return decide();
}

/** Anonymous/public viewers may only ever see public collections. */
export function canViewCollection(facts: { visibility: "public" | "private"; actorId: string | null; ownerId: string }): Decision {
  if (facts.visibility === "public") return decide();
  if (facts.actorId === facts.ownerId) return decide();
  return decide("This collection is private.");
}
