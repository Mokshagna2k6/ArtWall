import "server-only";

import type { SlotState } from "@/features/physical-wall/state-machine";
import type {
  GridConfig,
  LiveArtwork,
  SlotWithCatalog,
} from "@/features/physical-wall/types";
import { getSql } from "@/lib/db";

/**
 * Reads for the wall itself: the active grid, its slots, and what is hanging.
 *
 * Availability (F06) is computed here in Postgres rather than in a Redis-cached
 * slot map. The spec assumes Redis; this app runs on Vercel and Neon, and a
 * single indexed query against a wall of a few dozen slots is both simpler and
 * exactly correct, with no stale-read window to reconcile at reservation time.
 */

function toSlot(row: Record<string, unknown>): SlotWithCatalog {
  return {
    id: String(row.id),
    gridId: String(row.grid_id),
    rowIndex: Number(row.row_index),
    colIndex: Number(row.col_index),
    label: String(row.label),
    sizeId: String(row.size_id),
    typeId: String(row.type_id),
    state: row.state as SlotState,
    version: Number(row.version),
    sizeName: String(row.size_name),
    wCm: Number(row.w_cm),
    hCm: Number(row.h_cm),
    weightKg: Number(row.weight_kg),
    basePricePaise: Number(row.base_price_paise),
    typeLabel: String(row.type_label),
    typeMultiplierBp: Number(row.multiplier_bp),
  };
}

/** The grid currently published to the wall. Null before an admin publishes one. */
export async function getActiveGrid(): Promise<GridConfig | null> {
  try {
    const sql = getSql();
    const rows = (await sql`
      select id, name, row_count, col_count, is_template, active, version
      from pw_grid_config where active = true limit 1
    `) as Record<string, unknown>[];

    if (rows.length === 0) return null;
    const row = rows[0];
    return {
      id: String(row.id),
      name: String(row.name),
      rowCount: Number(row.row_count),
      colCount: Number(row.col_count),
      isTemplate: Boolean(row.is_template),
      active: Boolean(row.active),
      version: Number(row.version),
    };
  } catch (error) {
    console.error("[physical-wall] Could not read active grid", error);
    return null;
  }
}

export async function listGridTemplates(): Promise<GridConfig[]> {
  const sql = getSql();
  const rows = (await sql`
    select id, name, row_count, col_count, is_template, active, version
    from pw_grid_config
    where is_template = true
    order by name asc
  `) as Record<string, unknown>[];

  return rows.map((row) => ({
    id: String(row.id),
    name: String(row.name),
    rowCount: Number(row.row_count),
    colCount: Number(row.col_count),
    isTemplate: Boolean(row.is_template),
    active: Boolean(row.active),
    version: Number(row.version),
  }));
}

/**
 * Every slot on a grid, joined to the catalogs, in reading order.
 *
 * `state` is the **effective** state, not the stored one: a slot sitting at
 * `reserved` whose holding booking's timer has lapsed reads as `available`,
 * because that is what it is. Nothing holds it.
 *
 * Computed here rather than relying on a sweep because this feeds the public
 * wall, which is an ISR page — a page that renders at build time must not write
 * to the database, so the display cannot depend on a cleanup having run. The
 * stored row is tidied up by `releaseLapsedHolds` on the booking page and
 * inside the reservation transaction; this makes every reader correct in the
 * meantime, and the two can never disagree about whether a slot is free.
 */
export async function listSlots(gridId: string): Promise<SlotWithCatalog[]> {
  try {
    const sql = getSql();
    const rows = (await sql`
      select s.id, s.grid_id, s.row_index, s.col_index, s.label,
             s.size_id, s.type_id, s.version,
             case
               when s.state = 'reserved' and not exists (
                 select 1
                 from pw_booking_slots bs
                 join pw_bookings b on b.id = bs.booking_id
                 where bs.slot_id = s.id
                   and b.status = 'held'
                   and b.hold_expires_at > now()
               ) then 'available'
               else s.state
             end as state,
             z.name as size_name, z.w_cm, z.h_cm, z.weight_kg, z.base_price_paise,
             t.label as type_label, t.multiplier_bp
      from pw_slots s
      join pw_size_catalog z on z.id = s.size_id
      join pw_slot_types   t on t.id = s.type_id
      where s.grid_id = ${gridId}
      order by s.row_index asc, s.col_index asc
    `) as Record<string, unknown>[];

    return rows.map(toSlot);
  } catch (error) {
    console.error("[physical-wall] Could not read slots", error);
    return [];
  }
}

export async function getSlot(slotId: string): Promise<SlotWithCatalog | null> {
  const sql = getSql();
  const rows = (await sql`
    select s.id, s.grid_id, s.row_index, s.col_index, s.label,
           s.size_id, s.type_id, s.state, s.version,
           z.name as size_name, z.w_cm, z.h_cm, z.weight_kg, z.base_price_paise,
           t.label as type_label, t.multiplier_bp
    from pw_slots s
    join pw_size_catalog z on z.id = s.size_id
    join pw_slot_types   t on t.id = s.type_id
    where s.id = ${slotId}
    limit 1
  `) as Record<string, unknown>[];

  return rows.length > 0 ? toSlot(rows[0]) : null;
}

/**
 * How full the wall is, as a percentage. Feeds surge pricing when it is on.
 *
 * Counts anything not `available` — a slot under maintenance is genuinely not
 * sellable, so treating it as occupied is the honest reading of "occupancy".
 * A lapsed hold is not occupancy, and is excluded on the same basis as in
 * `listSlots`: nobody holds it, so it is not taken.
 */
export async function getOccupancyPct(gridId: string): Promise<number> {
  try {
    const sql = getSql();
    const rows = (await sql`
      select
        count(*)::int as total,
        count(*) filter (
          where state <> 'available'
            and not (
              state = 'reserved' and not exists (
                select 1
                from pw_booking_slots bs
                join pw_bookings b on b.id = bs.booking_id
                where bs.slot_id = pw_slots.id
                  and b.status = 'held'
                  and b.hold_expires_at > now()
              )
            )
        )::int as taken
      from pw_slots where grid_id = ${gridId}
    `) as { total: number; taken: number }[];

    const { total, taken } = rows[0] ?? { total: 0, taken: 0 };
    return total === 0 ? 0 : Math.round((taken / total) * 100);
  } catch (error) {
    console.error("[physical-wall] Could not read occupancy", error);
    return 0;
  }
}

/**
 * Slots free for a date range (F06).
 *
 * A slot is available for a window only if it is in `available` state *and* has
 * no booking whose dates overlap. The overlap test is the standard one — two
 * ranges overlap unless one ends before the other starts — and `held` bookings
 * count only while their hold is still alive, so an abandoned checkout stops
 * blocking the slot the moment it lapses.
 */
export async function listAvailableSlotIds(
  gridId: string,
  startDate: string,
  endDate: string,
  bufferDays = 0
): Promise<string[]> {
  const sql = getSql();
  const rows = (await sql`
    select s.id
    from pw_slots s
    where s.grid_id = ${gridId}
      and s.state = 'available'
      and not exists (
        select 1
        from pw_booking_slots bs
        join pw_bookings b on b.id = bs.booking_id
        where bs.slot_id = s.id
          and b.status in ('held', 'paid', 'completed')
          and (b.status <> 'held' or b.hold_expires_at > now())
          and b.start_date <= (${endDate}::date + ${bufferDays}::int)
          and b.end_date   >= (${startDate}::date - ${bufferDays}::int)
      )
    order by s.row_index asc, s.col_index asc
  `) as { id: string }[];

  return rows.map((row) => row.id);
}

/**
 * What is hanging right now (F22, F27).
 *
 * Public fields only: an artist's name, city and handle are published with
 * their consent at registration, and nothing else from the user row is selected
 * here. Contact details are never exposed — buyer interest routes through the
 * platform.
 */
export async function listLiveArtworks(): Promise<LiveArtwork[]> {
  try {
    const sql = getSql();
    const rows = (await sql`
      select a.id as artwork_id, a.title, a."imageUrl" as image_url, a.medium,
             a.year, a.description, a."qrToken" as qr_token,
             u.name as artist_name,
             p.handle as artist_handle, p.location as artist_city,
             s.label as slot_label, b.end_date
      from pw_slots s
      join pw_booking_slots bs on bs.slot_id = s.id
      join pw_bookings b       on b.id = bs.booking_id and b.status in ('paid', 'completed')
      join artworks a          on a.id = b.artwork_id
      join "user" u            on u.id = b.artist_id
      left join artist_profiles p on p."userId" = b.artist_id
      where s.state = 'live'
      order by s.row_index asc, s.col_index asc
    `) as Record<string, unknown>[];

    return rows.map(toLiveArtwork);
  } catch (error) {
    console.error("[physical-wall] Could not read live artworks", error);
    return [];
  }
}

/**
 * One artwork's public page (F22).
 *
 * Resolves whether or not the piece is still hanging: an ended work returns
 * with `slotLabel` empty rather than nothing at all, so the page can render an
 * archived state instead of a 404 and the printed QR keeps working forever.
 */
export async function getPublicArtwork(
  artworkId: string
): Promise<LiveArtwork | null> {
  try {
    const sql = getSql();
    const rows = (await sql`
      select a.id as artwork_id, a.title, a."imageUrl" as image_url, a.medium,
             a.year, a.description, a."qrToken" as qr_token,
             u.name as artist_name,
             p.handle as artist_handle, p.location as artist_city,
             coalesce(s.label, '') as slot_label,
             coalesce(b.end_date::text, '') as end_date
      from artworks a
      join "user" u on u.id = a."userId"
      left join artist_profiles p on p."userId" = a."userId"
      left join pw_bookings b on b.artwork_id = a.id and b.status in ('paid', 'completed')
      left join pw_booking_slots bs on bs.booking_id = b.id
      left join pw_slots s on s.id = bs.slot_id and s.state = 'live'
      where a.id = ${artworkId} and a."isPublic" = true
      order by b.created_at desc
      limit 1
    `) as Record<string, unknown>[];

    return rows.length > 0 ? toLiveArtwork(rows[0]) : null;
  } catch (error) {
    console.error("[physical-wall] Could not read artwork", error);
    return null;
  }
}

function toLiveArtwork(row: Record<string, unknown>): LiveArtwork {
  return {
    artworkId: String(row.artwork_id),
    title: String(row.title),
    imageUrl: (row.image_url as string) ?? null,
    medium: (row.medium as string) ?? null,
    year: row.year ? Number(row.year) : null,
    description: (row.description as string) ?? null,
    artistName: String(row.artist_name),
    artistHandle: (row.artist_handle as string) ?? null,
    artistCity: (row.artist_city as string) ?? null,
    slotLabel: String(row.slot_label ?? ""),
    endDate: String(row.end_date ?? ""),
    qrToken: (row.qr_token as string) ?? null,
  };
}

/** Reaction totals for an artwork, keyed by kind (F24). */
export async function getReactionCounts(
  artworkId: string
): Promise<Record<string, number>> {
  try {
    const sql = getSql();
    const rows = (await sql`
      select kind, count from pw_reactions where artwork_id = ${artworkId}
    `) as { kind: string; count: number }[];

    return Object.fromEntries(rows.map((row) => [row.kind, Number(row.count)]));
  } catch (error) {
    console.error("[physical-wall] Could not read reactions", error);
    return {};
  }
}

/** Scan counts for an artwork, for the artist's own dashboard (F21). */
export async function countScans(artworkId: string): Promise<number> {
  try {
    const sql = getSql();
    const rows = (await sql`
      select count(*)::int as count from pw_scans where artwork_id = ${artworkId}
    `) as { count: number }[];
    return rows[0]?.count ?? 0;
  } catch (error) {
    console.error("[physical-wall] Could not count scans", error);
    return 0;
  }
}
