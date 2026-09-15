"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { eq, and, desc, sql } from "drizzle-orm";

import { auth } from "@/lib/auth";
import { db } from "@/lib/db/index";
import { artTags, artTagScans, artworks, artistProfiles } from "@/lib/db/schema";

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

export async function getArtTags() {
  const userId = await getUserId();
  return db
    .select({
      id: artTags.id,
      tagType: artTags.tagType,
      tagUid: artTags.tagUid,
      artworkId: artTags.artworkId,
      scanCount: artTags.scanCount,
      boundAt: artTags.boundAt,
      artworkTitle: artworks.title,
    })
    .from(artTags)
    .leftJoin(artworks, eq(artTags.artworkId, artworks.id))
    .where(eq(artTags.boundBy, userId))
    .orderBy(desc(artTags.createdAt));
}

export async function createTag(input: {
  tagType: "qr" | "nfc";
  tagUid: string;
  artworkId?: string;
}) {
  const userId = await getUserId();
  if (input.artworkId) {
    const [artwork] = await db
      .select({ id: artworks.id })
      .from(artworks)
      .where(and(eq(artworks.id, input.artworkId), eq(artworks.userId, userId)));
    if (!artwork) throw new Error("Artwork not found");
  }

  const id = newId("tag");
  await db.insert(artTags).values({
    id,
    tagType: input.tagType,
    tagUid: input.tagUid,
    artworkId: input.artworkId ?? null,
    boundBy: userId,
    boundAt: new Date(),
  });

  revalidatePath("/studio/tags");
  return id;
}

export async function bindTagToArtwork(tagId: string, artworkId: string) {
  const userId = await getUserId();
  const [tag] = await db
    .select()
    .from(artTags)
    .where(and(eq(artTags.id, tagId), eq(artTags.boundBy, userId)));
  if (!tag) throw new Error("Tag not found");

  await db
    .update(artTags)
    .set({ artworkId, boundAt: new Date() })
    .where(eq(artTags.id, tagId));

  revalidatePath("/studio/tags");
}

/** Public: resolve a tag scan, increment count, log it */
export async function resolveTagScan(tagUid: string, ip?: string, ua?: string) {
  const [tag] = await db
    .select({
      id: artTags.id,
      artworkId: artTags.artworkId,
    })
    .from(artTags)
    .where(eq(artTags.tagUid, tagUid));
  if (!tag) return null;

  await db.insert(artTagScans).values({
    id: newId("tscan"),
    tagId: tag.id,
    ipAddress: ip ?? null,
    userAgent: ua ?? null,
  });

  await db
    .update(artTags)
    .set({ scanCount: sql`scan_count + 1` })
    .where(eq(artTags.id, tag.id));

  if (!tag.artworkId) return { tagId: tag.id, artworkId: null };

  const [artwork] = await db
    .select({
      id: artworks.id,
      title: artworks.title,
      imageUrl: artworks.imageUrl,
      medium: artworks.medium,
      year: artworks.year,
      artistName: artistProfiles.displayName,
      artistHandle: artistProfiles.handle,
    })
    .from(artworks)
    .innerJoin(artistProfiles, eq(artworks.userId, artistProfiles.userId))
    .where(eq(artworks.id, tag.artworkId));

  return { tagId: tag.id, artwork: artwork ?? null };
}
