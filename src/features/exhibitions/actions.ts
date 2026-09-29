"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { eq, and, desc } from "drizzle-orm";

import { auth } from "@/lib/auth";
import { expireCatalog } from "@/lib/catalog-cache";
import { db } from "@/lib/db/index";
import {
  exhibitions,
  exhibitionArtworks,
  artworks,
  artistProfiles,
} from "@/lib/db/schema";
import { recordAudit } from "@/features/physical-wall/audit";
import { getActor, hasRole } from "@/features/physical-wall/authorize";

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

  // Only your own works: a published exhibition shows them publicly.
  const [art] = await db
    .select({ id: artworks.id })
    .from(artworks)
    .where(and(eq(artworks.id, artworkId), eq(artworks.userId, userId)));
  if (!art) throw new Error("Artwork not found");

  await db
    .insert(exhibitionArtworks)
    .values({ exhibitionId, artworkId, displayOrder: 0 })
    .onConflictDoNothing();

  expireCatalog();
  revalidatePath("/studio/exhibitions");
}

/**
 * draft → published (BE-1.23). The owner, or an admin. After this,
 * getPublicExhibition(id) returns it.
 */
export async function publishExhibition(exhibitionId: string) {
  const actor = await getActor();
  if (!actor) throw new Error("Unauthorized");
  const isAdmin = hasRole(actor, "admin");

  const [row] = await db
    .update(exhibitions)
    .set({ status: "published" })
    .where(
      isAdmin
        ? and(eq(exhibitions.id, exhibitionId), eq(exhibitions.status, "draft"))
        : and(eq(exhibitions.id, exhibitionId), eq(exhibitions.status, "draft"), eq(exhibitions.userId, actor.id))
    )
    .returning({ id: exhibitions.id, status: exhibitions.status, userId: exhibitions.userId });
  if (!row) throw new Error("Exhibition not found, not yours, or not a draft.");

  if (row.userId !== actor.id) {
    await recordAudit({ actor, action: "exhibition.published", subjectType: "exhibition", subjectId: row.id });
  }
  expireCatalog();
  revalidatePath("/studio/exhibitions");
  revalidatePath(`/exhibitions/${row.id}`);
  return { id: row.id, status: row.status };
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
    .where(and(eq(exhibitionArtworks.exhibitionId, id), eq(artworks.isPublic, true)))
    .orderBy(exhibitionArtworks.displayOrder);

  const [artist] = await db
    .select({ name: artistProfiles.displayName })
    .from(artistProfiles)
    .where(eq(artistProfiles.userId, exh.userId));

  return { ...exh, artworks: works, artistName: artist?.name ?? "Unknown" };
}
