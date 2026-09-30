"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { eq, and, desc, sql } from "drizzle-orm";
import { z } from "zod";

import { auth } from "@/lib/auth";
import { db } from "@/lib/db/index";
import { artTags, artTagScans, artworks, artistProfiles } from "@/lib/db/schema";
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

const id = z.string().trim().min(1).max(64);
const createTagSchema = z.object({
  tagType: z.enum(["qr", "nfc"]),
  tagUid: z.string({ error: "Enter the tag's UID." }).trim().min(4, "Enter the tag's UID.").max(128),
  artworkId: id.optional(),
});
const scanSchema = z.object({
  tagUid: z.string().trim().min(1).max(128),
  ip: z.string().max(64).optional(),
  ua: z.string().max(512).optional(),
});

function newId(prefix: string): string {
  const bytes = new Uint8Array(9);
  crypto.getRandomValues(bytes);
  return `${prefix}_${Buffer.from(bytes).toString("base64url")}`;
}

export async function getArtTags() {
  return readSafely("getArtTags", [], async () => {
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
      artworkIsPublic: artworks.isPublic,
    })
    .from(artTags)
    .leftJoin(artworks, eq(artTags.artworkId, artworks.id))
    .where(eq(artTags.boundBy, userId))
    .orderBy(desc(artTags.createdAt));
  });
}

export async function createTag(raw: z.input<typeof createTagSchema>): Promise<Result<string>> {
  return attempt("createTag", async () => {
    const input = parseInput(createTagSchema, raw);
    const userId = await getUserId();
    if (input.artworkId) {
      const [artwork] = await db
        .select({ id: artworks.id })
        .from(artworks)
        .where(and(eq(artworks.id, input.artworkId), eq(artworks.userId, userId)));
      if (!artwork) throw new PreconditionError("Artwork not found");
    }
    const [taken] = await db.select({ id: artTags.id }).from(artTags).where(eq(artTags.tagUid, input.tagUid));
    if (taken) throw new PreconditionError("That tag UID is already registered.");

    const tagId = newId("tag");
    await db.insert(artTags).values({
      id: tagId,
      tagType: input.tagType,
      tagUid: input.tagUid,
      artworkId: input.artworkId ?? null,
      boundBy: userId,
      // Same invariant as unbindTag: no artwork, no bound_at.
      boundAt: input.artworkId ? new Date() : null,
    });

    revalidatePath("/studio/tags");
    return tagId;
  });
}

export async function bindTagToArtwork(tagId: string, artworkId: string): Promise<Result> {
  return attempt("bindTagToArtwork", async () => {
    const input = parseInput(z.object({ tagId: id, artworkId: id }), { tagId, artworkId });
    const userId = await getUserId();
    const [tag] = await db
      .select()
      .from(artTags)
      .where(and(eq(artTags.id, input.tagId), eq(artTags.boundBy, userId)));
    if (!tag) throw new PreconditionError("Tag not found");

    // Only to your own work: a scan shows whatever the tag is bound to.
    const [artwork] = await db
      .select({ id: artworks.id })
      .from(artworks)
      .where(and(eq(artworks.id, input.artworkId), eq(artworks.userId, userId)));
    if (!artwork) throw new PreconditionError("Artwork not found");

    await db
      .update(artTags)
      .set({ artworkId: input.artworkId, boundAt: new Date() })
      .where(eq(artTags.id, input.tagId));

    revalidatePath("/studio/tags");
    return null;
  });
}

export async function unbindTag(tagId: string): Promise<Result> {
  return attempt("unbindTag", async () => {
    const tag = parseInput(id, tagId);
    const userId = await getUserId();
    const [row] = await db
      .update(artTags)
      .set({ artworkId: null, boundAt: null })
      .where(and(eq(artTags.id, tag), eq(artTags.boundBy, userId)))
      .returning({ id: artTags.id });
    if (!row) throw new PreconditionError("Tag not found");

    revalidatePath("/studio/tags");
    return null;
  });
}

/** Public: resolve a tag scan, increment count, log it */
export async function resolveTagScan(tagUid: string, ip?: string, ua?: string) {
  return readSafely("resolveTagScan", null, () => recordScan(parseInput(scanSchema, { tagUid, ip, ua })));
}

async function recordScan({ tagUid, ip, ua }: z.infer<typeof scanSchema>) {
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
    // A scan must not reveal a private work or an unpublished artist.
    .where(
      and(
        eq(artworks.id, tag.artworkId),
        eq(artworks.isPublic, true),
        eq(artistProfiles.published, true)
      )
    );

  return { tagId: tag.id, artwork: artwork ?? null, private: !artwork };
}
