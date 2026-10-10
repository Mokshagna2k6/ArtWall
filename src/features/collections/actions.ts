"use server";

/**
 * Collections server actions (BUYER / ARTIST / CURATOR — see policy.ts for
 * the authorization rules and db/migrations/0057_collections_rebuild.sql for
 * the schema). Every mutation re-derives the actor's identity and the
 * collection's real owner/type from the database — a client never gets to
 * supply `ownerId` or `type` for an existing row.
 *
 * Follows the same action contract as the rest of this codebase
 * (src/features/curators/actions.ts, src/features/physical-wall/actions/shared.ts):
 * every input is zod-validated via `parseInput` before any database call, and
 * every action's body runs inside `attempt`/`readSafely` so nothing throws a
 * raw error (or SQL text) back to the client.
 */

import { randomUUID } from "crypto";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { and, eq, inArray, max, sql } from "drizzle-orm";
import { z } from "zod";

import { auth } from "@/lib/auth";
import { db } from "@/lib/db/index";
import { artistProfiles, artworks, collectionArtworks, collections, curators } from "@/lib/db/schema";
import { canAddArtworkToCollection, canManageCollection, canViewCollection, type CollectionType } from "@/features/collections/policy";
import { discoverArtworks, type MarketplaceItem } from "@/features/marketplace/actions";
import { attempt, parseInput, PreconditionError, readSafely, type Result } from "@/features/physical-wall/actions/shared";

const id = z.string().trim().min(1).max(64);

async function getUserId(): Promise<string> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) throw new PreconditionError("Sign in first.");
  return session.user.id;
}

async function isActiveCurator(userId: string): Promise<boolean> {
  const [row] = await db
    .select({ id: curators.id })
    .from(curators)
    .where(and(eq(curators.userId, userId), eq(curators.status, "active")));
  return Boolean(row);
}

function slugify(title: string): string {
  return (
    title
      .normalize("NFKD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 80) || "collection"
  );
}

/** A slug unique for this owner, de-duplicated with a numeric suffix. */
async function uniqueSlug(ownerId: string, title: string): Promise<string> {
  const base = slugify(title);
  const existing = await db
    .select({ slug: collections.slug })
    .from(collections)
    .where(and(eq(collections.ownerId, ownerId), sql`${collections.slug} = ${base} or ${collections.slug} like ${base + "-%"}`));
  const taken = new Set(existing.map((r) => r.slug));
  if (!taken.has(base)) return base;
  let n = 2;
  while (taken.has(`${base}-${n}`)) n++;
  return `${base}-${n}`;
}

async function loadOwnedCollection(collectionId: string, userId: string) {
  const [row] = await db.select().from(collections).where(eq(collections.id, collectionId));
  if (!row) throw new PreconditionError("Collection not found.");
  const decision = canManageCollection({ actorId: userId, ownerId: row.ownerId });
  if (!decision.allow) throw new PreconditionError(decision.reason ?? "Not authorized.");
  return row;
}

const createSchema = z.object({
  type: z.enum(["BUYER", "ARTIST", "CURATOR"], { error: "Choose a collection type." }),
  title: z.string({ error: "Give the collection a title." }).trim().min(1, "Give the collection a title.").max(160),
  description: z.string().trim().max(1000).optional(),
  thesis: z.string().trim().max(2000).optional(),
  visibility: z.enum(["public", "private"]).optional(),
});

/**
 * Create a collection. `type` is the caller's declared intent, but ARTIST
 * requires an artist profile to exist and CURATOR requires an active curator
 * row — a buyer cannot simply claim to be a curator by passing the type.
 */
export async function createCollection(raw: z.input<typeof createSchema>): Promise<Result<{ id: string; slug: string }>> {
  return attempt("createCollection", async () => {
    const data = parseInput(createSchema, raw);
    const userId = await getUserId();

    if (data.type === "ARTIST") {
      const [profile] = await db.select({ userId: artistProfiles.userId }).from(artistProfiles).where(eq(artistProfiles.userId, userId));
      if (!profile) throw new PreconditionError("You need an artist profile to create an artist collection.");
    }
    if (data.type === "CURATOR" && !(await isActiveCurator(userId))) {
      throw new PreconditionError("You need an active curator account to create a curator collection.");
    }

    const newId = randomUUID();
    const slug = await uniqueSlug(userId, data.title);
    await db.insert(collections).values({
      id: newId,
      ownerId: userId,
      type: data.type,
      title: data.title,
      description: data.description ?? null,
      // Buyer collections never carry a curation thesis (spec section 2A/15.10).
      thesis: data.type === "BUYER" ? null : data.thesis ?? null,
      // Curator collections are public by design (spec section 2C); buyer/artist default private.
      visibility: data.type === "CURATOR" ? "public" : data.visibility ?? "private",
      slug,
    });

    revalidatePath("/studio/collections");
    return { id: newId, slug };
  });
}

const updateSchema = z.object({
  collectionId: id,
  title: z.string().trim().min(1).max(160).optional(),
  description: z.string().trim().max(1000).optional(),
  thesis: z.string().trim().max(2000).optional(),
});

export async function updateCollection(raw: z.input<typeof updateSchema>): Promise<Result<null>> {
  return attempt("updateCollection", async () => {
    const data = parseInput(updateSchema, raw);
    const userId = await getUserId();
    const current = await loadOwnedCollection(data.collectionId, userId);

    await db
      .update(collections)
      .set({
        title: data.title ?? current.title,
        description: data.description ?? current.description,
        thesis: current.type === "BUYER" ? null : data.thesis ?? current.thesis,
        updatedAt: new Date(),
      })
      .where(eq(collections.id, data.collectionId));

    revalidatePath("/studio/collections");
    revalidatePath(`/collections/${current.slug}`);
    return null;
  });
}

export async function deleteCollection(collectionId: string): Promise<Result<null>> {
  return attempt("deleteCollection", async () => {
    const cid = parseInput(id, collectionId);
    const userId = await getUserId();
    const current = await loadOwnedCollection(cid, userId);

    await db.delete(collectionArtworks).where(eq(collectionArtworks.collectionId, cid));
    await db.delete(collections).where(eq(collections.id, cid));

    revalidatePath("/studio/collections");
    revalidatePath(`/collections/${current.slug}`);
    return null;
  });
}

const visibilitySchema = z.object({ collectionId: id, visibility: z.enum(["public", "private"]) });

/** Public/private toggle. Curator collections are always public — see spec section 2C. */
export async function setCollectionVisibility(collectionId: string, visibility: "public" | "private"): Promise<Result<null>> {
  return attempt("setCollectionVisibility", async () => {
    const data = parseInput(visibilitySchema, { collectionId, visibility });
    const userId = await getUserId();
    const current = await loadOwnedCollection(data.collectionId, userId);
    if (current.type === "CURATOR" && data.visibility === "private") {
      throw new PreconditionError("Curator collections are public by design.");
    }

    await db.update(collections).set({ visibility: data.visibility, updatedAt: new Date() }).where(eq(collections.id, data.collectionId));

    revalidatePath("/studio/collections");
    revalidatePath(`/collections/${current.slug}`);
    return null;
  });
}

export async function publishCollection(collectionId: string): Promise<Result<null>> {
  return attempt("publishCollection", async () => {
    const cid = parseInput(id, collectionId);
    const userId = await getUserId();
    const current = await loadOwnedCollection(cid, userId);

    await db
      .update(collections)
      .set({ publishedAt: new Date(), visibility: "public", updatedAt: new Date() })
      .where(eq(collections.id, cid));

    revalidatePath("/studio/collections");
    revalidatePath(`/collections/${current.slug}`);
    return null;
  });
}

export async function unpublishCollection(collectionId: string): Promise<Result<null>> {
  return attempt("unpublishCollection", async () => {
    const cid = parseInput(id, collectionId);
    const userId = await getUserId();
    const current = await loadOwnedCollection(cid, userId);

    await db.update(collections).set({ publishedAt: null, updatedAt: new Date() }).where(eq(collections.id, cid));

    revalidatePath("/studio/collections");
    revalidatePath(`/collections/${current.slug}`);
    return null;
  });
}

const featuredSchema = z.object({ collectionId: id, featured: z.boolean() });

/**
 * Exactly one featured collection per owner (spec section 12), enforced by
 * the partial unique index `collections_one_featured_per_owner` — unfeature
 * every sibling first so the insert/update never races the constraint.
 */
export async function setFeaturedCollection(collectionId: string, featured: boolean): Promise<Result<null>> {
  return attempt("setFeaturedCollection", async () => {
    const data = parseInput(featuredSchema, { collectionId, featured });
    const userId = await getUserId();
    const current = await loadOwnedCollection(data.collectionId, userId);

    if (data.featured) {
      await db.update(collections).set({ isFeatured: false }).where(and(eq(collections.ownerId, userId), eq(collections.isFeatured, true)));
    }
    await db.update(collections).set({ isFeatured: data.featured, updatedAt: new Date() }).where(eq(collections.id, data.collectionId));

    revalidatePath("/studio/collections");
    revalidatePath(`/collections/${current.slug}`);
    return null;
  });
}

const memberSchema = z.object({ collectionId: id, artworkId: id });

export async function addArtworkToCollection(collectionId: string, artworkId: string): Promise<Result<null>> {
  return attempt("addArtworkToCollection", async () => {
    const data = parseInput(memberSchema, { collectionId, artworkId });
    const userId = await getUserId();
    const current = await loadOwnedCollection(data.collectionId, userId);

    const [artwork] = await db.select({ userId: artworks.userId }).from(artworks).where(eq(artworks.id, data.artworkId));
    if (!artwork) throw new PreconditionError("Artwork not found.");

    const decision = canAddArtworkToCollection({
      actorId: userId,
      ownerId: current.ownerId,
      type: current.type as CollectionType,
      artworkOwnerId: artwork.userId,
    });
    if (!decision.allow) throw new PreconditionError(decision.reason ?? "Not authorized.");

    const [{ next }] = await db
      .select({ next: sql<number>`coalesce(${max(collectionArtworks.position)}, -1) + 1` })
      .from(collectionArtworks)
      .where(eq(collectionArtworks.collectionId, data.collectionId));

    await db
      .insert(collectionArtworks)
      .values({ collectionId: data.collectionId, artworkId: data.artworkId, position: next })
      .onConflictDoNothing();

    // First artwork added becomes the cover by default, so a new collection is
    // never coverless; later reorders/removals keep it valid (see removeArtworkFromCollection).
    if (!current.coverArtworkId) {
      await db.update(collections).set({ coverArtworkId: data.artworkId }).where(eq(collections.id, data.collectionId));
    }

    revalidatePath("/studio/collections");
    revalidatePath(`/collections/${current.slug}`);
    return null;
  });
}

export async function removeArtworkFromCollection(collectionId: string, artworkId: string): Promise<Result<null>> {
  return attempt("removeArtworkFromCollection", async () => {
    const data = parseInput(memberSchema, { collectionId, artworkId });
    const userId = await getUserId();
    const current = await loadOwnedCollection(data.collectionId, userId);

    await db
      .delete(collectionArtworks)
      .where(and(eq(collectionArtworks.collectionId, data.collectionId), eq(collectionArtworks.artworkId, data.artworkId)));

    // Cover artwork must remain valid (spec section 11): if it was just removed,
    // fall back to whatever is first in the remaining order, or null.
    if (current.coverArtworkId === data.artworkId) {
      const [next] = await db
        .select({ artworkId: collectionArtworks.artworkId })
        .from(collectionArtworks)
        .where(eq(collectionArtworks.collectionId, data.collectionId))
        .orderBy(collectionArtworks.position)
        .limit(1);
      await db.update(collections).set({ coverArtworkId: next?.artworkId ?? null }).where(eq(collections.id, data.collectionId));
    }

    revalidatePath("/studio/collections");
    revalidatePath(`/collections/${current.slug}`);
    return null;
  });
}

/** Set the collection's cover to one of its own member artworks. */
export async function setCollectionCover(collectionId: string, artworkId: string): Promise<Result<null>> {
  return attempt("setCollectionCover", async () => {
    const data = parseInput(memberSchema, { collectionId, artworkId });
    const userId = await getUserId();
    const current = await loadOwnedCollection(data.collectionId, userId);

    const [member] = await db
      .select({ artworkId: collectionArtworks.artworkId })
      .from(collectionArtworks)
      .where(and(eq(collectionArtworks.collectionId, data.collectionId), eq(collectionArtworks.artworkId, data.artworkId)));
    if (!member) throw new PreconditionError("That artwork is not in this collection.");

    await db.update(collections).set({ coverArtworkId: data.artworkId, updatedAt: new Date() }).where(eq(collections.id, data.collectionId));

    revalidatePath(`/collections/${current.slug}`);
    return null;
  });
}

const reorderSchema = z.object({
  collectionId: id,
  artworkIds: z.array(id).min(1),
});

/**
 * Persist a full reorder. The DB's `position` column is the source of truth
 * (spec section 10) — this writes the caller's exact given order.
 */
export async function reorderCollection(raw: z.input<typeof reorderSchema>): Promise<Result<null>> {
  return attempt("reorderCollection", async () => {
    const data = parseInput(reorderSchema, raw);
    const userId = await getUserId();
    const current = await loadOwnedCollection(data.collectionId, userId);

    const members = await db
      .select({ artworkId: collectionArtworks.artworkId })
      .from(collectionArtworks)
      .where(eq(collectionArtworks.collectionId, data.collectionId));
    const memberIds = new Set(members.map((m) => m.artworkId));
    if (data.artworkIds.length !== memberIds.size || data.artworkIds.some((aid) => !memberIds.has(aid))) {
      throw new PreconditionError("The given order does not match this collection's artworks.");
    }

    await Promise.all(
      data.artworkIds.map((artworkId, index) =>
        db
          .update(collectionArtworks)
          .set({ position: index })
          .where(and(eq(collectionArtworks.collectionId, data.collectionId), eq(collectionArtworks.artworkId, artworkId)))
      )
    );

    revalidatePath(`/collections/${current.slug}`);
    return null;
  });
}

const searchSchema = z.object({ collectionId: id, query: z.string().trim().max(200) });

/**
 * Candidate artworks to add to a collection (spec section 5's "+ Add to
 * Collection" picker). ARTIST collections only ever search the owner's own
 * catalogue; BUYER/CURATOR search the public marketplace, same as everyone
 * else gets to search.
 */
export async function searchArtworksForCollection(collectionId: string, query: string): Promise<Result<MarketplaceItem[]>> {
  return attempt("searchArtworksForCollection", async () => {
    const data = parseInput(searchSchema, { collectionId, query });
    const userId = await getUserId();
    const current = await loadOwnedCollection(data.collectionId, userId);

    if (current.type === "ARTIST") {
      const rows = await db
        .select({
          id: artworks.id,
          title: artworks.title,
          imageUrl: artworks.imageUrl,
          medium: artworks.medium,
          dimensions: artworks.dimensions,
          year: artworks.year,
          pricePaise: artworks.pricePaise,
          category: artworks.category,
          artistName: artistProfiles.displayName,
          artistHandle: artistProfiles.handle,
        })
        .from(artworks)
        .leftJoin(artistProfiles, eq(artworks.userId, artistProfiles.userId))
        .where(eq(artworks.userId, userId));
      const q = data.query.toLowerCase();
      const filtered = q ? rows.filter((r) => r.title.toLowerCase().includes(q)) : rows;
      return filtered.map((r) => ({ ...r, artistName: r.artistName ?? "", artistHandle: r.artistHandle ?? "" }));
    }

    const page = await discoverArtworks({ q: data.query || undefined, limit: 24 });
    return page.items;
  });
}

// ---- Reads ------------------------------------------------------------------
// Read-only actions use readSafely: invalid input or any failure gives the
// fallback (empty list / null / not found) rather than throwing, since these
// back page renders, not form submissions.

export async function getMyCollections(type?: CollectionType) {
  return readSafely("getMyCollections", [], async () => {
    const parsedType = parseInput(z.enum(["BUYER", "ARTIST", "CURATOR"]).optional(), type);
    const userId = await getUserId();
    const rows = await db
      .select()
      .from(collections)
      .where(parsedType ? and(eq(collections.ownerId, userId), eq(collections.type, parsedType)) : eq(collections.ownerId, userId))
      .orderBy(collections.createdAt);

    if (rows.length === 0) return [];
    const counts = await db
      .select({ collectionId: collectionArtworks.collectionId, count: sql<number>`count(*)` })
      .from(collectionArtworks)
      .where(inArray(collectionArtworks.collectionId, rows.map((r) => r.id)))
      .groupBy(collectionArtworks.collectionId);
    const countByCollection = new Map(counts.map((c) => [c.collectionId, Number(c.count)]));

    return rows.map((row) => ({ ...row, artworkCount: countByCollection.get(row.id) ?? 0 }));
  });
}

/**
 * Collections the current user is authorized to add `artworkId` to — used by
 * the "+ Add to Collection" picker (spec section 5). Buyer collections always
 * qualify; artist collections only if the artwork is the user's own; curator
 * collections only if the user is an active curator (any artwork qualifies).
 */
export async function getCollectionsForArtwork(artworkId: string) {
  return readSafely("getCollectionsForArtwork", [], async () => {
    const aid = parseInput(id, artworkId);
    const userId = await getUserId();
    const [artwork] = await db.select({ userId: artworks.userId }).from(artworks).where(eq(artworks.id, aid));
    if (!artwork) return [];

    const mine = await getMyCollections();
    return mine.filter((c) => canAddArtworkToCollection({ actorId: userId, ownerId: c.ownerId, type: c.type as CollectionType, artworkOwnerId: artwork.userId }).allow);
  });
}

async function getCollectionArtworkRows(collectionId: string) {
  return db
    .select({
      artworkId: artworks.id,
      title: artworks.title,
      imageUrl: artworks.imageUrl,
      pricePaise: artworks.pricePaise,
      artistName: artistProfiles.displayName,
      artistHandle: artistProfiles.handle,
      position: collectionArtworks.position,
    })
    .from(collectionArtworks)
    .innerJoin(artworks, eq(collectionArtworks.artworkId, artworks.id))
    .leftJoin(artistProfiles, eq(artworks.userId, artistProfiles.userId))
    .where(eq(collectionArtworks.collectionId, collectionId))
    .orderBy(collectionArtworks.position);
}

/**
 * A collection by owner + slug, for the owner's own studio view (any
 * visibility, since it's their own). Returns null rather than throwing so
 * callers can 404 cleanly.
 */
export async function getOwnedCollectionBySlug(ownerId: string, slug: string) {
  return readSafely("getOwnedCollectionBySlug", null, async () => {
    const data = parseInput(z.object({ ownerId: id, slug: z.string().trim().min(1).max(200) }), { ownerId, slug });
    const [row] = await db.select().from(collections).where(and(eq(collections.ownerId, data.ownerId), eq(collections.slug, data.slug)));
    if (!row) return null;
    const artworkRows = await getCollectionArtworkRows(row.id);
    return { ...row, artworks: artworkRows };
  });
}

/**
 * A public collection by slug (spec section 8: stable, human-readable URLs).
 * Private collections and anonymous/non-owner viewers of a private one must
 * never resolve here — this is the one function that backs public routes.
 */
export async function getPublicCollection(slug: string) {
  return readSafely("getPublicCollection", null, async () => {
    const parsedSlug = parseInput(z.string().trim().min(1).max(200), slug);
    const [row] = await db.select().from(collections).where(eq(collections.slug, parsedSlug));
    if (!row) return null;

    const session = await auth.api.getSession({ headers: await headers() }).catch(() => null);
    const decision = canViewCollection({ visibility: row.visibility as "public" | "private", actorId: session?.user?.id ?? null, ownerId: row.ownerId });
    if (!decision.allow) return null;

    const artworkRows = await getCollectionArtworkRows(row.id);
    return { ...row, artworks: artworkRows };
  });
}

/** Published/public collections for an owner (artist profile pages, discovery). */
export async function getPublicCollectionsForOwner(ownerId: string, type?: CollectionType) {
  return readSafely("getPublicCollectionsForOwner", [], async () => {
    const oid = parseInput(id, ownerId);
    const parsedType = parseInput(z.enum(["BUYER", "ARTIST", "CURATOR"]).optional(), type);
    return db
      .select()
      .from(collections)
      .where(
        parsedType
          ? and(eq(collections.ownerId, oid), eq(collections.type, parsedType), eq(collections.visibility, "public"))
          : and(eq(collections.ownerId, oid), eq(collections.visibility, "public"))
      )
      .orderBy(collections.createdAt);
  });
}
