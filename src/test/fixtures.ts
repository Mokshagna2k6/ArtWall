import { randomBytes } from "node:crypto";

import { pool } from "@/lib/db/index";
import type { TestUser } from "@/test/db-setup";

/**
 * Fixture rows for *.db.test.ts. Every id starts with `betest_` so a crashed
 * run can be cleaned up by hand (`purgeTestData`), and nothing a real user
 * owns is ever touched.
 */

export const tid = (prefix = "x") => `betest_${prefix}_${randomBytes(6).toString("hex")}`;

export async function q<T = Record<string, unknown>>(text: string, params: unknown[] = []) {
  return (await pool.query(text, params)).rows as T[];
}

export async function makeUser(role: "artist" | "admin" | "staff" = "artist"): Promise<TestUser> {
  const id = tid("user");
  const user = { id, name: `Test ${role} ${id.slice(-4)}`, email: `${id}@example.test` };
  await q(`insert into "user" (id, name, email, role, "emailVerified") values ($1, $2, $3, $4, true)`, [
    id,
    user.name,
    user.email,
    role,
  ]);
  return user;
}

export async function makeProfile(userId: string, opts: { published?: boolean; wallet?: string | null } = {}) {
  await q(
    `insert into artist_profiles ("userId", handle, "displayName", published, wallet_address)
     values ($1, $2, $3, $4, $5)`,
    [userId, userId.replace(/_/g, "-"), `Artist ${userId.slice(-4)}`, opts.published ?? true, opts.wallet ?? null]
  );
}

export async function makeArtwork(
  userId: string,
  opts: { title?: string; category?: string | null; pricePaise?: number | null; isPublic?: boolean; imagePublicId?: string | null } = {}
) {
  const id = tid("art");
  await q(
    `insert into artworks (id, "userId", title, category, price_paise, "isPublic", "imagePublicId", "imageUrl", medium)
     values ($1, $2, $3, $4, $5, $6, $7, $8, 'Oil')`,
    [
      id,
      userId,
      opts.title ?? `Work ${id.slice(-4)}`,
      opts.category ?? null,
      opts.pricePaise ?? null,
      opts.isPublic ?? true,
      opts.imagePublicId ?? null,
      opts.imagePublicId ? `https://res.cloudinary.com/demo/image/upload/${opts.imagePublicId}.jpg` : null,
    ]
  );
  return id;
}

/** An inactive grid (never the public wall) with `n` available slots. */
export async function makeSlots(n: number): Promise<string[]> {
  const grid = tid("grid");
  await q(`insert into pw_grid_config (id, name, row_count, col_count) values ($1, $1, 1, 20)`, [grid]);
  const ids: string[] = [];
  for (let i = 0; i < n; i++) {
    const id = tid("slot");
    await q(
      `insert into pw_slots (id, grid_id, row_index, col_index, label, size_id, type_id)
       values ($1, $2, 0, $3, $4, (select id from pw_size_catalog order by sort_order limit 1),
               (select id from pw_slot_types order by sort_order limit 1))`,
      [id, grid, i, `T${i}`]
    );
    ids.push(id);
  }
  return ids;
}

/**
 * A booking on `slotIds`, in `status`. Held bookings reserve their slots;
 * paid ones book them. Total 11800 paise (10000 + 18% GST) unless given.
 */
export async function makeBooking(
  artistId: string,
  slotIds: string[],
  opts: { status?: "held" | "paid" | "expired"; totalPaise?: number; start?: string; days?: number; orderId?: string } = {}
) {
  const id = tid("bk");
  const status = opts.status ?? "held";
  const total = opts.totalPaise ?? 11800;
  const gst = Math.round((total * 18) / 118);
  const start = opts.start ?? "2027-01-10";
  const days = opts.days ?? 7;
  await q(
    `insert into pw_bookings (id, artist_id, status, start_date, end_date, duration_days, base_amount_paise,
       gst_amount_paise, total_amount_paise, refund_policy_version, hold_expires_at)
     values ($1, $2, $3, $4::date, $4::date + ($5::int - 1), $5, $6, $7, $8,
       (select max(version) from pw_refund_policy), case when $3 = 'held' then now() + interval '30 minutes' end)`,
    [id, artistId, status, start, days, total - gst, gst, total]
  );
  for (const slot of slotIds) {
    await q(`insert into pw_booking_slots (booking_id, slot_id, quoted_price_paise) values ($1, $2, 0)`, [id, slot]);
  }
  const state = status === "held" ? "reserved" : status === "paid" ? "booked" : "available";
  await q(`update pw_slots set state = $2 where id = any($1::text[])`, [slotIds, state]);
  if (opts.orderId) {
    await q(
      `insert into pw_payments (id, booking_id, provider, order_id, amount_paise, status) values ($1, $2, 'razorpay', $3, $4, 'created')`,
      [tid("pay"), id, opts.orderId, total]
    );
  }
  return id;
}

/**
 * Append-only tables (0028/0029): their triggers refuse DELETE, and DELETE is
 * revoked from the app role on the first four. The purge is privileged
 * maintenance, so it does what only the table owner can: disable the guard
 * triggers and grant itself DELETE, inside its own transaction. Both are
 * transactional, so a failed purge rolls them back; a successful one restores
 * them before COMMIT. No other session ever sees the guard down.
 */
const DELETE_REVOKED = ["pw_ledger", "pw_audit_log", "pw_condition_photos", "pw_damage_records"];
const GUARDED = [...DELETE_REVOKED, "provenance_events", "coa_certificates"];

/**
 * Delete every row a test run created, children first. Tables are listed
 * explicitly (not discovered) so a typo cannot widen the blast radius.
 */
export async function purgeTestData() {
  const like = "betest\\_%";
  const client = await pool.connect();
  try {
    await client.query("begin");
    for (const t of GUARDED) await client.query(`alter table ${t} disable trigger user`);
    for (const t of DELETE_REVOKED) await client.query(`grant delete on ${t} to current_user`);
    await client.query(`delete from pw_audit_log where subject_id like $1 or actor_id like $1`, [like]);
    await client.query(`delete from pw_notifications where user_id like $1 or recipient like '%@example.test'`, [like]);
    const ugc = `select id from pw_ugc_submissions where user_id like $1 or caption like 'betest%'`;
    await client.query(`delete from pw_community_gallery where submission_id in (${ugc})`, [like]);
    await client.query(
      `delete from pw_consents where user_id like $1
         or id in (select consent_id from pw_ugc_submissions where user_id like $1 or caption like 'betest%')`,
      [like]
    );
    await client.query(`delete from pw_ugc_submissions where id in (${ugc})`, [like]);
    await client.query(`delete from pw_invoices where booking_id like $1`, [like]);
    await client.query(
      `delete from pw_ledger where booking_id like $1 or created_by like $1 or source_ref like '%betest\\_%'`,
      [like]
    );
    await client.query(`delete from pw_refunds where booking_id like $1`, [like]);
    await client.query(`delete from pw_asset_deletions where public_id like '%betest%'`);
    await client.query(`delete from pw_payments where booking_id like $1`, [like]);
    await client.query(`delete from pw_damage_records where booking_id like $1`, [like]);
    await client.query(`delete from pw_condition_photos where booking_id like $1`, [like]);
    await client.query(`delete from pw_install_windows where booking_id like $1`, [like]);
    await client.query(`delete from pw_booking_slots where booking_id like $1`, [like]);
    await client.query(`delete from pw_agreements where booking_id like $1`, [like]);
    await client.query(`delete from pw_bookings where id like $1`, [like]);
    await client.query(`delete from pw_slots where id like $1`, [like]);
    await client.query(`delete from pw_grid_config where id like $1`, [like]);
    await client.query(`delete from pw_identity_verifications where user_id like $1`, [like]);
    // Artworks created through app code get UUID ids; they belong to betest_ users.
    const arts = `select id from artworks where id like $1 or "userId" like $1`;
    await client.query(`update art_tags set artwork_id = null, bound_at = null where artwork_id in (${arts})`, [like]);
    await client.query(`delete from art_tags where id like $1 or tag_uid ilike 'betest%'`, [like]);
    await client.query(`delete from provenance_events where artwork_id in (${arts})`, [like]);
    await client.query(`delete from mint_commitments where artwork_id in (${arts}) or user_id like $1`, [like]);
    await client.query(`delete from coa_certificates where artwork_id in (${arts}) or user_id like $1`, [like]);
    await client.query(`delete from editions where artwork_id in (${arts}) or user_id like $1`, [like]);
    await client.query(`delete from exhibition_artworks where exhibition_id like $1`, [like]);
    await client.query(`delete from exhibitions where id like $1 or user_id like $1`, [like]);
    await client.query(`delete from curators where id like $1 or user_id like $1`, [like]);
    await client.query(`delete from artworks where "userId" like $1`, [like]);
    await client.query(`delete from artist_profiles where "userId" like $1`, [like]);
    await client.query(`delete from session where "userId" like $1`, [like]);
    await client.query(`delete from account where "userId" like $1`, [like]);
    await client.query(`delete from "user" where id like $1`, [like]);
    for (const t of DELETE_REVOKED) await client.query(`revoke delete on ${t} from current_user`);
    for (const t of GUARDED) await client.query(`alter table ${t} enable trigger user`);
    await client.query("commit");
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}
