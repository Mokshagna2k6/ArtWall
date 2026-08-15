import "server-only";

import type {
  Booking,
  BookingDetail,
  BookingStatus,
} from "@/features/physical-wall/types";
import { getSql } from "@/lib/db";

/**
 * Booking reads.
 *
 * Writes live in the actions, because reserving slots is transactional and has
 * to hold row locks; there is nothing to share between the two.
 */

function toBooking(row: Record<string, unknown>): Booking {
  return {
    id: String(row.id),
    artistId: String(row.artist_id),
    artworkId: (row.artwork_id as string) ?? null,
    status: row.status as BookingStatus,
    startDate: String(row.start_date),
    endDate: String(row.end_date),
    durationDays: Number(row.duration_days),
    baseAmountPaise: Number(row.base_amount_paise),
    addonAmountPaise: Number(row.addon_amount_paise),
    discountAmountPaise: Number(row.discount_amount_paise),
    gstAmountPaise: Number(row.gst_amount_paise),
    totalAmountPaise: Number(row.total_amount_paise),
    surgeApplied: Boolean(row.surge_applied),
    refundPolicyVersion: row.refund_policy_version
      ? Number(row.refund_policy_version)
      : null,
    holdExpiresAt: (row.hold_expires_at as string) ?? null,
    createdAt: String(row.created_at),
  };
}

const BOOKING_COLUMNS = `
  id, artist_id, artwork_id, status, start_date::text as start_date,
  end_date::text as end_date, duration_days, base_amount_paise,
  addon_amount_paise, discount_amount_paise, gst_amount_paise,
  total_amount_paise, surge_applied, refund_policy_version,
  hold_expires_at, created_at
`;

/** An artist's own bookings. Scoped by artist id — the ownership check (spec §7). */
export async function listBookingsForArtist(
  artistId: string
): Promise<Booking[]> {
  try {
    const sql = getSql();
    const rows = (await sql.query(
      `select ${BOOKING_COLUMNS} from pw_bookings
       where artist_id = $1 order by created_at desc limit 100`,
      [artistId]
    )) as Record<string, unknown>[];
    return rows.map(toBooking);
  } catch (error) {
    console.error("[physical-wall] Could not read artist bookings", error);
    return [];
  }
}

/** Every booking, for the admin table. */
export async function listAllBookings(
  status?: BookingStatus
): Promise<BookingDetail[]> {
  try {
    const sql = getSql();
    const rows = (await sql.query(
      `select b.id, b.artist_id, b.artwork_id, b.status,
              b.start_date::text as start_date, b.end_date::text as end_date,
              b.duration_days, b.base_amount_paise, b.addon_amount_paise,
              b.discount_amount_paise, b.gst_amount_paise, b.total_amount_paise,
              b.surge_applied, b.refund_policy_version, b.hold_expires_at,
              b.created_at,
              u.name as artist_name, u.email as artist_email,
              a.title as artwork_title, a."imageUrl" as artwork_image_url
       from pw_bookings b
       join "user" u on u.id = b.artist_id
       left join artworks a on a.id = b.artwork_id
       where ($1::text is null or b.status = $1::text)
       order by b.created_at desc
       limit 200`,
      [status ?? null]
    )) as Record<string, unknown>[];

    // Slots and add-ons for all of them in two more queries rather than N+1.
    const ids = rows.map((row) => String(row.id));
    const [slotsByBooking, addonsByBooking] = await Promise.all([
      loadSlots(ids),
      loadAddons(ids),
    ]);

    return rows.map((row) => ({
      ...toBooking(row),
      artistName: String(row.artist_name),
      artistEmail: String(row.artist_email),
      artworkTitle: (row.artwork_title as string) ?? null,
      artworkImageUrl: (row.artwork_image_url as string) ?? null,
      slots: slotsByBooking.get(String(row.id)) ?? [],
      addons: addonsByBooking.get(String(row.id)) ?? [],
    }));
  } catch (error) {
    console.error("[physical-wall] Could not read bookings", error);
    return [];
  }
}

export async function getBookingDetail(
  bookingId: string
): Promise<BookingDetail | null> {
  try {
    const sql = getSql();
    const rows = (await sql.query(
      `select b.id, b.artist_id, b.artwork_id, b.status,
              b.start_date::text as start_date, b.end_date::text as end_date,
              b.duration_days, b.base_amount_paise, b.addon_amount_paise,
              b.discount_amount_paise, b.gst_amount_paise, b.total_amount_paise,
              b.surge_applied, b.refund_policy_version, b.hold_expires_at,
              b.created_at,
              u.name as artist_name, u.email as artist_email,
              a.title as artwork_title, a."imageUrl" as artwork_image_url
       from pw_bookings b
       join "user" u on u.id = b.artist_id
       left join artworks a on a.id = b.artwork_id
       where b.id = $1 limit 1`,
      [bookingId]
    )) as Record<string, unknown>[];

    if (rows.length === 0) return null;
    const row = rows[0];
    const [slots, addons] = await Promise.all([
      loadSlots([bookingId]),
      loadAddons([bookingId]),
    ]);

    return {
      ...toBooking(row),
      artistName: String(row.artist_name),
      artistEmail: String(row.artist_email),
      artworkTitle: (row.artwork_title as string) ?? null,
      artworkImageUrl: (row.artwork_image_url as string) ?? null,
      slots: slots.get(bookingId) ?? [],
      addons: addons.get(bookingId) ?? [],
    };
  } catch (error) {
    console.error("[physical-wall] Could not read booking", error);
    return null;
  }
}

async function loadSlots(bookingIds: string[]) {
  const map = new Map<string, BookingDetail["slots"]>();
  if (bookingIds.length === 0) return map;

  const sql = getSql();
  const rows = (await sql.query(
    `select bs.booking_id, bs.slot_id, bs.quoted_price_paise, s.label
     from pw_booking_slots bs
     join pw_slots s on s.id = bs.slot_id
     where bs.booking_id = any($1::text[])
     order by s.row_index asc, s.col_index asc`,
    [bookingIds]
  )) as Record<string, unknown>[];

  for (const row of rows) {
    const key = String(row.booking_id);
    const list = map.get(key) ?? [];
    list.push({
      slotId: String(row.slot_id),
      label: String(row.label),
      quotedPricePaise: Number(row.quoted_price_paise),
    });
    map.set(key, list);
  }
  return map;
}

async function loadAddons(bookingIds: string[]) {
  const map = new Map<string, BookingDetail["addons"]>();
  if (bookingIds.length === 0) return map;

  const sql = getSql();
  const rows = (await sql.query(
    `select booking_id, id, label, price_paise
     from pw_booking_addons
     where booking_id = any($1::text[])
     order by label asc`,
    [bookingIds]
  )) as Record<string, unknown>[];

  for (const row of rows) {
    const key = String(row.booking_id);
    const list = map.get(key) ?? [];
    list.push({
      id: String(row.id),
      label: String(row.label),
      pricePaise: Number(row.price_paise),
    });
    map.set(key, list);
  }
  return map;
}

/**
 * Bookings that are paid but not yet hanging — the staff install queue (F13).
 *
 * Ordered by start date so the thing arriving soonest is at the top, which is
 * the only order that is useful standing at the wall.
 */
export async function listInstallQueue(): Promise<BookingDetail[]> {
  try {
    const sql = getSql();
    const rows = (await sql`
      select b.id from pw_bookings b
      join pw_booking_slots bs on bs.booking_id = b.id
      join pw_slots s on s.id = bs.slot_id
      where b.status = 'paid' and s.state in ('booked', 'received', 'installed')
      group by b.id, b.start_date
      order by b.start_date asc
      limit 50
    `) as { id: string }[];

    const details = await Promise.all(
      rows.map((row) => getBookingDetail(String(row.id)))
    );
    return details.filter((detail): detail is BookingDetail => detail !== null);
  } catch (error) {
    console.error("[physical-wall] Could not read install queue", error);
    return [];
  }
}
