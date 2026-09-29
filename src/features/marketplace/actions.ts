"use server";

import { eq, and, gte, ilike, lte, sql, type SQL } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/lib/db/index";
import { artworks, artistProfiles, coaCertificates } from "@/lib/db/schema";
import { parseInput, readSafely } from "@/features/physical-wall/actions/shared";

export type MarketplaceSort = "recent" | "price_asc" | "price_desc" | "title";

export interface MarketplaceFilters {
  q?: string;
  medium?: string;
  category?: string;
  /** Inclusive bounds, in paise (artworks.price_paise). */
  minPrice?: number;
  maxPrice?: number;
  sort?: MarketplaceSort;
  /** Opaque `nextCursor` from the previous page. Omit for the first page. */
  cursor?: string | null;
  /** Page size, 1..96. Default 48. */
  limit?: number;
}

const filtersSchema = z.object({
  q: z.string().trim().max(200).optional(),
  medium: z.string().trim().max(100).optional(),
  category: z.string().trim().max(100).optional(),
  minPrice: z.number().optional(),
  maxPrice: z.number().optional(),
  sort: z.enum(["recent", "price_asc", "price_desc", "title"]).optional(),
  cursor: z.string().trim().max(4096).nullish(),
  limit: z.number().optional(),
});
const id = z.string().trim().min(1).max(64);

export interface MarketplaceItem {
  id: string;
  title: string;
  imageUrl: string | null;
  medium: string | null;
  dimensions: string | null;
  year: number | null;
  pricePaise: number | null;
  category: string | null;
  artistName: string;
  artistHandle: string;
}

export interface MarketplacePage {
  items: MarketplaceItem[];
  /** Pass back as `cursor` (same filters + sort) for the next page; null on the last page. */
  nextCursor: string | null;
}

const DEFAULT_LIMIT = 48;
const MAX_LIMIT = 96;

/**
 * Keyset order per sort. Every sort ends with `id` so the order is total and a
 * cursor names exactly one position. Nulls (unpriced works) always sort last.
 */
const SORT_KEYS: Record<
  MarketplaceSort,
  { key: SQL; cast: string; desc: boolean; nullable: boolean }
> = {
  recent: { key: sql`"artworks"."createdAt"`, cast: "timestamp", desc: true, nullable: false },
  title: { key: sql`"artworks"."title"`, cast: "text", desc: false, nullable: false },
  price_asc: { key: sql`"artworks"."price_paise"`, cast: "integer", desc: false, nullable: true },
  price_desc: { key: sql`"artworks"."price_paise"`, cast: "integer", desc: true, nullable: true },
};

/**
 * Position just after the last row of a page. `v` is the sort value rendered
 * by Postgres as text, so a timestamp keeps its microseconds (a JS Date would
 * round them away and skip or repeat rows).
 */
interface Cursor {
  s: MarketplaceSort;
  v: string | null;
  id: string;
}

function encodeCursor(c: Cursor): string {
  return Buffer.from(JSON.stringify(c)).toString("base64url");
}

/** A malformed cursor, or one minted under a different sort, is ignored (first page). */
function decodeCursor(raw: string | null | undefined, sort: MarketplaceSort): Cursor | null {
  if (!raw) return null;
  try {
    const c = JSON.parse(Buffer.from(raw, "base64url").toString("utf8")) as Cursor;
    const valid =
      c?.s === sort && typeof c.id === "string" && (c.v === null || typeof c.v === "string");
    return valid ? c : null;
  } catch {
    return null;
  }
}

/**
 * Published marketplace listings, one keyset page at a time (PERF-1.07).
 *
 *   discoverArtworks({ ...filters, sort, limit })          -> first page
 *   discoverArtworks({ ...filters, sort, limit, cursor })  -> following pages
 *
 * Returns `{ items, nextCursor }`; `nextCursor` is null on the last page. Keep
 * filters and sort identical between pages: the cursor is a position in that
 * ordering. Keyset rather than OFFSET, so a deep page costs the same as the
 * first and works published mid-browse cannot cause duplicates or gaps.
 */
export async function discoverArtworks(
  filters: MarketplaceFilters = {}
): Promise<MarketplacePage> {
  return readSafely("discoverArtworks", { items: [], nextCursor: null }, () =>
    discover(parseInput(filtersSchema, filters))
  );
}

async function discover(filters: MarketplaceFilters): Promise<MarketplacePage> {
  const sort: MarketplaceSort =
    filters.sort && filters.sort in SORT_KEYS ? filters.sort : "recent";
  const { key, cast, desc, nullable } = SORT_KEYS[sort];
  const limit = Number.isFinite(filters.limit)
    ? Math.min(Math.max(Math.trunc(filters.limit!), 1), MAX_LIMIT)
    : DEFAULT_LIMIT;

  const conditions = [
    eq(artworks.isPublic, true),
    eq(artworks.status, "available"),
    // An artist who unpublished their profile is not on the marketplace.
    eq(artistProfiles.published, true),
  ];

  if (filters.q) {
    // search_tsv (title/medium/description, 0018) has a GIN index; three
    // `ilike '%q%'` could only ever seq-scan every listing (PERF-2.05). Same
    // matching as the wall search: whole words, stemmed ("paintings" ~ "painting").
    conditions.push(sql`"artworks"."search_tsv" @@ websearch_to_tsquery('english', ${filters.q})`);
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

  const dir = sql.raw(desc ? "desc" : "asc");
  const cmp = sql.raw(desc ? "<" : ">");
  const cursor = decodeCursor(filters.cursor, sort);
  if (cursor) {
    // Rows strictly after the cursor in (key nulls last, id) order. For a NOT
    // NULL key, a bare row comparison: an `or key is null` arm would stop
    // Postgres using it as an index range bound (PERF-2.05).
    const after = sql`(${key}, "artworks"."id") ${cmp} (${cursor.v}::${sql.raw(cast)}, ${cursor.id})`;
    conditions.push(
      !nullable
        ? after
        : cursor.v === null
          ? sql`(${key} is null and "artworks"."id" ${cmp} ${cursor.id})`
          : sql`(${after} or ${key} is null)`
    );
  }

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
      sortValue: sql<string | null>`${key}::text`,
    })
    .from(artworks)
    .innerJoin(artistProfiles, eq(artworks.userId, artistProfiles.userId))
    .where(and(...conditions))
    // `nulls last` only where nulls exist: on a NOT NULL key it would no longer
    // match the index order ("createdAt" DESC = nulls first) and force a sort.
    .orderBy(sql`${key} ${dir}${sql.raw(nullable ? " nulls last" : "")}`, sql`"artworks"."id" ${dir}`)
    // One extra row tells us whether there is a next page without a count(*).
    .limit(limit + 1);

  const page = rows.slice(0, limit);
  const last = page.at(-1);
  return {
    items: page.map(({ sortValue: _sortValue, ...item }) => item),
    nextCursor:
      rows.length > limit && last
        ? encodeCursor({ s: sort, v: last.sortValue, id: last.id })
        : null,
  };
}

export async function getArtworkDetail(artworkId: string) {
  return readSafely("getArtworkDetail", null, () => artworkDetail(parseInput(id, artworkId)));
}

async function artworkDetail(id: string) {
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
  return readSafely("getDistinctMediums", [], distinctMediums);
}

async function distinctMediums(): Promise<string[]> {
  const rows = await db
    .selectDistinct({ medium: artworks.medium })
    .from(artworks)
    .where(and(eq(artworks.isPublic, true), sql`medium is not null`))
    .orderBy(artworks.medium)
    .limit(50);

  return rows.map((r) => r.medium!).filter(Boolean);
}
