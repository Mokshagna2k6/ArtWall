"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { eq, and, desc } from "drizzle-orm";

import { auth } from "@/lib/auth";
import { db } from "@/lib/db/index";
import {
  exhibitions,
  exhibitionArtworks,
  artworks,
  artistProfiles,
} from "@/lib/db/schema";

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

export async function getExhibitions() {
  const userId = await getUserId();
  return db
    .select()
    .from(exhibitions)
    .where(eq(exhibitions.userId, userId))
    .orderBy(desc(exhibitions.createdAt));
}

export async function createExhibition(input: {
  title: string;
  description?: string;
  venue?: string;
  startDate?: string;
  endDate?: string;
}) {
  const userId = await getUserId();
  const id = newId("exh");
  await db.insert(exhibitions).values({
    id,
    userId,
    title: input.title,
    description: input.description ?? null,
    venue: input.venue ?? null,
    startDate: input.startDate ?? null,
    endDate: input.endDate ?? null,
    status: "draft",
  });
  revalidatePath("/studio/exhibitions");
  return id;
}

export async function addArtworkToExhibition(
  exhibitionId: string,
  artworkId: string
) {
  const userId = await getUserId();
  const [exh] = await db
    .select({ id: exhibitions.id })
    .from(exhibitions)
    .where(and(eq(exhibitions.id, exhibitionId), eq(exhibitions.userId, userId)));
  if (!exh) throw new Error("Exhibition not found");

  await db
    .insert(exhibitionArtworks)
    .values({ exhibitionId, artworkId, displayOrder: 0 })
    .onConflictDoNothing();

  revalidatePath("/studio/exhibitions");
}

export async function getPublicExhibition(id: string) {
  const [exh] = await db
    .select()
    .from(exhibitions)
    .where(and(eq(exhibitions.id, id), eq(exhibitions.status, "published")));
  if (!exh) return null;

  const works = await db
    .select({
      id: artworks.id,
      title: artworks.title,
      imageUrl: artworks.imageUrl,
      medium: artworks.medium,
      year: artworks.year,
      displayOrder: exhibitionArtworks.displayOrder,
    })
    .from(exhibitionArtworks)
    .innerJoin(artworks, eq(exhibitionArtworks.artworkId, artworks.id))
    .where(eq(exhibitionArtworks.exhibitionId, id));

  const [artist] = await db
    .select({ name: artistProfiles.displayName })
    .from(artistProfiles)
    .where(eq(artistProfiles.userId, exh.userId));

  return { ...exh, artworks: works, artistName: artist?.name ?? "Unknown" };
}
