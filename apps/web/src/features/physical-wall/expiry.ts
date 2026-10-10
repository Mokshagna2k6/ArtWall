import "server-only";

import type { PoolClient } from "pg";

import { getSql } from "@/lib/db";

/**
 * Releasing lapsed holds (F04).
 *
 * A reservation holds its slots for `pw_settings.hold_minutes` while the artist
 * pays. When that lapses the slots have to go back to the wall — the spec is
 * explicit: "reserved auto-expires back to available on hold-timer lapse".
 *
 * The spec assumes a timer service. There isn't one here and adding a cron for
 * a single sweep would be infrastructure to maintain for one UPDATE, so this is
 * **lazy expiry**: the sweep runs whenever the wall is read or written. That is
 * the standard pattern for this shape of problem and it has one real property
 * in its favour — a slot can never be observed in a stale state, because
 * observing it is what cleans it.
 *
 * Without this, a slot whose hold lapsed stays `reserved` forever: it renders
 * as unavailable on the public wall, and `reserveBooking` rejects it with
 * "taken while you were choosing" even though nobody has it. The availability
 * *query* already ignores lapsed holds, so the two views of the wall disagree
 * — which is exactly the bug this closes.
 *
 * Safety: only slots still sitting at `reserved` for the expiring booking are
 * touched. A slot an admin has since force-booked, blocked or taken live has
 * moved on and is left exactly where it is.
 */

const EXPIRE_BOOKINGS = `
  update pw_bookings
  set status = 'expired', hold_expires_at = null, updated_at = now()
  where status = 'held' and hold_expires_at is not null and hold_expires_at < now()
  returning id
`;

const RELEASE_SLOTS = `
  update pw_slots
  set state = 'available', version = version + 1, updated_at = now()
  where state = 'reserved'
    and id in (select slot_id from pw_booking_slots where booking_id = any($1::text[]))
`;

const AUDIT = `
  insert into pw_audit_log (actor_id, actor_label, action, subject_type, subject_id, after)
  values (null, 'system (hold timer)', 'booking.expired', 'booking', $1, $2::jsonb)
`;

/** Sweep inside a caller's transaction. Errors propagate — the caller decides. */
export async function releaseLapsedHoldsIn(client: PoolClient): Promise<number> {
  const expired = await client.query<{ id: string }>(EXPIRE_BOOKINGS);
  if (expired.rowCount === 0) return 0;

  const ids = expired.rows.map((row) => row.id);
  await client.query(RELEASE_SLOTS, [ids]);

  for (const id of ids) {
    await client.query(AUDIT, [id, JSON.stringify({ reason: "hold timer lapsed" })]);
  }

  return ids.length;
}

/**
 * Sweep on its own connection, for read paths. Never throws.
 *
 * A page that renders the wall must not fail because the sweep did. The worst
 * case of swallowing here is one more render showing a stale slot, which the
 * next request fixes.
 */
export async function releaseLapsedHolds(): Promise<number> {
  try {
    const sql = getSql();

    const expired = (await sql.query(EXPIRE_BOOKINGS)) as { id: string }[];
    if (expired.length === 0) return 0;

    const ids = expired.map((row) => row.id);
    await sql.query(RELEASE_SLOTS, [ids]);

    for (const id of ids) {
      await sql.query(AUDIT, [
        id,
        JSON.stringify({ reason: "hold timer lapsed" }),
      ]);
    }

    return ids.length;
  } catch (error) {
    console.error("[physical-wall] Could not release lapsed holds", error);
    return 0;
  }
}
