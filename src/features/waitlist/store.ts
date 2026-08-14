import "server-only";

import type { WaitlistInput } from "@/features/waitlist/schema";
import { getSql } from "@/lib/db";

export interface WaitlistEntry extends WaitlistInput {
  userAgent: string | null;
  /** The signed-in account that claimed this place. Joining requires one. */
  userId: string;
}

/**
 * Persist a founding artist and return the place they were given.
 *
 * Idempotent by email: submitting twice returns the *same* founder number
 * rather than creating a duplicate or erroring. An artist who resubmits because
 * they were unsure it worked should be reassured, not punished - and their
 * place must not silently move.
 *
 * `ON CONFLICT ... DO UPDATE` (rather than `DO NOTHING`) is deliberate: it
 * makes the statement always return a row, so we never need a second round trip
 * to find out what number an existing artist holds.
 *
 * All values are passed as tagged-template parameters, so they are sent to
 * Postgres as bound parameters and cannot be interpolated into SQL text -
 * this is not string concatenation, and it is not vulnerable to injection.
 */
export async function saveWaitlistEntry(
  entry: WaitlistEntry
): Promise<{ founderNumber: number }> {
  const sql = getSql();

  const rows = (await sql`
    insert into waitlist_entries (
      name, email, role, practice, city, user_agent,
      artwork_url, artwork_public_id, artwork_width, artwork_height,
      selfie_url, selfie_public_id, artwork_title, quote,
      user_id, founding_member
    )
    values (
      ${entry.name},
      ${entry.email},
      ${entry.role},
      ${entry.practice ?? null},
      ${entry.city || null},
      ${entry.userAgent},
      ${entry.artworkUrl || null},
      ${entry.artworkPublicId || null},
      ${entry.artworkWidth ?? null},
      ${entry.artworkHeight ?? null},
      ${entry.selfieUrl || null},
      ${entry.selfiePublicId || null},
      ${entry.artworkTitle || null},
      ${entry.quote || null},
      ${entry.userId},
      ${entry.foundingMember}
    )
    on conflict (email) do update
      set name     = excluded.name,
          role     = excluded.role,
          practice = excluded.practice,
          city     = excluded.city,
          user_id  = coalesce(excluded.user_id, waitlist_entries.user_id),
          -- Founding status is a latch: once claimed it is never revoked by a
          -- later resubmission that happened to leave the box unticked.
          founding_member = waitlist_entries.founding_member or excluded.founding_member,
          -- coalesce so a resubmission without a new upload does not wipe the
          -- artwork this artist already placed on the wall.
          artwork_url       = coalesce(excluded.artwork_url, waitlist_entries.artwork_url),
          artwork_public_id = coalesce(excluded.artwork_public_id, waitlist_entries.artwork_public_id),
          artwork_width     = coalesce(excluded.artwork_width, waitlist_entries.artwork_width),
          artwork_height    = coalesce(excluded.artwork_height, waitlist_entries.artwork_height),
          selfie_url        = coalesce(excluded.selfie_url, waitlist_entries.selfie_url),
          selfie_public_id  = coalesce(excluded.selfie_public_id, waitlist_entries.selfie_public_id),
          artwork_title     = coalesce(excluded.artwork_title, waitlist_entries.artwork_title),
          quote             = coalesce(excluded.quote, waitlist_entries.quote)
    returning founder_number
  `) as { founder_number: number | string }[];

  // Postgres bigint arrives as a string in some driver configurations.
  return { founderNumber: Number(rows[0].founder_number) };
}

/** A tile on the public wall. Only ever public-safe fields - never email. */
export interface WallTile {
  founderNumber: number;
  name: string;
  city: string | null;
  practice: string | null;
  artworkUrl: string;
  artworkWidth: number | null;
  artworkHeight: number | null;
  selfieUrl: string | null;
  artworkTitle: string | null;
  quote: string | null;
}

/**
 * Artworks currently on the wall.
 *
 * Selects columns explicitly rather than `select *` - email and user_agent live
 * in this table, and a wildcard would eventually leak them into a client
 * component the moment someone adds a field.
 */
export async function listWallTiles(limit = 500): Promise<WallTile[]> {
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
    `) as Record<string, unknown>[];

    return rows.map((row) => ({
      founderNumber: Number(row.founder_number),
      name: String(row.name),
      city: (row.city as string) ?? null,
      practice: (row.practice as string) ?? null,
      artworkUrl: String(row.artwork_url),
      artworkWidth: row.artwork_width ? Number(row.artwork_width) : null,
      artworkHeight: row.artwork_height ? Number(row.artwork_height) : null,
      selfieUrl: (row.selfie_url as string) ?? null,
      artworkTitle: (row.artwork_title as string) ?? null,
      quote: (row.quote as string) ?? null,
    }));
  } catch (error) {
    console.error("[wall] Could not read tiles", error);
    return [];
  }
}

/**
 * Cities that already have at least one founding artist.
 *
 * Returns city names only - no names, no emails, nothing that identifies an
 * individual. A map that leaked "who joined from where" would be a privacy
 * problem dressed up as a feature.
 */
export async function listLitCities(): Promise<string[]> {
  try {
    const sql = getSql();
    const rows = (await sql`
      select distinct city from waitlist_entries
      where city is not null and city <> ''
    `) as { city: string }[];
    return rows.map((row) => row.city);
  } catch (error) {
    console.error("[waitlist] Could not read lit cities", error);
    return [];
  }
}

/**
 * How many places are already taken.
 *
 * Returns 0 when the database is unreachable or unconfigured: the join page
 * must still render. An unlit wall is the honest default here, and it is the
 * design we chose anyway.
 */
export async function countWaitlistEntries(): Promise<number> {
  try {
    const sql = getSql();
    const rows = (await sql`
      select count(*)::int as count from waitlist_entries
    `) as { count: number }[];
    return rows[0]?.count ?? 0;
  } catch (error) {
    console.error("[waitlist] Could not read roster count", error);
    return 0;
  }
}
