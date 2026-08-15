import "server-only";

import { getSql } from "@/lib/db";

/**
 * The exhibition calendar (F16).
 *
 * A read model over bookings and slots: no new tables, because a calendar is a
 * way of looking at bookings rather than a thing that exists on its own.
 *
 * The valuable half is gap detection. A slot that sits empty for three days or
 * more is revenue the wall did not earn, and the spec asks that those gaps be
 * surfaced with a waitlist suggestion attached — so the calendar's job is not
 * to be pretty but to point at the holes.
 */

export interface CalendarBar {
  bookingId: string;
  slotId: string;
  slotLabel: string;
  artistName: string;
  artworkTitle: string | null;
  status: string;
  startDate: string;
  endDate: string;
}

export interface SlotGap {
  slotId: string;
  slotLabel: string;
  startDate: string;
  endDate: string;
  days: number;
}

export interface CalendarView {
  from: string;
  to: string;
  slots: { id: string; label: string }[];
  bars: CalendarBar[];
  gaps: SlotGap[];
}

/** Days between two YYYY-MM-DD dates, inclusive of neither end. */
function daysBetween(a: string, b: string): number {
  const start = Date.parse(`${a}T00:00:00Z`);
  const end = Date.parse(`${b}T00:00:00Z`);
  return Math.round((end - start) / 86_400_000);
}

function addDays(iso: string, days: number): string {
  const date = new Date(`${iso}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

const MIN_GAP_DAYS = 3;

/**
 * Bookings across a window, plus the gaps between them.
 *
 * Gaps are computed per slot by walking its bookings in date order and
 * measuring the daylight between one ending and the next beginning. A slot with
 * no bookings at all in the window is one big gap, which is correct and is
 * exactly the case a founder most wants to see.
 */
export async function getCalendar(
  from: string,
  days = 28
): Promise<CalendarView> {
  const to = addDays(from, days - 1);

  const empty: CalendarView = { from, to, slots: [], bars: [], gaps: [] };

  try {
    const sql = getSql();

    const slotRows = (await sql`
      select s.id, s.label
      from pw_slots s
      join pw_grid_config g on g.id = s.grid_id and g.active = true
      order by s.row_index asc, s.col_index asc
    `) as { id: string; label: string }[];

    if (slotRows.length === 0) return empty;

    const barRows = (await sql.query(
      `select b.id as booking_id, bs.slot_id, s.label as slot_label,
              u.name as artist_name, a.title as artwork_title, b.status,
              b.start_date::text as start_date, b.end_date::text as end_date
       from pw_bookings b
       join pw_booking_slots bs on bs.booking_id = b.id
       join pw_slots s on s.id = bs.slot_id
       join "user" u on u.id = b.artist_id
       left join artworks a on a.id = b.artwork_id
       where b.status in ('paid', 'completed')
         and b.start_date <= $2::date and b.end_date >= $1::date
       order by s.row_index asc, s.col_index asc, b.start_date asc`,
      [from, to]
    )) as Record<string, unknown>[];

    const bars: CalendarBar[] = barRows.map((row) => ({
      bookingId: String(row.booking_id),
      slotId: String(row.slot_id),
      slotLabel: String(row.slot_label),
      artistName: String(row.artist_name),
      artworkTitle: (row.artwork_title as string) ?? null,
      status: String(row.status),
      startDate: String(row.start_date),
      endDate: String(row.end_date),
    }));

    // Walk each slot's bookings and measure the daylight between them.
    const gaps: SlotGap[] = [];
    for (const slot of slotRows) {
      const booked = bars
        .filter((bar) => bar.slotId === slot.id)
        .sort((a, b) => a.startDate.localeCompare(b.startDate));

      let cursor = from;
      for (const bar of booked) {
        if (bar.startDate > cursor) {
          const length = daysBetween(cursor, bar.startDate);
          if (length >= MIN_GAP_DAYS) {
            gaps.push({
              slotId: slot.id,
              slotLabel: slot.label,
              startDate: cursor,
              endDate: addDays(bar.startDate, -1),
              days: length,
            });
          }
        }
        if (bar.endDate >= cursor) cursor = addDays(bar.endDate, 1);
      }

      if (cursor <= to) {
        const length = daysBetween(cursor, to) + 1;
        if (length >= MIN_GAP_DAYS) {
          gaps.push({
            slotId: slot.id,
            slotLabel: slot.label,
            startDate: cursor,
            endDate: to,
            days: length,
          });
        }
      }
    }

    // Longest first: the biggest hole is the one worth filling.
    gaps.sort((a, b) => b.days - a.days);

    return {
      from,
      to,
      slots: slotRows.map((row) => ({
        id: String(row.id),
        label: String(row.label),
      })),
      bars,
      gaps,
    };
  } catch (error) {
    console.error("[physical-wall] Could not build calendar", error);
    return empty;
  }
}
