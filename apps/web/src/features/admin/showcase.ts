"use server";

import { recordAudit } from "@/features/physical-wall/audit";
import { requireAdminRole } from "@/features/physical-wall/authorize";
import { attempt, type Result } from "@/features/physical-wall/actions/shared";
import { getSql } from "@/lib/db";

/**
 * Removing the showcase catalogue from the admin UI.
 *
 * The site ships with ~100 demonstration artists and their work so a new
 * visitor sees a real catalogue instead of an empty page. Once there are
 * enough genuine artists, a Super Admin deletes it from
 * `/physical-wall/admin/showcase`.
 *
 * ## Why this is safe to expose as a button
 *
 * Every showcase row is written with an id prefixed `show_`, and every showcase
 * handle with `showcase-`. The deletes below match only those prefixes, so the
 * statement itself cannot reach a real artist's work — the safety is in the
 * data, not in a condition someone has to get right at the call site.
 *
 * `scripts/seed-showcase.mjs` performs the same deletion from the terminal. The
 * two are kept in step by this file being the only place the SQL is written for
 * the app, mirroring `SHOWCASE_PURGE_SQL` in that script; a
 * test asserts the two lists match so they cannot silently drift.
 */

/** Id prefix on every showcase row. Must match the seed script. */
const SHOWCASE_PREFIX = "show_";

/** Handle prefix. Separate because handles forbid underscores. */
const SHOWCASE_HANDLE_PREFIX = "showcase-";

/** Email domain of every showcase account, used to find orphaned profile rows. */
const SHOWCASE_EMAIL_DOMAIN = "@showcase.artwall.test";

export interface ShowcaseCounts {
  artists: number;
  artworks: number;
}

/**
 * How much showcase data is currently loaded.
 *
 * Read-only, so it is gated on `super_admin` for consistency with the delete
 * rather than out of necessity.
 */
export async function countShowcaseData(): Promise<Result<ShowcaseCounts>> {
  return attempt("countShowcaseData", async () => {
    await requireAdminRole("super_admin");
    const sql = getSql();

    const [artworks] = (await sql`
      select count(*)::int as n from artworks where id like ${`${SHOWCASE_PREFIX}%`}
    `) as { n: number }[];

    const [artists] = (await sql`
      select count(*)::int as n from artist_profiles
      where handle like ${`${SHOWCASE_HANDLE_PREFIX}%`}
    `) as { n: number }[];

    return { artists: artists?.n ?? 0, artworks: artworks?.n ?? 0 };
  });
}

/**
 * Delete every showcase artist and artwork.
 *
 * Ordered child-to-parent so a foreign key never blocks a delete. Not wrapped
 * in a single transaction on purpose: the Supabase Auth accounts are removed
 * over HTTP afterwards, which cannot join a database transaction, and a partial
 * delete here is both harmless and re-runnable — running it twice removes
 * whatever the first pass left.
 */
export async function purgeShowcaseData(): Promise<Result<ShowcaseCounts>> {
  return attempt("purgeShowcaseData", async () => {
    const actor = await requireAdminRole("super_admin");
    const sql = getSql();

    const before = (await countShowcaseData()) as Result<ShowcaseCounts>;
    const counts = before.ok ? before.data : { artists: 0, artworks: 0 };

    const like = `${SHOWCASE_PREFIX}%`;
    const handleLike = `${SHOWCASE_HANDLE_PREFIX}%`;

    await sql`delete from demand_signals where artwork_id like ${like}`;
    await sql`delete from demand_aggregates where artwork_id like ${like}`;
    await sql`
      delete from collection_artworks
      where artwork_id like ${like} or collection_id like ${like}
    `;
    await sql`delete from collections where id like ${like}`;
    await sql`delete from artworks where id like ${like}`;
    await sql`delete from artist_profiles where handle like ${handleLike}`;

    // Profile rows are keyed by the Supabase auth uuid, so they carry no
    // prefix. They are matched by the showcase email domain instead, and only
    // once their artist_profiles row is gone — so a real user who happens to
    // have no profile is never in range.
    await sql`
      delete from "user"
      where email like ${`%${SHOWCASE_EMAIL_DOMAIN}`}
        and not exists (
          select 1 from artist_profiles p where p."userId" = "user".id
        )
    `;

    const removedAuth = await deleteShowcaseAuthUsers();

    // SEC-2.11: a destructive admin action names a person in the audit log.
    await recordAudit({
      actor,
      action: "showcase.purge",
      subjectType: "showcase",
      subjectId: null,
      after: { ...counts, authAccounts: removedAuth },
    });

    return counts;
  });
}

/**
 * Delete the Supabase Auth accounts behind the showcase artists.
 *
 * They are found by the `artwall_seed: "showcase"` tag in `user_metadata`,
 * because their ids are Supabase uuids and cannot carry the `show_` prefix the
 * rest of this module keys off.
 *
 * Failures are counted, not thrown: the database rows are already gone by this
 * point, and leaving an auth account behind is recoverable (the terminal purge
 * removes it), whereas failing the whole action here would leave the admin
 * unsure what happened.
 */
async function deleteShowcaseAuthUsers(): Promise<number> {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!base || !key) return 0;

  const headers = { apikey: key, Authorization: `Bearer ${key}` };
  let removed = 0;

  // Bounded rather than `while (true)`: 20 pages of 200 is 4000 accounts, far
  // beyond the ~100 this seeds, so an unexpected response cannot spin forever.
  for (let page = 1; page <= 20; page += 1) {
    const res = await fetch(`${base}/auth/v1/admin/users?per_page=200&page=${page}`, { headers });
    if (!res.ok) break;

    const users = ((await res.json()) as { users?: ShowcaseAuthUser[] }).users ?? [];
    if (users.length === 0) break;

    for (const user of users) {
      if (user.user_metadata?.artwall_seed !== "showcase") continue;
      const deleted = await fetch(`${base}/auth/v1/admin/users/${user.id}`, {
        method: "DELETE",
        headers,
      });
      if (deleted.ok) removed += 1;
    }

    if (users.length < 200) break;
  }

  return removed;
}

interface ShowcaseAuthUser {
  id: string;
  user_metadata?: { artwall_seed?: string };
}
