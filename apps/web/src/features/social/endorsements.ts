"use server";

import { revalidatePath } from "next/cache";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/lib/db/index";
import { artistEndorsements, artistProfiles, curators, user } from "@/lib/db/schema";
import { getSessionUser } from "@/lib/session";
import { enforcePolicy } from "@/features/orders/rate-limit";
import {
  attempt,
  newId,
  parseInput,
  PreconditionError,
  readSafely,
  type Result,
} from "@/features/physical-wall/actions/shared";

/**
 * Peer and curator verification of artists.
 *
 * This is a REPUTATION signal and is deliberately not `user.identityVerified`,
 * which is an admin's check of identity documents. Conflating the two would
 * let a popular artist appear document-verified, or a document-verified artist
 * appear peer-endorsed, neither of which is true. They are separate axes and
 * both are shown separately on the profile.
 *
 * Who may endorse, and what it is worth:
 *   - 'peer'    — any artist with a PUBLISHED profile. Three of these promote
 *                 an artist to 'peer_verified'.
 *   - 'curator' — any ACTIVE curator. One is enough for 'curator_verified',
 *                 which outranks any number of peers.
 *
 * The thresholds live here, in one place, because they are a product rule that
 * will be tuned — not a database constraint.
 */

/** Peer endorsements needed before an artist counts as peer-verified. */
const PEER_THRESHOLD = 3;

const id = z.string().trim().min(1).max(64);

const endorseSchema = z.object({
  artistId: id,
  note: z.string().trim().max(500, "Keep a note under 500 characters.").optional(),
});

export type VerificationStatus = "unverified" | "peer_verified" | "curator_verified";

/**
 * Work out what the endorser is entitled to be, from their own records.
 *
 * Never taken from the client: a 'curator' endorsement is worth far more than
 * a peer one, so letting the caller name its own kind would be a trivial way
 * to self-promote an artist to curator_verified.
 */
async function resolveEndorserKind(endorserId: string): Promise<"peer" | "curator"> {
  const [activeCurator] = await db
    .select({ id: curators.id })
    .from(curators)
    .where(and(eq(curators.userId, endorserId), eq(curators.status, "active")))
    .limit(1);
  if (activeCurator) return "curator";

  const [publishedArtist] = await db
    .select({ userId: artistProfiles.userId })
    .from(artistProfiles)
    .where(and(eq(artistProfiles.userId, endorserId), eq(artistProfiles.published, true)))
    .limit(1);
  if (publishedArtist) return "peer";

  throw new PreconditionError(
    "Only published artists and active curators can endorse an artist."
  );
}

/**
 * Recompute and store the artist's derived status.
 *
 * Always derived from the rows, never incremented: an increment drifts the
 * moment an endorsement is withdrawn or an endorser's own profile is
 * unpublished. Cheap enough to redo in full — an artist has tens of
 * endorsements, not thousands.
 */
async function recomputeStatus(artistId: string): Promise<VerificationStatus> {
  const rows = await db
    .select({ kind: artistEndorsements.kind })
    .from(artistEndorsements)
    .where(eq(artistEndorsements.artistId, artistId));

  const curatorCount = rows.filter((r) => r.kind === "curator").length;
  const peerCount = rows.filter((r) => r.kind === "peer").length;

  const status: VerificationStatus =
    curatorCount > 0
      ? "curator_verified"
      : peerCount >= PEER_THRESHOLD
        ? "peer_verified"
        : "unverified";

  await db
    .update(artistProfiles)
    .set({ verificationStatus: status })
    .where(eq(artistProfiles.userId, artistId));

  return status;
}

/**
 * Endorse an artist.
 *
 * Idempotent per endorser: a second endorsement updates the note rather than
 * counting twice (enforced by the unique (artist_id, endorser_id) index too).
 */
export async function endorseArtist(input: {
  artistId: string;
  note?: string;
}): Promise<Result<{ status: VerificationStatus }>> {
  return attempt("endorseArtist", async () => {
    const { artistId, note } = parseInput(endorseSchema, input);

    const actor = await getSessionUser();
    if (!actor) throw new PreconditionError("Sign in first.");
    if (actor.id === artistId) throw new PreconditionError("You cannot endorse yourself.");
    // Tightest social policy: these feed a verification status, so automated
    // abuse here is reputational rather than cosmetic.
    await enforcePolicy("endorsement", actor.id);

    const [target] = await db
      .select({ handle: artistProfiles.handle })
      .from(artistProfiles)
      .where(eq(artistProfiles.userId, artistId))
      .limit(1);
    if (!target) throw new PreconditionError("That artist does not have a profile.");

    const kind = await resolveEndorserKind(actor.id);

    await db
      .insert(artistEndorsements)
      .values({
        id: newId("end"),
        artistId,
        endorserId: actor.id,
        kind,
        note: note ?? null,
      })
      .onConflictDoUpdate({
        target: [artistEndorsements.artistId, artistEndorsements.endorserId],
        // Refresh the kind too: an endorser who has since become a curator
        // should have their existing endorsement count at its new weight.
        set: { kind, note: note ?? null },
      });

    const status = await recomputeStatus(artistId);
    revalidatePath(`/artist/${target.handle}`);
    return { status };
  });
}

/** Withdraw an endorsement. The artist's status is recomputed, so it can fall. */
export async function withdrawEndorsement(
  artistId: string
): Promise<Result<{ status: VerificationStatus }>> {
  return attempt("withdrawEndorsement", async () => {
    const input = parseInput(id, artistId);

    const actor = await getSessionUser();
    if (!actor) throw new PreconditionError("Sign in first.");
    // Withdraw is limited too: endorse/withdraw in a loop would otherwise be
    // an unmetered way to churn an artist's status.
    await enforcePolicy("endorsement", actor.id);

    await db
      .delete(artistEndorsements)
      .where(
        and(
          eq(artistEndorsements.artistId, input),
          eq(artistEndorsements.endorserId, actor.id)
        )
      );

    const status = await recomputeStatus(input);

    const [target] = await db
      .select({ handle: artistProfiles.handle })
      .from(artistProfiles)
      .where(eq(artistProfiles.userId, input))
      .limit(1);
    if (target) revalidatePath(`/artist/${target.handle}`);

    return { status };
  });
}

export interface EndorsementView {
  id: string;
  kind: "peer" | "curator";
  note: string | null;
  endorserId: string;
  endorserName: string;
  endorserHandle: string | null;
  createdAt: Date;
}

export interface ArtistVerification {
  status: VerificationStatus;
  peerCount: number;
  curatorCount: number;
  /** How many more peers would tip an unverified artist over. 0 once verified. */
  peersNeeded: number;
  endorsements: EndorsementView[];
  viewerHasEndorsed: boolean;
  /** Whether the viewer is eligible to endorse at all (and is not the artist). */
  viewerCanEndorse: boolean;
}

/** Everything the profile's verification panel needs, in one read. */
export async function getArtistVerification(artistId: string): Promise<ArtistVerification> {
  const empty: ArtistVerification = {
    status: "unverified",
    peerCount: 0,
    curatorCount: 0,
    peersNeeded: PEER_THRESHOLD,
    endorsements: [],
    viewerHasEndorsed: false,
    viewerCanEndorse: false,
  };

  return readSafely("getArtistVerification", empty, async () => {
    const input = parseInput(id, artistId);
    const viewer = await getSessionUser();

    const rows = await db
      .select({
        id: artistEndorsements.id,
        kind: artistEndorsements.kind,
        note: artistEndorsements.note,
        createdAt: artistEndorsements.createdAt,
        endorserId: artistEndorsements.endorserId,
        endorserName: user.name,
        endorserHandle: artistProfiles.handle,
      })
      .from(artistEndorsements)
      .leftJoin(user, eq(user.id, artistEndorsements.endorserId))
      .leftJoin(artistProfiles, eq(artistProfiles.userId, artistEndorsements.endorserId))
      .where(eq(artistEndorsements.artistId, input))
      .orderBy(desc(artistEndorsements.createdAt))
      .limit(100);

    const peerCount = rows.filter((r) => r.kind === "peer").length;
    const curatorCount = rows.filter((r) => r.kind === "curator").length;
    const status: VerificationStatus =
      curatorCount > 0
        ? "curator_verified"
        : peerCount >= PEER_THRESHOLD
          ? "peer_verified"
          : "unverified";

    let viewerCanEndorse = false;
    if (viewer && viewer.id !== input) {
      // resolveEndorserKind throws for an ineligible viewer; here that is a
      // normal "no button for you", not an error worth logging.
      viewerCanEndorse = await resolveEndorserKind(viewer.id).then(
        () => true,
        () => false
      );
    }

    return {
      status,
      peerCount,
      curatorCount,
      peersNeeded: status === "unverified" ? Math.max(0, PEER_THRESHOLD - peerCount) : 0,
      endorsements: rows.map((row) => ({
        id: row.id,
        kind: row.kind as "peer" | "curator",
        note: row.note,
        endorserId: row.endorserId,
        endorserName: row.endorserName ?? "An ArtWall member",
        endorserHandle: row.endorserHandle,
        createdAt: row.createdAt,
      })),
      viewerHasEndorsed: viewer ? rows.some((r) => r.endorserId === viewer.id) : false,
      viewerCanEndorse,
    };
  });
}
