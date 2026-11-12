import { afterAll, describe, expect, it } from "vitest";

import { makeArtwork, makeUser, purgeTestData, q } from "@/test/fixtures";
import { sweepWishlistPriceChanges } from "@/features/offers/wishlist";

/**
 * The wishlist price-change hook.
 *
 * There is no wishlist table: `artwork_saves` (0075) is the wishlist, and 0085
 * adds one watermark column to it. These tests pin the two behaviours that are
 * easy to get wrong — seeding must be silent, and a second sweep over an
 * unchanged price must send nothing.
 */

afterAll(purgeTestData);

async function saved(pricePaise: number) {
  const artist = await makeUser();
  const saver = await makeUser();
  const artworkId = await makeArtwork(artist.id, { pricePaise });
  await q(`insert into artwork_saves (user_id, artwork_id) values ($1, $2)`, [
    saver.id,
    artworkId,
  ]);
  return { saver, artworkId };
}

const notifications = (userId: string) =>
  q<{ subject: string }>(`select subject from pw_notifications where user_id = $1`, [userId]);

describe("the wishlist price sweep", () => {
  it("seeds a new save silently instead of emailing about a price that never moved", async () => {
    const { saver, artworkId } = await saved(100_000);

    await sweepWishlistPriceChanges();

    expect(await notifications(saver.id)).toHaveLength(0);
    const [row] = await q<{ last_notified_price_paise: number }>(
      `select last_notified_price_paise from artwork_saves where user_id = $1 and artwork_id = $2`,
      [saver.id, artworkId]
    );
    expect(row.last_notified_price_paise).toBe(100_000);
  });

  it("queues one notification when the price moves, and none on a re-run", async () => {
    const { saver, artworkId } = await saved(100_000);
    await sweepWishlistPriceChanges(); // seed

    await q(`update artworks set price_paise = 70000 where id = $1`, [artworkId]);
    await sweepWishlistPriceChanges();

    const sent = await notifications(saver.id);
    expect(sent).toHaveLength(1);
    expect(sent[0].subject).toMatch(/dropped/);

    // The watermark moved, so a second sweep has nothing new to say.
    await sweepWishlistPriceChanges();
    expect(await notifications(saver.id)).toHaveLength(1);
  });

  it("ignores a change smaller than a rupee", async () => {
    const { saver, artworkId } = await saved(100_000);
    await sweepWishlistPriceChanges();

    await q(`update artworks set price_paise = 100050 where id = $1`, [artworkId]);
    await sweepWishlistPriceChanges();

    expect(await notifications(saver.id)).toHaveLength(0);
  });
});
