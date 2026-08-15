import "server-only";

import { getSql } from "@/lib/db";

/**
 * Reading the queue (F10, C04).
 *
 * The ordering is the feature, so it lives in one query rather than being
 * re-sorted by each caller: manual rank first (nulls last, so an unranked
 * entry never jumps a ranked one), then the automatic tier, then arrival.
 */

export interface WaitlistEntry {
  id: string;
  artistId: string | null;
  name: string;
  contact: string;
  city: string | null;
  medium: string | null;
  sizePref: string | null;
  note: string | null;
  tier: string;
  priorityRank: number | null;
  status: string;
  matchedSlotLabel: string | null;
  offerExpiresAt: string | null;
  createdAt: string;
  overrideCount: number;
}

const TIER_SORT = `
  case tier
    when 'founding' then 0
    when 'repeat'   then 1
    when 'referred' then 2
    else 3
  end
`;

function toEntry(row: Record<string, unknown>): WaitlistEntry {
  return {
    id: String(row.id),
    artistId: (row.artist_id as string) ?? null,
    name: String(row.name),
    contact: String(row.contact),
    city: (row.city as string) ?? null,
    medium: (row.medium as string) ?? null,
    sizePref: (row.size_pref as string) ?? null,
    note: (row.note as string) ?? null,
    tier: String(row.tier),
    priorityRank:
      row.priority_rank === null || row.priority_rank === undefined
        ? null
        : Number(row.priority_rank),
    status: String(row.status),
    matchedSlotLabel: (row.matched_slot_label as string) ?? null,
    offerExpiresAt: (row.offer_expires_at as string) ?? null,
    createdAt: String(row.created_at),
    overrideCount: Number(row.override_count ?? 0),
  };
}

/** The live queue, in the order the wall will actually offer slots. */
export async function listQueue(): Promise<WaitlistEntry[]> {
  try {
    const sql = getSql();
    const rows = (await sql.query(
      `select w.id, w.artist_id, w.name, w.contact, w.city, w.medium, w.size_pref,
              w.note, w.tier, w.priority_rank, w.status, w.offer_expires_at,
              w.created_at,
              s.label as matched_slot_label,
              (select count(*)::int from pw_queue_overrides o where o.waitlist_id = w.id)
                as override_count
       from pw_waitlist w
       left join pw_slots s on s.id = w.matched_slot_id
       where w.status in ('queued', 'offered')
       order by w.priority_rank asc nulls last, ${TIER_SORT}, w.created_at asc
       limit 200`
    )) as Record<string, unknown>[];

    return rows.map(toEntry);
  } catch (error) {
    console.error("[physical-wall] Could not read queue", error);
    return [];
  }
}

/** This artist's own live place in the queue, if they have one. */
export async function myQueueEntry(
  artistId: string
): Promise<WaitlistEntry | null> {
  try {
    const sql = getSql();
    const rows = (await sql.query(
      `select w.id, w.artist_id, w.name, w.contact, w.city, w.medium, w.size_pref,
              w.note, w.tier, w.priority_rank, w.status, w.offer_expires_at,
              w.created_at,
              s.label as matched_slot_label,
              0 as override_count
       from pw_waitlist w
       left join pw_slots s on s.id = w.matched_slot_id
       where w.artist_id = $1 and w.status in ('queued', 'offered')
       limit 1`,
      [artistId]
    )) as Record<string, unknown>[];

    return rows.length > 0 ? toEntry(rows[0]) : null;
  } catch (error) {
    console.error("[physical-wall] Could not read queue entry", error);
    return null;
  }
}

/**
 * Where this entry sits, counting from one.
 *
 * Shown to the artist because "you are in the queue" is not information and
 * "you are fourth" is. Computed with the same ordering as `listQueue`, so the
 * number an artist sees is the number the admin sees.
 */
export async function queuePosition(entryId: string): Promise<number | null> {
  try {
    const sql = getSql();
    const rows = (await sql.query(
      `select position from (
         select id, row_number() over (
           order by priority_rank asc nulls last, ${TIER_SORT}, created_at asc
         ) as position
         from pw_waitlist where status = 'queued'
       ) ranked where id = $1`,
      [entryId]
    )) as { position: number }[];

    return rows[0] ? Number(rows[0].position) : null;
  } catch (error) {
    console.error("[physical-wall] Could not read queue position", error);
    return null;
  }
}

export async function countQueue(): Promise<number> {
  try {
    const sql = getSql();
    const rows = (await sql`
      select count(*)::int as count from pw_waitlist where status = 'queued'
    `) as { count: number }[];
    return rows[0]?.count ?? 0;
  } catch (error) {
    console.error("[physical-wall] Could not count queue", error);
    return 0;
  }
}
