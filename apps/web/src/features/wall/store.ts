import "server-only";

import { getSql } from "@/lib/db";
import type { WallTile } from "@/features/wall/types";

/**
 * Reads and writes for the public wall.
 *
 * Every read is defensive: the wall must render even when the database is
 * unreachable, because a gallery with the lights off is a better failure than
 * an error page. An empty result simply means the genesis art holds the wall,
 * which is the design anyway.
 *
 * Every value is passed as a tagged-template parameter, so it reaches Postgres
 * as a bound parameter and cannot be interpolated into SQL text.
 */

interface TileRow {
  founder_number: number | string;
  name: string;
  city: string | null;
  practice: string | null;
  artwork_url: string;
  artwork_width: number | null;
  artwork_height: number | null;
  selfie_url: string | null;
  artwork_title: string | null;
  quote: string | null;
}

function toTile(row: TileRow): WallTile {
  return {
    founderNumber: Number(row.founder_number),
    name: row.name,
    city: row.city,
    practice: row.practice,
    artworkUrl: row.artwork_url,
    artworkWidth: row.artwork_width,
    artworkHeight: row.artwork_height,
    selfieUrl: row.selfie_url,
    artworkTitle: row.artwork_title,
    quote: row.quote,
  };
}

/**
 * The wall, oldest place first.
 *
 * Ascending by founder number rather than newest-first: the wall is a record of
 * arrival, and #1 has earned the top-left corner permanently. Newest-first
 * would quietly demote every founding artist each time someone new joined.
 */
export async function listWallTiles(limit = 120): Promise<WallTile[]> {
  try {
    const sql = getSql();
    const rows = (await sql`
      select founder_number, name, city, practice,
             artwork_url, artwork_width, artwork_height,
             selfie_url, artwork_title, quote
      from waitlist_entries
      where status = 'visible' and artwork_url is not null
      order by founder_number asc
      limit ${limit}
    `) as TileRow[];
    return rows.map(toTile);
  } catch (error) {
    console.error("[wall] Could not read tiles", error);
    return [];
  }
}

/** How many real works are hanging. Drives when the genesis art retires. */
export async function countWallTiles(): Promise<number> {
  try {
    const sql = getSql();
    const rows = (await sql`
      select count(*)::int as count from waitlist_entries
      where status = 'visible' and artwork_url is not null
    `) as { count: number }[];
    return rows[0]?.count ?? 0;
  } catch (error) {
    console.error("[wall] Could not count tiles", error);
    return 0;
  }
}

/**
 * "Find myself on the wall."
 *
 * Matches artist name, artwork title, and city. The trigram index added in
 * migration 0002 serves the `lower(name) like '%q%'` case; the other two
 * columns are small enough at founding-cohort scale that a sequential scan is
 * genuinely cheaper than more indexes to maintain.
 *
 * `%` and `_` in the query are escaped, so a visitor typing "100%" searches for
 * that string rather than matching the entire wall.
 */
export async function searchWallTiles(
  query: string,
  limit = 60
): Promise<WallTile[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];

  const pattern = `%${trimmed.replace(/[\\%_]/g, (c) => `\\${c}`).toLowerCase()}%`;

  try {
    const sql = getSql();
    const rows = (await sql`
      select founder_number, name, city, practice,
             artwork_url, artwork_width, artwork_height,
             selfie_url, artwork_title, quote
      from waitlist_entries
      where status = 'visible'
        and artwork_url is not null
        and (
          lower(name)          like ${pattern} escape '\\'
          or lower(coalesce(artwork_title, '')) like ${pattern} escape '\\'
          or lower(coalesce(city, ''))          like ${pattern} escape '\\'
        )
      order by founder_number asc
      limit ${limit}
    `) as TileRow[];
    return rows.map(toTile);
  } catch (error) {
    console.error("[wall] Search failed", error);
    return [];
  }
}

export interface WallEvent {
  founderNumber: number;
  name: string;
  city: string | null;
  /** ISO timestamp. Formatted in the browser so it matches the reader's clock. */
  at: string;
  /** Whether this artist has hung work, or only claimed their place. */
  hasArtwork: boolean;
}

/**
 * The wall's recent history.
 *
 * Real joins only. A live-looking feed of invented names would be the easy way
 * to make a young wall feel busy, and it would be a fabrication printed on the
 * founding artists' own wall - the one surface where our credibility is the
 * entire product. When nobody has joined yet the feed is empty, and the UI
 * says so plainly.
 *
 * Names and cities are public by the artist's own choice at signup; emails and
 * user agents are never selected here.
 */
export async function listRecentJoins(limit = 8): Promise<WallEvent[]> {
  try {
    const sql = getSql();
    const rows = (await sql`
      select founder_number, name, city, created_at,
             (artwork_url is not null) as has_artwork
      from waitlist_entries
      where status = 'visible'
      order by created_at desc
      limit ${limit}
    `) as {
      founder_number: number | string;
      name: string;
      city: string | null;
      created_at: string | Date;
      has_artwork: boolean;
    }[];

    return rows.map((row) => ({
      founderNumber: Number(row.founder_number),
      name: row.name,
      city: row.city,
      at: new Date(row.created_at).toISOString(),
      hasArtwork: row.has_artwork,
    }));
  } catch (error) {
    console.error("[wall] Could not read recent joins", error);
    return [];
  }
}

export interface PublishInput {
  name: string;
  email: string;
  city?: string;
  practice?: string;
  artworkUrl: string;
  artworkPublicId: string;
  artworkWidth: number;
  artworkHeight: number;
  selfieUrl: string | null;
  selfiePublicId: string | null;
  artworkTitle: string | null;
  quote: string | null;
  /** 'hidden' when automated moderation rejected the image. */
  status: "visible" | "hidden";
  userAgent: string | null;
}

/**
 * Hang a work on the wall, claiming a founding place if the artist has not
 * already taken one.
 *
 * Upsert by email, matching `saveWaitlistEntry`: an artist who joined the
 * waitlist last week and uploads today keeps the founder number they were
 * given. Re-uploading replaces the image but never moves their place - a
 * position on this wall is the one thing we promised would not shift.
 */
export async function publishArtwork(
  input: PublishInput & { userId: string; foundingMember: boolean }
): Promise<{ founderNumber: number }> {
  const sql = getSql();

  const rows = (await sql`
    insert into waitlist_entries (
      name, email, role, practice, city, user_agent,
      artwork_url, artwork_public_id, artwork_width, artwork_height,
      selfie_url, selfie_public_id, artwork_title, quote, status,
      user_id, founding_member
    )
    values (
      ${input.name}, ${input.email}, 'artist',
      ${input.practice ?? null}, ${input.city || null}, ${input.userAgent},
      ${input.artworkUrl}, ${input.artworkPublicId},
      ${input.artworkWidth}, ${input.artworkHeight},
      ${input.selfieUrl}, ${input.selfiePublicId},
      ${input.artworkTitle}, ${input.quote}, ${input.status},
      ${input.userId}, ${input.foundingMember}
    )
    on conflict (email) do update
      set name              = excluded.name,
          user_id           = coalesce(excluded.user_id, waitlist_entries.user_id),
          founding_member   = waitlist_entries.founding_member or excluded.founding_member,
          practice          = coalesce(excluded.practice, waitlist_entries.practice),
          city              = coalesce(excluded.city, waitlist_entries.city),
          artwork_url       = excluded.artwork_url,
          artwork_public_id = excluded.artwork_public_id,
          artwork_width     = excluded.artwork_width,
          artwork_height    = excluded.artwork_height,
          selfie_url        = excluded.selfie_url,
          selfie_public_id  = excluded.selfie_public_id,
          artwork_title     = excluded.artwork_title,
          quote             = excluded.quote,
          status            = excluded.status
    returning founder_number
  `) as { founder_number: number | string }[];

  return { founderNumber: Number(rows[0].founder_number) };
}

/** One tile, for the artist's own confirmation view. */
export async function getTileByFounderNumber(
  founderNumber: number
): Promise<WallTile | null> {
  try {
    const sql = getSql();
    const rows = (await sql`
      select founder_number, name, city, practice,
             artwork_url, artwork_width, artwork_height,
             selfie_url, artwork_title, quote
      from waitlist_entries
      where founder_number = ${founderNumber} and artwork_url is not null
    `) as TileRow[];
    return rows[0] ? toTile(rows[0]) : null;
  } catch (error) {
    console.error("[wall] Could not read tile", error);
    return null;
  }
}

export interface AdminTile extends WallTile {
  status: string;
  artworkPublicId: string | null;
  selfiePublicId: string | null;
}

/** Everything hanging, including what has already been pulled down. */
export async function listAllTilesForAdmin(limit = 200): Promise<AdminTile[]> {
  const sql = getSql();
  const rows = (await sql`
    select founder_number, name, city, practice,
             artwork_url, artwork_width, artwork_height,
             selfie_url, artwork_title, quote, status, artwork_public_id, selfie_public_id
    from waitlist_entries
    where artwork_url is not null
    order by founder_number desc
    limit ${limit}
  `) as (TileRow & {
    status: string;
    artwork_public_id: string | null;
    selfie_public_id: string | null;
  })[];

  return rows.map((row) => ({
    ...toTile(row),
    status: row.status,
    artworkPublicId: row.artwork_public_id,
    selfiePublicId: row.selfie_public_id,
  }));
}

/**
 * Pull a tile down, or put it back.
 *
 * Reversible on purpose: hiding is a moderation decision that a human might
 * get wrong, and deleting the row would destroy a founding artist's place and
 * history to fix a bad image. The image itself can be destroyed separately.
 */
export async function setTileStatus(
  founderNumber: number,
  status: "visible" | "hidden"
): Promise<void> {
  const sql = getSql();
  await sql`
    update waitlist_entries set status = ${status}
    where founder_number = ${founderNumber}
  `;
}
