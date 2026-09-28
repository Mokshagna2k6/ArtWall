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

/**
 * Delete every row a test run created, children first. Tables are listed
 * explicitly (not discovered) so a typo cannot widen the blast radius.
 */
export async function purgeTestData() {
  const like = "betest\\_%";
  const client = await pool.connect();
  try {
    await client.query("begin");
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
    await client.query(`delete from pw_ledger where booking_id like $1 or source_ref like '%betest\\_%'`, [like]);
    await client.query(`delete from pw_payments where booking_id like $1`, [like]);
    await client.query(`delete from pw_condition_photos where booking_id like $1`, [like]);
    await client.query(`delete from pw_damage_records where booking_id like $1`, [like]);
    await client.query(`delete from pw_install_windows where booking_id like $1`, [like]);
    await client.query(`delete from pw_booking_slots where booking_id like $1`, [like]);
    await client.query(`delete from pw_agreements where booking_id like $1`, [like]);
    await client.query(`delete from pw_bookings where id like $1`, [like]);
    await client.query(`delete from pw_slots where id like $1`, [like]);
    await client.query(`delete from pw_identity_verifications where user_id like $1`, [like]);
    await client.query(`delete from provenance_events where artwork_id like $1`, [like]);
    await client.query(`delete from mint_commitments where artwork_id like $1`, [like]);
    await client.query(`delete from coa_certificates where artwork_id like $1`, [like]);
    await client.query(`delete from editions where artwork_id like $1`, [like]);
    await client.query(`delete from exhibition_artworks where exhibition_id like $1`, [like]);
    await client.query(`delete from exhibitions where id like $1 or user_id like $1`, [like]);
    await client.query(`delete from curators where id like $1 or user_id like $1`, [like]);
    await client.query(`delete from artworks where "userId" like $1`, [like]);
    await client.query(`delete from artist_profiles where "userId" like $1`, [like]);
    await client.query(`delete from session where "userId" like $1`, [like]);
    await client.query(`delete from account where "userId" like $1`, [like]);
    await client.query(`delete from "user" where id like $1`, [like]);
    await client.query("commit");
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}
