"use server";

import { updateTag } from "next/cache";

import { getSql } from "@/lib/db";
import { fail, newId, ok, WALL_TAG, type ActionState } from "@/features/physical-wall/actions/shared";

export async function searchArtworks(
  _previous: ActionState,
  formData: FormData
): Promise<ActionState & { results?: unknown[] }> {
  try {
    const query = String(formData.get("q") ?? "").trim();
    if (!query || query.length < 2) {
      return fail("Type at least 2 characters to search.");
    }

    const sql = getSql();

    const rows = (await sql.query(
      `select a.id, a.title, a.medium, a."imageUrl", a.year,
              u.name as artist_name, ap.handle as artist_handle, ap.location as artist_city,
              s.label as slot_label
       from artworks a
       join "user" u on u.id = a."userId"
       left join artist_profiles ap on ap."userId" = a."userId"
       left join pw_slots s on s.id = (
         select bs.slot_id
         from pw_bookings b
         join pw_booking_slots bs on bs.booking_id = b.id
         where b.artwork_id = a.id and b.status in ('paid', 'completed', 'live')
         limit 1
       )
       where a.status = 'available' and a."isPublic" = true
       and a.search_tsv @@ plainto_tsquery('english', $1)
       order by ts_rank(a.search_tsv, plainto_tsquery('english', $1)) desc
       limit 50`,
      [query]
    )) as Record<string, unknown>[];

    const results = rows.map((row) => ({
      artworkId: String(row.id),
      title: String(row.title),
      medium: String(row.medium ?? ""),
      imageUrl: row.imageUrl ? String(row.imageUrl) : null,
      year: row.year ? Number(row.year) : null,
      artistName: String(row.artist_name),
      artistHandle: row.artist_handle ? String(row.artist_handle) : null,
      artistCity: row.artist_city ? String(row.artist_city) : null,
      slotLabel: row.slot_label ? String(row.slot_label) : null,
    }));

    await sql`
      insert into pw_search_log (id, query, results)
      values (${newId("srch")}, ${query}, ${results.length})
    `;

    updateTag(WALL_TAG);
    return ok("", { results });
  } catch (error) {
    console.error("[physical-wall] searchArtworks", error);
    return fail("Search failed. Try again.");
  }
}
