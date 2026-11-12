import "server-only";

import { getSql } from "@/lib/db";
import { queueNotification } from "@/features/physical-wall/notifications";

/**
 * The wishlist price-change hook (Bible §16/§17).
 *
 * There is no wishlist table and there is deliberately not going to be one:
 * `artwork_saves` (0075) already IS the wishlist — a private bookmark per
 * (user, artwork). What it lacked was a memory of the price the saver last
 * saw, which migration 0085 adds as one column on that same row.
 *
 * This sweep is the whole feature: find saved works whose price has moved
 * since the saver was last told, queue one notification each, and write the
 * new price back. `queueNotification` is the project's existing outbox — no
 * notification system is built here, and nothing sends mail inline.
 *
 * Seeding: a save with a null watermark is recorded silently, so turning this
 * on does not email every existing saver about a price that never changed.
 */

/** How much a price must move before it is worth an email. */
const MIN_CHANGE_PAISE = 100; // ₹1 — below this is a rounding edit, not news.

const inr = (paise: number) =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(
    paise / 100
  );

export async function sweepWishlistPriceChanges(): Promise<number> {
  const sql = getSql();

  // Seed first, in one statement: every save that has never been notified
  // takes today's price as its baseline and is not reported as a change.
  await sql`
    update artwork_saves s
       set last_notified_price_paise = a.price_paise
      from artworks a
     where a.id = s.artwork_id
       and s.last_notified_price_paise is null
       and a.price_paise is not null
  `;

  const changed = (await sql`
    select s.user_id, s.artwork_id, s.last_notified_price_paise as old_paise,
           a.price_paise as new_paise, a.title, u.email, u.name
      from artwork_saves s
      join artworks a on a.id = s.artwork_id
      join "user" u on u.id = s.user_id
     where a.price_paise is not null
       and s.last_notified_price_paise is not null
       and abs(a.price_paise - s.last_notified_price_paise) >= ${MIN_CHANGE_PAISE}
       and a."isPublic" = true
     limit 500
  `) as {
    user_id: string;
    artwork_id: string;
    old_paise: number;
    new_paise: number;
    title: string;
    email: string;
    name: string;
  }[];

  let queued = 0;
  for (const row of changed) {
    const direction = row.new_paise < row.old_paise ? "dropped" : "changed";
    await queueNotification({
      userId: row.user_id,
      recipient: row.email,
      subject: `Price ${direction}: ${row.title}`,
      kind: "system.notice",
      body:
        `Hi ${row.name},\n\n"${row.title}", which you saved, is now ${inr(row.new_paise)} ` +
        `(was ${inr(row.old_paise)}).\n\n— Artwall Labs`,
      // One notification per price point per saver: a re-run before the price
      // moves again is a no-op rather than a second email.
      dedupeKey: `wishlist-price:${row.user_id}:${row.artwork_id}:${row.new_paise}`,
    });

    // Written whether or not the queue deduped: the watermark records what the
    // saver has been offered the chance to hear about, not what was delivered.
    await sql`
      update artwork_saves
         set last_notified_price_paise = ${row.new_paise}
       where user_id = ${row.user_id} and artwork_id = ${row.artwork_id}
    `;
    queued += 1;
  }

  return queued;
}
