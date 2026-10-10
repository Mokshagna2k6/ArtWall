import "server-only";

import type { PoolClient } from "pg";

import { PreconditionError } from "@/features/physical-wall/actions/shared";

/**
 * Per-slot artwork assignment (0064). Plain module, not a server action file:
 * it takes the caller's transaction client so ownership checks, the write and
 * the booking's primary-artwork mirror all commit or roll back together.
 */

export interface SlotArtwork {
  slotId: string;
  artworkId: string;
}

/**
 * Every artwork must be the artist's, and must not already be committed to
 * another live booking over the same dates (one physical work, one wall).
 */
export async function assertArtworksAssignableIn(
  client: PoolClient,
  opts: {
    artistId: string;
    artworkIds: string[];
    startDate: string;
    endDate: string;
    excludeBookingId?: string;
  }
): Promise<void> {
  const { artistId, artworkIds, startDate, endDate, excludeBookingId } = opts;
  if (artworkIds.length === 0) return;

  const owned = await client.query<{ id: string }>(
    `select id from artworks where id = any($1::text[]) and "userId" = $2`,
    [artworkIds, artistId]
  );
  if (owned.rowCount !== new Set(artworkIds).size) {
    throw new PreconditionError("That artwork is not yours to place.");
  }

  const clash = await client.query<{ title: string }>(
    `select distinct a.title
     from pw_booking_slots bs
     join pw_bookings b on b.id = bs.booking_id
     join artworks a on a.id = bs.artwork_id
     where bs.artwork_id = any($1::text[])
       and ($4::text is null or b.id <> $4::text)
       and b.status in ('held', 'paid', 'completed')
       and (b.status <> 'held' or b.hold_expires_at > now())
       and b.start_date <= $3::date and b.end_date >= $2::date
     limit 5`,
    [artworkIds, startDate, endDate, excludeBookingId ?? null]
  );
  if (clash.rows.length > 0) {
    throw new PreconditionError(
      `${clash.rows.map((r) => r.title).join(", ")} is already booked onto the wall over those dates.`
    );
  }
}

/**
 * Set the artwork of each listed slot of a booking. The slot must belong to
 * the booking; a slot can hold one artwork (the column), so assigning replaces.
 */
export async function setSlotArtworksIn(
  client: PoolClient,
  bookingId: string,
  items: SlotArtwork[]
): Promise<void> {
  for (const { slotId, artworkId } of items) {
    const done = await client.query(
      `update pw_booking_slots set artwork_id = $3
       where booking_id = $1 and slot_id = $2`,
      [bookingId, slotId, artworkId]
    );
    if (done.rowCount !== 1) {
      throw new PreconditionError("That slot is not part of this booking.");
    }
  }
  await syncPrimaryArtworkIn(client, bookingId);
}

/** Keep pw_bookings.artwork_id = first slot's artwork, for legacy readers. */
export async function syncPrimaryArtworkIn(
  client: PoolClient,
  bookingId: string
): Promise<void> {
  await client.query(
    `update pw_bookings
     set artwork_id = (
       select artwork_id from pw_booking_slots
       where booking_id = $1 and artwork_id is not null
       order by slot_id limit 1
     ), updated_at = now()
     where id = $1`,
    [bookingId]
  );
}
