"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { eq, and, desc } from "drizzle-orm";
import { z } from "zod";

import { auth } from "@/lib/auth";
import { expireCatalog, getCertificateForVerify } from "@/lib/catalog-cache";
import { db } from "@/lib/db/index";
import {
  artworks,
  editions,
  coaCertificates,
  provenanceEvents,
  mintCommitments,
  artistProfiles,
} from "@/lib/db/schema";
import { computeMetadataHash, computeLeafHash } from "@/features/coa/hash";
import { archiveCertificatePdf } from "@/features/coa/pdf-service";
import { getActiveCommissionPolicy } from "@/features/policy/commission";
import {
  attempt,
  parseInput,
  PreconditionError,
  readSafely,
  type Result,
} from "@/features/physical-wall/actions/shared";

async function getUserId() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) throw new PreconditionError("Sign in first.");
  return session.user.id;
}

function newId(prefix: string): string {
  const bytes = new Uint8Array(9);
  crypto.getRandomValues(bytes);
  return `${prefix}_${Buffer.from(bytes).toString("base64url")}`;
}

const id = z.string().trim().min(1).max(128);

/* ── Editions ────────────────────────────────────────────────────────────── */

export async function getEditions() {
  return readSafely("getEditions", [], async () => {
    const userId = await getUserId();
    return db
      .select({
        id: editions.id,
        artworkId: editions.artworkId,
        editionType: editions.editionType,
        editionNumber: editions.editionNumber,
        totalEditions: editions.totalEditions,
        isAp: editions.isAp,
        status: editions.status,
        createdAt: editions.createdAt,
        artworkTitle: artworks.title,
        artworkImage: artworks.imageUrl,
      })
      .from(editions)
      .innerJoin(artworks, eq(editions.artworkId, artworks.id))
      .where(eq(editions.userId, userId))
      .orderBy(desc(editions.createdAt));
  });
}

const editionSchema = z
  .object({
    artworkId: id,
    editionType: z.enum(["unique", "limited", "open"]),
    totalEditions: z.number().int().min(1).max(10_000).optional(),
    isAp: z.boolean().optional(),
  })
  .refine((e) => e.editionType !== "limited" || e.totalEditions, {
    message: "A limited edition needs a size.",
  });

export async function createEdition(raw: z.input<typeof editionSchema>): Promise<Result<string>> {
  return attempt("createEdition", async () => {
    const input = parseInput(editionSchema, raw);
    const userId = await getUserId();
    const [artwork] = await db
      .select({ id: artworks.id })
      .from(artworks)
      .where(and(eq(artworks.id, input.artworkId), eq(artworks.userId, userId)));
    if (!artwork) throw new PreconditionError("Artwork not found");

    const editionId = newId("ed");
    await db.insert(editions).values({
      id: editionId,
      artworkId: input.artworkId,
      userId,
      editionType: input.editionType,
      totalEditions: input.editionType === "limited" ? input.totalEditions : null,
      isAp: input.isAp ?? false,
      status: "active",
    });

    revalidatePath("/studio/editions");
    return editionId;
  });
}

/* ── Certificates ────────────────────────────────────────────────────────── */

export async function getCertificates() {
  return readSafely("getCertificates", [], async () => {
    const userId = await getUserId();
    return db
      .select({
        id: coaCertificates.id,
        artworkId: coaCertificates.artworkId,
        metadataHash: coaCertificates.metadataHash,
        status: coaCertificates.status,
        issuedAt: coaCertificates.issuedAt,
        createdAt: coaCertificates.createdAt,
        artworkTitle: artworks.title,
        artworkImage: artworks.imageUrl,
      })
      .from(coaCertificates)
      .innerJoin(artworks, eq(coaCertificates.artworkId, artworks.id))
      .where(eq(coaCertificates.userId, userId))
      .orderBy(desc(coaCertificates.createdAt));
  });
}

export async function issueCertificate(
  artworkId: string,
  editionId?: string
): Promise<Result<{ id: string; hash: string }>> {
  return attempt("issueCertificate", async () => {
    const input = parseInput(z.object({ artworkId: id, editionId: id.optional() }), { artworkId, editionId });
    const userId = await getUserId();
    const [artwork] = await db
      .select()
      .from(artworks)
      .where(and(eq(artworks.id, input.artworkId), eq(artworks.userId, userId)));
    if (!artwork) throw new PreconditionError("Artwork not found");

    const [profile] = await db
      .select({ displayName: artistProfiles.displayName })
      .from(artistProfiles)
      .where(eq(artistProfiles.userId, userId));

    const hash = computeMetadataHash({
      title: artwork.title,
      artist: profile?.displayName ?? "Unknown",
      medium: artwork.medium,
      dimensions: artwork.dimensions,
      year: artwork.year,
      imagePublicId: artwork.imagePublicId,
    });

    const certId = newId("coa");
    await db.insert(coaCertificates).values({
      id: certId,
      artworkId: input.artworkId,
      editionId: input.editionId ?? null,
      userId,
      metadataHash: hash,
      status: "issued",
      issuedAt: new Date(),
    });

    await db.insert(provenanceEvents).values({
      id: newId("prov"),
      artworkId: input.artworkId,
      eventType: "certified",
      actorId: userId,
      label: `Certificate of Authenticity issued`,
      metadata: { certificateId: certId, metadataHash: hash },
    });

    // Archive the PDF after the response; it never throws, so issuance cannot fail on it.
    try {
      after(() => archiveCertificatePdf(certId));
    } catch {
      // Outside a request scope (tests/scripts): skip; the PDF route archives on demand.
    }
    expireCatalog();
    revalidatePath("/studio/certificates");
    return { id: certId, hash };
  });
}

export async function revokeCertificate(certId: string, reason: string): Promise<Result> {
  return attempt("revokeCertificate", async () => {
    const input = parseInput(
      z.object({ certId: id, reason: z.string({ error: "Give a reason." }).trim().min(1, "Give a reason.").max(500) }),
      { certId, reason }
    );
    const userId = await getUserId();
    const [cert] = await db
      .select()
      .from(coaCertificates)
      .where(and(eq(coaCertificates.id, input.certId), eq(coaCertificates.userId, userId)));
    if (!cert) throw new PreconditionError("Certificate not found");
    if (cert.status === "revoked") throw new PreconditionError("Already revoked");

    await db
      .update(coaCertificates)
      .set({ status: "revoked", revokedAt: new Date(), revokeReason: input.reason })
      .where(eq(coaCertificates.id, input.certId));

    // A revoked certificate must stop verifying as issued immediately (PERF-2.07).
    expireCatalog();
    revalidatePath("/studio/certificates");
    return null;
  });
}

/* ── Provenance ──────────────────────────────────────────────────────────── */

export async function getProvenance(artworkId?: string) {
  return readSafely("getProvenance", [], async () => {
    const artId = parseInput(id.optional(), artworkId);
    const userId = await getUserId();
    return db
      .select({
        id: provenanceEvents.id,
        artworkId: provenanceEvents.artworkId,
        eventType: provenanceEvents.eventType,
        label: provenanceEvents.label,
        metadata: provenanceEvents.metadata,
        txHash: provenanceEvents.txHash,
        occurredAt: provenanceEvents.occurredAt,
        artworkTitle: artworks.title,
      })
      .from(provenanceEvents)
      .innerJoin(artworks, eq(provenanceEvents.artworkId, artworks.id))
      .where(
        artId
          ? and(eq(artworks.userId, userId), eq(provenanceEvents.artworkId, artId))
          : eq(artworks.userId, userId)
      )
      .orderBy(desc(provenanceEvents.occurredAt));
  });
}

const provenanceSchema = z.object({
  artworkId: id,
  // What an artist may record by hand; certified/bound/minted are written by the system.
  eventType: z.enum(["created", "exhibited", "sold", "transferred"], { error: "Choose an event type." }),
  label: z.string({ error: "Describe the event." }).trim().min(1, "Describe the event.").max(300),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export async function addProvenanceEvent(raw: z.input<typeof provenanceSchema>): Promise<Result<string>> {
  return attempt("addProvenanceEvent", async () => {
    const input = parseInput(provenanceSchema, raw);
    const userId = await getUserId();
    const [artwork] = await db
      .select({ id: artworks.id })
      .from(artworks)
      .where(and(eq(artworks.id, input.artworkId), eq(artworks.userId, userId)));
    if (!artwork) throw new PreconditionError("Artwork not found");

    const eventId = newId("prov");
    await db.insert(provenanceEvents).values({
      id: eventId,
      artworkId: input.artworkId,
      eventType: input.eventType,
      actorId: userId,
      label: input.label,
      metadata: input.metadata ?? null,
    });

    expireCatalog();
    revalidatePath("/studio/provenance");
    return eventId;
  });
}

/* ── Mint Commitments ────────────────────────────────────────────────────── */

export async function createMintCommitment(artworkId: string): Promise<Result<{ id: string; leafHash: string }>> {
  return attempt("createMintCommitment", async () => {
    const artId = parseInput(id, artworkId);
    const userId = await getUserId();
    const [cert] = await db
      .select()
      .from(coaCertificates)
      .where(and(eq(coaCertificates.artworkId, artId), eq(coaCertificates.userId, userId)));
    if (!cert) throw new PreconditionError("Issue a certificate first");

    const [profile] = await db
      .select({ walletAddress: artistProfiles.walletAddress })
      .from(artistProfiles)
      .where(eq(artistProfiles.userId, userId));

    // The wallet is both the mint recipient and the ERC-2981 royalty receiver.
    // Never fall back to the zero address: tokens and royalties sent there are burned.
    const wallet = profile?.walletAddress?.trim() ?? "";
    if (!/^0x[0-9a-fA-F]{40}$/.test(wallet) || /^0x0{40}$/.test(wallet)) {
      throw new PreconditionError("Connect a wallet before minting: it receives the token and your royalties.");
    }
    const royaltyBps = (await getActiveCommissionPolicy("mint_royalty")).rateBps;
    const leafHash = computeLeafHash({
      artworkId: artId,
      metadataHash: cert.metadataHash,
      walletAddress: wallet,
      royaltyBps,
    });

    const commitmentId = newId("mint");
    await db.insert(mintCommitments).values({
      id: commitmentId,
      artworkId: artId,
      editionId: cert.editionId,
      userId,
      leafHash,
      walletAddress: wallet,
      erc2981RoyaltyBps: royaltyBps,
      status: "pending",
    });

    await db.insert(provenanceEvents).values({
      id: newId("prov"),
      artworkId: artId,
      eventType: "bound",
      actorId: userId,
      label: "Mint commitment created",
      metadata: { mintCommitmentId: commitmentId, leafHash },
    });

    expireCatalog();
    revalidatePath("/studio/certificates");
    return { id: commitmentId, leafHash };
  });
}

/* ── Public verify ───────────────────────────────────────────────────────── */

export async function verifyCertificateByHash(hash: string) {
  return readSafely("verifyCertificateByHash", null, async () => {
    const key = parseInput(id, hash);
    // The certificate itself comes from the shared catalogue cache (PERF-2.07);
    // only the viewer check below is per request.
    const cert = await getCertificateForVerify(key);
    if (!cert) return null;

    // Callable as a public server action, so never hand back the owner's user id;
    // just whether the current viewer is that owner (gates the mint panel).
    const { ownerId, ...rest } = cert;
    const session = await auth.api.getSession({ headers: await headers() }).catch(() => null);
    return { ...rest, viewerIsOwner: session?.user.id === ownerId };
  });
}

/**
 * Public provenance for a verified certificate's artwork, newest first. Keyed
 * on the ARTWORK id (provenance_events.artwork_id), not the certificate id.
 * Public fields only: no actor ids or internal metadata.
 */
export async function getProvenanceTimeline(artworkId: string) {
  return readSafely("getProvenanceTimeline", [], async () => {
    const artId = parseInput(id, artworkId);
    return db
      .select({
        id: provenanceEvents.id,
        eventType: provenanceEvents.eventType,
        label: provenanceEvents.label,
        txHash: provenanceEvents.txHash,
        occurredAt: provenanceEvents.occurredAt,
      })
      .from(provenanceEvents)
      .where(eq(provenanceEvents.artworkId, artId))
      .orderBy(desc(provenanceEvents.occurredAt));
  });
}
