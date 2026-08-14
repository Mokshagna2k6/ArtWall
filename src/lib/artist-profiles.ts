import "server-only";

import { and, desc, eq } from "drizzle-orm";

import { db } from "@/lib/db/index";
import { artistProfiles, artworks } from "@/lib/db/schema";

type AuthUser = { id: string; name: string; email: string };

function handleFromName(name: string) {
  const compact = name
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);

  return compact || "artist";
}

/** Create the private draft profile once, with a collision-safe reserved handle. */
export async function ensureArtistProfile(user: AuthUser) {
  const existing = await db
    .select()
    .from(artistProfiles)
    .where(eq(artistProfiles.userId, user.id))
    .limit(1);
  if (existing[0]) return existing[0];

  const baseHandle = handleFromName(user.name);
  const collision = await db
    .select({ userId: artistProfiles.userId })
    .from(artistProfiles)
    .where(eq(artistProfiles.handle, baseHandle))
    .limit(1);
  const handle = collision[0]
    ? `${baseHandle}-${user.id.slice(0, 8)}`
    : baseHandle;

  await db
    .insert(artistProfiles)
    .values({ userId: user.id, handle, displayName: user.name })
    .onConflictDoNothing();

  const created = await db
    .select()
    .from(artistProfiles)
    .where(eq(artistProfiles.userId, user.id))
    .limit(1);
  if (!created[0]) throw new Error("Unable to create artist profile");
  return created[0];
}

export async function getPublicArtistProfile(handle: string) {
  const profiles = await db
    .select()
    .from(artistProfiles)
    .where(
      and(eq(artistProfiles.handle, handle), eq(artistProfiles.published, true))
    )
    .limit(1);
  const profile = profiles[0];
  if (!profile) return null;

  const publicArtworks = await db
    .select()
    .from(artworks)
    .where(
      and(eq(artworks.userId, profile.userId), eq(artworks.isPublic, true))
    )
    .orderBy(desc(artworks.createdAt));

  return { profile, artworks: publicArtworks };
}

export async function getPublishedArtistProfiles() {
  return db
    .select()
    .from(artistProfiles)
    .where(eq(artistProfiles.published, true))
    .orderBy(desc(artistProfiles.publishedAt))
    .limit(36);
}
