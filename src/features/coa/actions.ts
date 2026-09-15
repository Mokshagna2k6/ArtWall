"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { eq, and, desc } from "drizzle-orm";

import { auth } from "@/lib/auth";
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

async function getUserId() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) throw new Error("Unauthorized");
  return session.user.id;
}

function newId(prefix: string): string {
  const bytes = new Uint8Array(9);
  crypto.getRandomValues(bytes);
  return `${prefix}_${Buffer.from(bytes).toString("base64url")}`;
}

/* ── Editions ────────────────────────────────────────────────────────────── */

export async function getEditions() {
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
}

export async function createEdition(input: {
  artworkId: string;
  editionType: "unique" | "limited" | "open";
  totalEditions?: number;
  isAp?: boolean;
}) {
  const userId = await getUserId();
  const [artwork] = await db
    .select({ id: artworks.id })
    .from(artworks)
    .where(and(eq(artworks.id, input.artworkId), eq(artworks.userId, userId)));
  if (!artwork) throw new Error("Artwork not found");

  const id = newId("ed");
  await db.insert(editions).values({
    id,
    artworkId: input.artworkId,
    userId,
    editionType: input.editionType,
    totalEditions: input.editionType === "limited" ? input.totalEditions : null,
    isAp: input.isAp ?? false,
    status: "active",
  });

  revalidatePath("/studio/editions");
  return id;
}

/* ── Certificates ────────────────────────────────────────────────────────── */

export async function getCertificates() {
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
}

export async function issueCertificate(artworkId: string, editionId?: string) {
  const userId = await getUserId();
  const [artwork] = await db
    .select()
    .from(artworks)
    .where(and(eq(artworks.id, artworkId), eq(artworks.userId, userId)));
  if (!artwork) throw new Error("Artwork not found");

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

  const id = newId("coa");
  await db.insert(coaCertificates).values({
    id,
    artworkId,
    editionId: editionId ?? null,
    userId,
    metadataHash: hash,
    status: "issued",
    issuedAt: new Date(),
  });

  await db.insert(provenanceEvents).values({
    id: newId("prov"),
    artworkId,
    eventType: "certified",
    actorId: userId,
    label: `Certificate of Authenticity issued`,
    metadata: { certificateId: id, metadataHash: hash },
  });

  revalidatePath("/studio/certificates");
  return { id, hash };
}

export async function revokeCertificate(certId: string, reason: string) {
  const userId = await getUserId();
  const [cert] = await db
    .select()
    .from(coaCertificates)
    .where(and(eq(coaCertificates.id, certId), eq(coaCertificates.userId, userId)));
  if (!cert) throw new Error("Certificate not found");
  if (cert.status === "revoked") throw new Error("Already revoked");

  await db
    .update(coaCertificates)
    .set({ status: "revoked", revokedAt: new Date(), revokeReason: reason })
    .where(eq(coaCertificates.id, certId));

  revalidatePath("/studio/certificates");
}

/* ── Provenance ──────────────────────────────────────────────────────────── */

export async function getProvenance(artworkId?: string) {
  const userId = await getUserId();
  const query = db
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
      artworkId
        ? and(eq(artworks.userId, userId), eq(provenanceEvents.artworkId, artworkId))
        : eq(artworks.userId, userId)
    )
    .orderBy(desc(provenanceEvents.occurredAt));

  return query;
}

export async function addProvenanceEvent(input: {
  artworkId: string;
  eventType: string;
  label: string;
  metadata?: Record<string, unknown>;
}) {
  const userId = await getUserId();
  const [artwork] = await db
    .select({ id: artworks.id })
    .from(artworks)
    .where(and(eq(artworks.id, input.artworkId), eq(artworks.userId, userId)));
  if (!artwork) throw new Error("Artwork not found");

  const id = newId("prov");
  await db.insert(provenanceEvents).values({
    id,
    artworkId: input.artworkId,
    eventType: input.eventType,
    actorId: userId,
    label: input.label,
    metadata: input.metadata ?? null,
  });

  revalidatePath("/studio/provenance");
  return id;
}

/* ── Mint Commitments ────────────────────────────────────────────────────── */

export async function createMintCommitment(artworkId: string) {
  const userId = await getUserId();
  const [cert] = await db
    .select()
    .from(coaCertificates)
    .where(and(eq(coaCertificates.artworkId, artworkId), eq(coaCertificates.userId, userId)));
  if (!cert) throw new Error("Issue a certificate first");

  const [profile] = await db
    .select({ walletAddress: artistProfiles.walletAddress })
    .from(artistProfiles)
    .where(eq(artistProfiles.userId, userId));

  const wallet = profile?.walletAddress ?? "0x0000000000000000000000000000000000000000";
  const leafHash = computeLeafHash({
    artworkId,
    metadataHash: cert.metadataHash,
    walletAddress: wallet,
    royaltyBps: 400,
  });

  const id = newId("mint");
  await db.insert(mintCommitments).values({
    id,
    artworkId,
    editionId: cert.editionId,
    userId,
    leafHash,
    walletAddress: wallet,
    erc2981RoyaltyBps: 400,
    status: "pending",
  });

  await db.insert(provenanceEvents).values({
    id: newId("prov"),
    artworkId,
    eventType: "bound",
    actorId: userId,
    label: "Mint commitment created",
    metadata: { mintCommitmentId: id, leafHash },
  });

  revalidatePath("/studio/certificates");
  return { id, leafHash };
}

/* ── Public verify ───────────────────────────────────────────────────────── */

export async function verifyCertificateByHash(hash: string) {
  const [cert] = await db
    .select({
      id: coaCertificates.id,
      status: coaCertificates.status,
      issuedAt: coaCertificates.issuedAt,
      artworkTitle: artworks.title,
      artworkImage: artworks.imageUrl,
      medium: artworks.medium,
      dimensions: artworks.dimensions,
      year: artworks.year,
      artistName: artistProfiles.displayName,
    })
    .from(coaCertificates)
    .innerJoin(artworks, eq(coaCertificates.artworkId, artworks.id))
    .innerJoin(artistProfiles, eq(artworks.userId, artistProfiles.userId))
    .where(eq(coaCertificates.metadataHash, hash));

  return cert ?? null;
}

export async function getProvenanceTimeline(artworkId: string) {
  return db
    .select()
    .from(provenanceEvents)
    .where(eq(provenanceEvents.artworkId, artworkId))
    .orderBy(desc(provenanceEvents.occurredAt));
}
