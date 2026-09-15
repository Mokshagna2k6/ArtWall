"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { eq, and, desc } from "drizzle-orm";

import { auth } from "@/lib/auth";
import { db } from "@/lib/db/index";
import { curators, curatorPicks, artworks, artistProfiles } from "@/lib/db/schema";

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

export async function applyCurator(input: { displayName: string; bio?: string }) {
  const userId = await getUserId();
  const id = newId("cur");
  await db.insert(curators).values({
    id,
    userId,
    displayName: input.displayName,
    bio: input.bio ?? null,
    status: "pending",
  });
  return id;
}

export async function getActiveCurators() {
  return db
    .select({
      id: curators.id,
      displayName: curators.displayName,
      bio: curators.bio,
      commissionBps: curators.commissionBps,
    })
    .from(curators)
    .where(eq(curators.status, "active"))
    .orderBy(curators.displayName);
}

export async function addCuratorPick(artworkId: string, note?: string) {
  const userId = await getUserId();
  const [curator] = await db
    .select({ id: curators.id })
    .from(curators)
    .where(and(eq(curators.userId, userId), eq(curators.status, "active")));
  if (!curator) throw new Error("Not an active curator");

  const id = newId("pick");
  await db
    .insert(curatorPicks)
    .values({ id, curatorId: curator.id, artworkId, note: note ?? null })
    .onConflictDoNothing();

  revalidatePath("/discover");
  return id;
}

export async function getCuratorPicks(curatorId: string) {
  return db
    .select({
      id: curatorPicks.id,
      note: curatorPicks.note,
      artworkId: artworks.id,
      artworkTitle: artworks.title,
      artworkImage: artworks.imageUrl,
      artistName: artistProfiles.displayName,
    })
    .from(curatorPicks)
    .innerJoin(artworks, eq(curatorPicks.artworkId, artworks.id))
    .innerJoin(artistProfiles, eq(artworks.userId, artistProfiles.userId))
    .where(eq(curatorPicks.curatorId, curatorId))
    .orderBy(desc(curatorPicks.createdAt));
}
