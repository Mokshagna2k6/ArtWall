import "server-only";

import type { PoolClient } from "pg";

import { newId } from "@/features/physical-wall/actions/shared";
import { destroyAsset } from "@/lib/cloudinary";
import { pool } from "@/lib/db/index";

/**
 * DPDP data-principal rights: export (BE-1.27) and erasure (BE-1.28 – 1.33).
 *
 * ERASURE — what happens, table by table. Everything below runs in ONE
 * transaction (eraseUserIn); Cloudinary files are deleted after commit from a
 * durable queue (pw_asset_deletions), so a crash or a Cloudinary outage can
 * delay a file's deletion but never lose track of it.
 *
 * Deleted outright:
 *   session, account (OAuth links + password), verification tokens  → can't sign in as, or Google-link to, the erased user
 *   artist_profiles, artworks (+ their editions, certificates, mint commitments,
 *     provenance, exhibition/curator links; art tags unbound)
 *   exhibitions, curators (+ picks), pw_identity_verifications,
 *   pw_ugc_submissions (+ gallery rows), waitlist_entries, survey_responses,
 *   pw_waitlist, pw_notifications, studio CRM rows (contacts, documents,
 *   sales, collections, rooms, tasks)
 *   Cloudinary: artwork images, UGC/selfie images, waitlist uploads, identity documents
 *
 * Kept, because a law requires it — pseudonymised (linked only to the
 * tombstoned user row: name "Deleted account", email deleted-…@removed…):
 *   pw_bookings, pw_payments, pw_refunds, pw_ledger, pw_invoices
 *     — tax records: CGST Act s.36 / Rule 56 (72 months) and Income Tax Act
 *       s.44AA. They carry no name or email of their own; invoices render the
 *       tombstone name. A B2B GSTIN on an invoice stays: it is mandatory
 *       invoice content, and a business identifier.
 *   pw_agreements — signed contracts (Limitation Act, 3 years). signed_name is
 *       replaced with a pseudonym; terms, hash and amounts stay.
 *   pw_consents — withdrawn, kept as proof that past processing was lawful
 *       (DPDP s.6(10) puts that burden on us).
 *   pw_grievances — kept for accountability; contact and body redacted.
 *   pw_audit_log — kept (security/accountability); actor_label pseudonymised
 *       (the only UPDATE its append-only trigger allows, and only while erasing).
 *   pw_condition_photos / pw_damage_records — evidence on retained bookings
 *       (damage disputes); photos of the artwork, not of the person.
 *   pw_feedback — ratings kept, free-text note cleared.
 *
 * ponytail: open question for counsel — certificates for works already SOLD
 * (a collector relies on /verify) are deleted with the artist's artworks. If
 * that is judged a legitimate-use exception, keep coa_certificates +
 * provenance for sold works and pseudonymise instead. On-chain data (Merkle
 * leaf hashes) cannot be erased; it is hashes, not personal data.
 */

/**
 * Where an erased user's id may still appear, and why (BE-2.20). Everything
 * else that referenced them is deleted by eraseUserIn; dpdp-coverage.db.test
 * scans every column of every table to hold this list to account.
 */
export const RETAINED_USER_REFERENCES = {
  '"user".id': "the tombstone row itself (name 'Deleted account', email removed)",
  "pw_bookings.artist_id": "tax record (CGST Act s.36)",
  "pw_agreements.artist_id": "signed contract, signed_name pseudonymised",
  "pw_consents.user_id": "withdrawn consents: proof past processing was lawful (DPDP s.6(10))",
  "pw_grievances.user_id": "accountability; contact and body redacted",
  "pw_feedback.artist_id": "rating on a retained booking; note cleared",
  "pw_audit_log.actor_id": "security/accountability; actor_label pseudonymised",
  "pw_audit_log.subject_id": "the account.erased entry itself",
  "pw_data_rights_requests.user_id": "the DPDP request log (BE-2.22)",
} as const;

export type DataRightsKind = "export" | "erasure";

/**
 * Append to the DPDP request log (BE-2.22, migration 0053). Pass the erasure
 * transaction's client to make "completed" commit with the erasure itself.
 */
export async function logDataRightsRequest(
  db: { query: (text: string, params: unknown[]) => Promise<unknown> },
  userId: string,
  kind: DataRightsKind,
  event: "requested" | "completed" | "failed",
  detail?: Record<string, unknown>
): Promise<void> {
  await db.query(
    `insert into pw_data_rights_requests (id, user_id, kind, event, detail) values ($1, $2, $3, $4, $5::jsonb)`,
    [newId("dsr"), userId, kind, event, detail ? JSON.stringify(detail) : null]
  );
}

export async function exportUserData(userId: string) {
  const one = async (text: string) => (await pool.query(text, [userId])).rows;
  const [
    account, profile, consents, bookings, payments, refunds, invoices, agreements, feedback, grievances,
    artworks, certificates, exhibitions, identityDocs, ugc, waitlist, wallWaitlist, surveys, notifications,
  ] = await Promise.all([
    one(`select id, name, email, role, "foundingMember", "verifiedAt", "ageDeclaredAdult", "onboardedAt",
                "nomineeName", "nomineeContact", "createdAt" from "user" where id = $1`),
    one(`select handle, "displayName", discipline, location, bio, website, instagram, published, wallet_address, "createdAt"
         from artist_profiles where "userId" = $1`),
    one(`select purpose, granted, notice_version, granted_at, withdrawn_at from pw_consents where user_id = $1 order by granted_at`),
    one(`select id, status, start_date::text, end_date::text, duration_days, total_amount_paise, gst_amount_paise,
                refund_policy_version, cancelled_reason, created_at
         from pw_bookings where artist_id = $1 order by created_at`),
    one(`select p.booking_id, p.provider, p.order_id, p.payment_id, p.amount_paise, p.status, p.created_at
         from pw_payments p join pw_bookings b on b.id = p.booking_id where b.artist_id = $1 order by p.created_at`),
    one(`select r.booking_id, r.amount_paise, r.status, r.provider_refund_id, r.created_at
         from pw_refunds r join pw_bookings b on b.id = r.booking_id where b.artist_id = $1 order by r.created_at`),
    one(`select i.number, i.booking_id, i.issue_date::text, i.place_of_supply, i.gstin_customer, i.net_paise,
                i.cgst_paise, i.sgst_paise, i.igst_paise, i.total_paise, i.status
         from pw_invoices i join pw_bookings b on b.id = i.booking_id where b.artist_id = $1 order by i.issue_date`),
    one(`select id, booking_id, terms_version, terms_hash, total_amount_paise, signed_name, signed_at
         from pw_agreements where artist_id = $1 order by signed_at`),
    one(`select booking_id, rating, nps, note, created_at from pw_feedback where artist_id = $1`),
    one(`select id, subject, body, contact, status, created_at, responded_at from pw_grievances where user_id = $1`),
    one(`select id, title, year, medium, dimensions, description, category, price_paise, status, "isPublic",
                "imageUrl", "createdAt" from artworks where "userId" = $1 order by "createdAt"`),
    one(`select id, artwork_id, metadata_hash, status, issued_at from coa_certificates where user_id = $1`),
    one(`select id, title, venue, start_date::text, end_date::text, status, created_at from exhibitions where user_id = $1`),
    // Metadata only: the document image itself is not re-served in an export.
    one(`select id, doc_kind, status, review_note, reviewed_at, created_at from pw_identity_verifications where user_id = $1`),
    one(`select id, kind, caption, url, status, created_at, withdrawn_at from pw_ugc_submissions where user_id = $1`),
    one(`select founder_number, name, email, role, practice, city, artwork_url, selfie_url, created_at
         from waitlist_entries where user_id = $1`),
    one(`select id, name, contact, city, medium, status, created_at from pw_waitlist where artist_id = $1`),
    one(`select role, practice, city, pain_points, biggest_problem, fair_commission, earns_from_art, notes, created_at
         from survey_responses where user_id = $1`),
    one(`select kind, subject, status, created_at, sent_at from pw_notifications where user_id = $1 order by created_at`),
  ]);

  return {
    exportedAt: new Date().toISOString(),
    notice:
      "Everything ArtWall holds that identifies you. Amounts are in paise. " +
      "Aggregate signals such as scan and reaction counts are not listed because they are not linked to you.",
    account,
    artistProfile: profile,
    consents,
    physicalWallBookings: bookings,
    payments,
    refunds,
    invoices,
    agreements,
    feedback,
    grievances,
    artworks,
    certificates,
    exhibitions,
    identityDocuments: identityDocs,
    ugcSubmissions: ugc,
    waitlistEntries: waitlist,
    wallWaitlist,
    surveyResponses: surveys,
    notifications,
  };
}

/** Everything in one transaction. Returns how many Cloudinary assets were queued. */
export async function eraseUserIn(client: PoolClient, userId: string): Promise<{ assetsQueued: number }> {
  const run = (text: string, params: unknown[] = [userId]) => client.query(text, params);
  // The append-only triggers (0028, 0029) let provenance and certificates be
  // deleted, and audit rows pseudonymised, only for the user named here, and
  // only in this transaction (is_local = true).
  await run(`select set_config('artwall.erasing_user', $1, true)`);
  const [{ email }] = (await run(`select email from "user" where id = $1 for update`)).rows as { email: string }[];

  // 1. Live holds released, only the ones cancelled here (not older bookings
  //    whose slots someone else may now hold).
  const released = await run(
    `update pw_bookings set status = 'cancelled', hold_expires_at = null, updated_at = now(),
            cancelled_reason = 'Account erased'
     where artist_id = $1 and status = 'held' returning id`
  );
  if (released.rowCount) {
    await run(
      `update pw_slots set state = 'available', version = version + 1, updated_at = now()
       where state = 'reserved' and id in (select slot_id from pw_booking_slots where booking_id = any($1::text[]))`,
      [released.rows.map((r) => r.id)]
    );
  }

  // 2. Queue every Cloudinary asset BEFORE its row goes.
  const queued = await run(
    `insert into pw_asset_deletions (id, public_id, reason)
     select 'ad_' || md5(random()::text || public_id), public_id, reason from (
       select "imagePublicId" as public_id, 'erasure:artwork' as reason from artworks where "userId" = $1
       union select cloudinary_id, 'erasure:ugc' from pw_ugc_submissions where user_id = $1
       union select doc_cloudinary_id, 'erasure:identity' from pw_identity_verifications where user_id = $1
       union select selfie_public_id, 'erasure:waitlist' from waitlist_entries where user_id = $1 or lower(email) = lower($2)
       union select artwork_public_id, 'erasure:waitlist' from waitlist_entries where user_id = $1 or lower(email) = lower($2)
     ) a where public_id is not null and public_id <> ''
     on conflict (public_id) do nothing`,
    [userId, email]
  );

  // 3. Sign-in: sessions, OAuth/password accounts, pending verification tokens.
  await run(`delete from session where "userId" = $1`);
  await run(`delete from account where "userId" = $1`);
  await run(`delete from verification where identifier = $1`, [email]);

  // 4. Artworks and everything hanging off them.
  const mine = `select id from artworks where "userId" = $1`;
  await run(`delete from provenance_events where artwork_id in (${mine})`);
  await run(`delete from mint_commitments where artwork_id in (${mine}) or user_id = $1`);
  await run(`delete from coa_certificates where artwork_id in (${mine}) or user_id = $1`);
  await run(`delete from editions where artwork_id in (${mine}) or user_id = $1`);
  await run(`update art_tags set artwork_id = null, bound_by = null, bound_at = null where artwork_id in (${mine})`);
  await run(`update art_tags set bound_by = null where bound_by = $1`);
  await run(
    `delete from exhibition_artworks where artwork_id in (${mine})
       or exhibition_id in (select id from exhibitions where user_id = $1)`
  );
  // exhibition_transitions (BE-3.08, 0051/0053) FKs to exhibitions on delete
  // restrict, and its own trigger permits DELETE for exactly this case —
  // erasing the exhibition's owner — the same erasing_user session setting
  // set above governs it (0053), so a plain delete inside this transaction
  // is all that's needed, no privileged trigger-disable required.
  await run(`delete from exhibition_transitions where exhibition_id in (select id from exhibitions where user_id = $1)`);
  await run(`delete from exhibitions where user_id = $1`);
  await run(
    `delete from curator_picks where artwork_id in (${mine})
       or curator_id in (select id from curators where user_id = $1)`
  );
  await run(`delete from curators where user_id = $1`);
  await run(`delete from artworks where "userId" = $1`);

  // 5. Other personal data.
  await run(
    `delete from pw_community_gallery where submission_id in (select id from pw_ugc_submissions where user_id = $1)`
  );
  await run(`delete from pw_ugc_submissions where user_id = $1`);
  await run(`delete from pw_identity_verifications where user_id = $1`);
  await run(`delete from waitlist_entries where user_id = $1 or lower(email) = lower($2)`, [userId, email]);
  await run(`delete from survey_responses where user_id = $1 or lower(email) = lower($2)`, [userId, email]);
  await run(`delete from pw_waitlist where artist_id = $1`);
  await run(`delete from pw_notifications where user_id = $1 or lower(recipient) = lower($2)`, [userId, email]);
  for (const table of ["sales", "contacts", "documents", "collections", "rooms", "tasks"]) {
    await run(`delete from ${table} where "userId" = $1`);
  }
  await run(`delete from artist_profiles where "userId" = $1`);
  await run(`update pw_qr_tokens set revoked_at = now() where subject_type = 'artist' and subject_id = $1 and revoked_at is null`);

  // 6. Retained records, pseudonymised (see the header for the legal basis).
  const pseudonym = `Erased user ${newId("x").slice(2, 10)}`;
  await run(`update pw_consents set withdrawn_at = now() where user_id = $1 and withdrawn_at is null`);
  await run(`update pw_feedback set note = null where artist_id = $1`);
  await run(`update pw_agreements set signed_name = $2 where artist_id = $1`, [userId, pseudonym]);
  await run(`update pw_grievances set contact = '[erased]', body = '[erased]' where user_id = $1`);
  await run(`update pw_audit_log set actor_label = $2 where actor_id = $1`, [userId, pseudonym]);

  // 7. The user row becomes a tombstone the retained records can point at.
  await run(
    `update "user"
     set name = 'Deleted account', email = $2, image = null, "emailVerified" = false,
         "nomineeName" = null, "nomineeContact" = null, role = 'visitor'
     where id = $1`,
    [userId, `deleted-${newId("u")}@removed.artwalllabs.com`]
  );

  return { assetsQueued: queued.rowCount ?? 0 };
}

/**
 * Delete queued Cloudinary assets. Never throws. Failures stay 'pending' with
 * the error; after 10 attempts a row is 'failed' for a human to look at.
 */
export async function processAssetDeletions(limit = 50, until = Infinity) {
  const { rows } = await pool.query<{ id: string; public_id: string }>(
    `select id, public_id from pw_asset_deletions where status = 'pending' order by created_at limit $1`,
    [limit]
  );
  let done = 0;
  let failed = 0;
  for (const row of rows) {
    if (Date.now() > until) break; // still pending, retried next run
    try {
      await destroyAsset(row.public_id);
      await pool.query(`update pw_asset_deletions set status = 'done', done_at = now(), last_error = null where id = $1`, [row.id]);
      done++;
    } catch (error) {
      console.error(`[physical-wall] Cloudinary delete failed for ${row.public_id}`, error);
      await pool.query(
        `update pw_asset_deletions
         set attempts = attempts + 1, last_error = $2,
             status = case when attempts + 1 >= 10 then 'failed' else 'pending' end
         where id = $1`,
        [row.id, String(error instanceof Error ? error.message : error).slice(0, 500)]
      );
      failed++;
    }
  }
  return { done, failed };
}
