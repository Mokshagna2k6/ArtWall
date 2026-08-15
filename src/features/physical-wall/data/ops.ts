import "server-only";

import type { ChecklistItem } from "@/features/physical-wall/checklist";
import { getSql } from "@/lib/db";

/**
 * Install-operations reads: check-in rows and their generated checklists.
 */

export interface Checkin {
  id: string;
  bookingId: string;
  slotId: string;
  slotLabel: string;
  checklist: ChecklistItem[];
  completed: string[];
  conditionNotes: string | null;
  status: "pending" | "verified" | "blocked";
  verifiedAt: string | null;
}

/**
 * The stored checklist is `{items, completed}` in one jsonb column.
 *
 * Kept together rather than split across two columns because they are always
 * read and written as a pair, and because storing the item list alongside the
 * ticks is what lets an audit reconstruct what was actually asked — the
 * generation rules will change, the record must not.
 */
interface StoredChecklist {
  items: ChecklistItem[];
  completed: string[];
}

function parseChecklist(value: unknown): StoredChecklist {
  if (Array.isArray(value)) {
    // Tolerate the older shape (a bare item array) rather than crashing the
    // ops screen on a row written before `completed` existed.
    return { items: value as ChecklistItem[], completed: [] };
  }
  if (typeof value === "object" && value !== null) {
    const stored = value as Record<string, unknown>;
    return {
      items: Array.isArray(stored.items) ? (stored.items as ChecklistItem[]) : [],
      completed: Array.isArray(stored.completed)
        ? (stored.completed as string[])
        : [],
    };
  }
  return { items: [], completed: [] };
}

export async function listCheckinsForBooking(
  bookingId: string
): Promise<Checkin[]> {
  try {
    const sql = getSql();
    const rows = (await sql`
      select c.id, c.booking_id, c.slot_id, c.checklist, c.condition_notes,
             c.status, c.verified_at, s.label as slot_label
      from pw_checkins c
      join pw_slots s on s.id = c.slot_id
      where c.booking_id = ${bookingId}
      order by s.row_index asc, s.col_index asc
    `) as Record<string, unknown>[];

    return rows.map(toCheckin);
  } catch (error) {
    console.error("[physical-wall] Could not read check-ins", error);
    return [];
  }
}

export async function getCheckin(checkinId: string): Promise<Checkin | null> {
  const sql = getSql();
  const rows = (await sql`
    select c.id, c.booking_id, c.slot_id, c.checklist, c.condition_notes,
           c.status, c.verified_at, s.label as slot_label
    from pw_checkins c
    join pw_slots s on s.id = c.slot_id
    where c.id = ${checkinId} limit 1
  `) as Record<string, unknown>[];

  return rows.length > 0 ? toCheckin(rows[0]) : null;
}

function toCheckin(row: Record<string, unknown>): Checkin {
  const stored = parseChecklist(row.checklist);
  return {
    id: String(row.id),
    bookingId: String(row.booking_id),
    slotId: String(row.slot_id),
    slotLabel: String(row.slot_label),
    checklist: stored.items,
    completed: stored.completed,
    conditionNotes: (row.condition_notes as string) ?? null,
    status: row.status as Checkin["status"],
    verifiedAt: (row.verified_at as string) ?? null,
  };
}

export interface InstallWindow {
  id: string;
  bookingId: string;
  startsAt: string;
  endsAt: string;
  status: "offered" | "reserved" | "attended" | "missed" | "cancelled";
}

export async function listInstallWindows(
  bookingId: string
): Promise<InstallWindow[]> {
  try {
    const sql = getSql();
    const rows = (await sql`
      select id, booking_id, starts_at, ends_at, status
      from pw_install_windows
      where booking_id = ${bookingId}
      order by starts_at asc
    `) as Record<string, unknown>[];

    return rows.map((row) => ({
      id: String(row.id),
      bookingId: String(row.booking_id),
      startsAt: String(row.starts_at),
      endsAt: String(row.ends_at),
      status: row.status as InstallWindow["status"],
    }));
  } catch (error) {
    console.error("[physical-wall] Could not read install windows", error);
    return [];
  }
}
