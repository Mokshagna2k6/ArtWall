"use server";

import { eq, and, gte, ilike, lte, sql, or } from "drizzle-orm";

import { db } from "@/lib/db/index";
import { artworks, artistProfiles, coaCertificates } from "@/lib/db/schema";

export interface MarketplaceFilters {
  q?: string;
  medium?: string;
  category?: string;
  /** Inclusive bounds, in paise (artworks.price_paise). */
  minPrice?: number;
  maxPrice?: number;
  sort?: "recent" | "price_asc" | "price_desc" | "title";
}

export async function discoverArtworks(filters: MarketplaceFilters = {}) {
  const conditions = [
    eq(artworks.isPublic, true),
    eq(artworks.status, "available"),
    // An artist who unpublished their profile is not on the marketplace.
    eq(artistProfiles.published, true),
  ];

  if (filters.q) {
    conditions.push(
      or(
        ilike(artworks.title, `%${filters.q}%`),
        ilike(artworks.medium, `%${filters.q}%`),
        ilike(artworks.description, `%${filters.q}%`)
      )!
    );
  }

  if (filters.medium) {
    conditions.push(ilike(artworks.medium, `%${filters.medium}%`));
  }

  if (filters.category) conditions.push(eq(artworks.category, filters.category));
  // A price bound excludes unpriced works (null price_paise never compares true).
  // price_paise is an int4: clamp so an out-of-range bound filters instead of throwing.
  const paise = (n: number) => Math.min(Math.max(Math.round(n), 0), 2_147_483_647);
  if (Number.isFinite(filters.minPrice)) conditions.push(gte(artworks.pricePaise, paise(filters.minPrice!)));
  if (Number.isFinite(filters.maxPrice)) conditions.push(lte(artworks.pricePaise, paise(filters.maxPrice!)));

  const orderBy =
    filters.sort === "price_asc"
      ? sql`"artworks"."price_paise" asc nulls last`
      : filters.sort === "price_desc"
        ? sql`"artworks"."price_paise" desc nulls last`
        : filters.sort === "title"
          ? sql`"artworks"."title" asc`
          : sql`"artworks"."createdAt" desc`;

  return db
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
    .innerJoin(artistProfiles, eq(artworks.userId, artistProfiles.userId))
    .where(and(...conditions))
    .orderBy(orderBy)
    .limit(48);
}

export async function getArtworkDetail(id: string) {
  const [artwork] = await db
    .select({
      id: artworks.id,
      title: artworks.title,
      imageUrl: artworks.imageUrl,
      imagePublicId: artworks.imagePublicId,
      medium: artworks.medium,
      dimensions: artworks.dimensions,
      year: artworks.year,
      description: artworks.description,
      pricePaise: artworks.pricePaise,
      category: artworks.category,
      status: artworks.status,
      artistName: artistProfiles.displayName,
      artistHandle: artistProfiles.handle,
      artistBio: artistProfiles.bio,
      artistAvatar: artistProfiles.avatarUrl,
    })
    .from(artworks)
    .innerJoin(artistProfiles, eq(artworks.userId, artistProfiles.userId))
    .where(and(eq(artworks.id, id), eq(artworks.isPublic, true), eq(artistProfiles.published, true)));

  if (!artwork) return null;

  const certs = await db
    .select({
      id: coaCertificates.id,
      hash: coaCertificates.metadataHash,
      status: coaCertificates.status,
      issuedAt: coaCertificates.issuedAt,
    })
    .from(coaCertificates)
    .where(eq(coaCertificates.artworkId, id));

  return { ...artwork, certificates: certs };
}

export async function getDistinctMediums(): Promise<string[]> {
  const rows = await db
    .selectDistinct({ medium: artworks.medium })
    .from(artworks)
    .where(and(eq(artworks.isPublic, true), sql`medium is not null`))
    .orderBy(artworks.medium)
    .limit(50);

  return rows.map((r) => r.medium!).filter(Boolean);
}
