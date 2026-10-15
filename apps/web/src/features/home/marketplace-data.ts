import "server-only";

import { and, asc, desc, eq, gte, inArray, sql } from "drizzle-orm";

import type { MarketplaceItem } from "@/features/marketplace/actions";
import { getSql } from "@/lib/db";
import { db } from "@/lib/db/index";
import { artistProfiles, artworks } from "@/lib/db/schema";

/**
 * The marketplace homepage's read model.
 *
 * Trending / Recently favorited / Today's Pick all come out of the Demand
 * Engine's existing tables (`demand_signals`, `demand_aggregates` — migration
 * 0045), per CHANGES-PLAN.md §4 decision (A). There is no favorites table and
 * this adds no migration: "favorited" is a presentation label over a real
 * engagement score, which is how the brief described it.
 *
 * Neither demand table is in the Drizzle schema (raw SQL only), so the artwork
 * ids come from a small `getSql()` query — the same client
 * features/demand/aggregate.ts uses — and the card data comes from the same
 * `artworks` x `artist_profiles` join every other catalogue read uses, so one
 * place decides what "a public listing" means.
 *
 * Each demand read returns [] rather than throwing when the tables are empty
 * or unavailable, which they will be on a fresh database: the sections render
 * their own empty state instead of leaving a hole in the page.
 */

/** Same visibility rule as discoverArtworks: public, available, published artist. */
const listed = [
  eq(artworks.isPublic, true),
  eq(artworks.status, "available"),
  eq(artistProfiles.published, true),
];

const CARD = {
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
} as const;

/**
 * Listings for these ids, in the order the ids were given. Ids that are no
 * longer a public listing (sold, unpublished artist) simply drop out — a
 * demand row outlives the listing it scored, so over-fetch and slice.
 */
async function cardsFor(ids: string[], limit: number): Promise<MarketplaceItem[]> {
  if (ids.length === 0) return [];
  const rows = await db
    .select(CARD)
    .from(artworks)
    .innerJoin(artistProfiles, eq(artworks.userId, artistProfiles.userId))
    .where(and(inArray(artworks.id, ids), ...listed));
  const byId = new Map(rows.map((r) => [r.id, r]));
  return ids
    .map((id) => byId.get(id))
    .filter((r): r is MarketplaceItem => r != null)
    .slice(0, limit);
}

/** Over-fetch factor: a scored work may no longer be a live listing. */
const SLACK = 4;

/**
 * Highest rolled-up demand score. Reads `demand_aggregates` (the table the
 * cron already maintains), not the raw signal log.
 */
export async function loadTrending(limit = 8): Promise<MarketplaceItem[]> {
  const ids = await demandIds(
    "trending",
    () => getSql()`
      select artwork_id from demand_aggregates
      where score > 0
      order by score desc, artwork_id
      limit ${limit * SLACK}
    `
  );
  return cardsFor(ids, limit);
}

/**
 * Top works by summed signal weight over a recent window — "Recently
 * favorited" per §4(A). Deliberately the raw log and not the aggregate: the
 * aggregate is all-time, so a work that peaked a year ago would sit here
 * forever.
 */
export async function loadRecentlyFavorited(
  limit = 8,
  withinDays = 14
): Promise<MarketplaceItem[]> {
  const ids = await demandIds(
    "recently-favorited",
    () => getSql()`
      select artwork_id from demand_signals
      where recorded_at >= now() - make_interval(days => ${withinDays})
      group by artwork_id
      having sum(weight * value) > 0
      order by sum(weight * value) desc, artwork_id
      limit ${limit * SLACK}
    `
  );
  return cardsFor(ids, limit);
}

/**
 * Highest-scoring work with a signal recorded today, per §4(A). Null when
 * nothing has been signalled today; the page falls back to the top trending
 * work rather than rendering an empty rail.
 */
export async function loadTodaysPick(): Promise<MarketplaceItem | null> {
  const ids = await demandIds(
    "todays-pick",
    () => getSql()`
      select a.artwork_id from demand_aggregates a
      where exists (
        select 1 from demand_signals s
        where s.artwork_id = a.artwork_id and s.recorded_at >= date_trunc('day', now())
      )
      order by a.score desc, a.artwork_id
      limit ${SLACK * 4}
    `
  );
  return (await cardsFor(ids, 1))[0] ?? null;
}

/**
 * Newest listings. `createdAt desc` is the ordering discoverArtworks's
 * "recent" sort uses, so this rail and /discover agree on what "new" means.
 * Not restricted to the calendar day: a quiet day would leave the rail blank,
 * so the freshest works are always shown and the page labels the count of
 * works actually listed today (see `countListedToday`).
 */
export async function loadNewlyListed(limit = 6): Promise<MarketplaceItem[]> {
  return db
    .select(CARD)
    .from(artworks)
    .innerJoin(artistProfiles, eq(artworks.userId, artistProfiles.userId))
    .where(and(...listed))
    .orderBy(desc(artworks.createdAt), asc(artworks.id))
    .limit(limit);
}

/** How many listings went up today, so the rail's heading can be honest. */
export async function countListedToday(): Promise<number> {
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(artworks)
    .innerJoin(artistProfiles, eq(artworks.userId, artistProfiles.userId))
    .where(and(...listed, gte(artworks.createdAt, sql`date_trunc('day', now())`)));
  return row?.n ?? 0;
}

/**
 * Run one demand query. The demand tables are sparse by design and are not
 * part of the Drizzle schema, so a missing table or an empty result must
 * degrade to "this section has nothing to show" — never a 500 on the homepage.
 */
async function demandIds(
  scope: string,
  run: () => Promise<unknown>
): Promise<string[]> {
  try {
    // Same cast as features/demand/aggregate.ts: the Neon HTTP client's return
    // type is a union over every result mode, and these queries all run in the
    // default rows-as-objects mode.
    const rows = (await run()) as { artwork_id?: unknown }[];
    return rows
      .map((r) => r.artwork_id)
      .filter((id): id is string => typeof id === "string");
  } catch (error) {
    console.error(`[home] ${scope} unavailable`, error);
    return [];
  }
}
