import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { actAs, type TestUser } from "@/test/db-setup";
import { makeArtwork, makeUser, purgeTestData, q, tid } from "@/test/fixtures";
import {
  canReview,
  getArtworkReviews,
  postReview,
  respondToReview,
} from "@/features/reviews/actions";

/**
 * Bible Locked Rule 39: verified reviews require verified purchases.
 *
 * This is the whole point of the feature, so it is tested from both sides:
 * someone WITHOUT a settled purchase cannot write a review through the action,
 * and a row without a purchase cannot exist in the table at all (the NOT NULL
 * order_item_id foreign key, migration 0085).
 */

afterAll(purgeTestData);
beforeEach(() => actAs(null));

/**
 * A purchase of `artworkId` by `buyer`, left in `status`.
 *
 * Written as raw inserts rather than driven through checkout: this suite is
 * about what counts as a verified purchase, and going through the real
 * checkout would make every test also depend on payment and escrow.
 */
async function purchase(
  buyer: TestUser,
  sellerId: string,
  artworkId: string,
  status: "paid" | "shipped" | "delivered" | "completed" = "completed"
) {
  const orderId = tid("ord");
  const sellerOrderId = tid("sord");
  const itemId = tid("oit");
  const policy = (
    await q<{ id: string }>(`select id from commission_policy_versions limit 1`)
  )[0];

  await q(
    `insert into orders (id, order_number, buyer_id, buyer_email, buyer_phone,
                         status, subtotal_paise, shipping_paise, total_paise,
                         shipping_address, expires_at)
     values ($1, $1, $2, $3, '9999999999', 'paid', 100000, 0, 100000, '{}', now() + interval '1 day')`,
    [orderId, buyer.id, buyer.email]
  );
  await q(
    `insert into seller_orders (id, order_id, seller_id, status, subtotal_paise,
                                shipping_paise, total_paise, platform_fee_paise,
                                seller_net_paise, commission_policy_version_id)
     values ($1, $2, $3, $4, 100000, 0, 100000, 10000, 90000, $5)`,
    [sellerOrderId, orderId, sellerId, status, policy.id]
  );
  await q(
    `insert into order_items (id, order_id, seller_order_id, artwork_id, seller_id,
                              title_snapshot, unit_price_paise, platform_fee_paise, seller_net_paise)
     values ($1, $2, $3, $4, $5, 'Work', 100000, 10000, 90000)`,
    [itemId, orderId, sellerOrderId, artworkId, sellerId]
  );
  return { orderId, sellerOrderId, itemId };
}

async function scene() {
  const artist = await makeUser();
  const buyer = await makeUser();
  const artworkId = await makeArtwork(artist.id, { pricePaise: 100_000 });
  return { artist, buyer, artworkId };
}

describe("the verified-purchase gate (rule 39)", () => {
  it("refuses a review from someone who never bought the work", async () => {
    const { buyer, artworkId } = await scene();
    actAs(buyer);

    const result = await postReview({ artworkId, rating: 5, body: "Lovely." });
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.error).toMatch(/completed purchase/i);

    const rows = await q(`select 1 from artwork_reviews where artwork_id = $1`, [artworkId]);
    expect(rows).toHaveLength(0);
  });

  it("allows a review once the purchase is completed", async () => {
    const { artist, buyer, artworkId } = await scene();
    await purchase(buyer, artist.id, artworkId, "completed");
    actAs(buyer);

    expect(await canReview(artworkId)).toBe(true);
    const result = await postReview({ artworkId, rating: 4, body: "Arrived well packed." });
    expect(result.ok).toBe(true);

    const summary = await getArtworkReviews(artworkId);
    expect(summary.count).toBe(1);
    expect(summary.average).toBe(4);
  });

  it("accepts a delivered purchase as well as a completed one", async () => {
    const { artist, buyer, artworkId } = await scene();
    await purchase(buyer, artist.id, artworkId, "delivered");
    actAs(buyer);
    expect(await canReview(artworkId)).toBe(true);
    expect((await postReview({ artworkId, rating: 5 })).ok).toBe(true);
  });

  it("refuses a purchase that has only been paid for, or only shipped", async () => {
    for (const status of ["paid", "shipped"] as const) {
      const { artist, buyer, artworkId } = await scene();
      await purchase(buyer, artist.id, artworkId, status);
      actAs(buyer);

      expect(await canReview(artworkId)).toBe(false);
      expect((await postReview({ artworkId, rating: 5 })).ok).toBe(false);
    }
  });

  it("refuses a review of a DIFFERENT work by someone who bought another one", async () => {
    const { artist, buyer, artworkId } = await scene();
    const otherArtwork = await makeArtwork(artist.id, { pricePaise: 100_000 });
    await purchase(buyer, artist.id, artworkId, "completed");
    actAs(buyer);

    expect(await canReview(otherArtwork)).toBe(false);
    expect((await postReview({ artworkId: otherArtwork, rating: 5 })).ok).toBe(false);
  });

  it("refuses a signed-out reviewer", async () => {
    const { artist, buyer, artworkId } = await scene();
    await purchase(buyer, artist.id, artworkId, "completed");
    actAs(null);
    expect(await canReview(artworkId)).toBe(false);
    expect((await postReview({ artworkId, rating: 5 })).ok).toBe(false);
  });

  it("is enforced by the database too: a review needs a real order item", async () => {
    const { buyer, artworkId } = await scene();
    await expect(
      q(
        `insert into artwork_reviews (id, artwork_id, reviewer_id, order_item_id, rating)
         values ($1, $2, $3, 'no_such_purchase', 5)`,
        [tid("rvw"), artworkId, buyer.id]
      )
    ).rejects.toThrow(/order_item_id|foreign key/i);
  });
});

describe("one review per purchase", () => {
  it("refuses a second review of the same purchase", async () => {
    const { artist, buyer, artworkId } = await scene();
    await purchase(buyer, artist.id, artworkId, "completed");
    actAs(buyer);

    expect((await postReview({ artworkId, rating: 5 })).ok).toBe(true);
    // The purchase is spent; canReview goes false and the action refuses.
    expect(await canReview(artworkId)).toBe(false);
    expect((await postReview({ artworkId, rating: 1 })).ok).toBe(false);

    const rows = await q(`select 1 from artwork_reviews where artwork_id = $1`, [artworkId]);
    expect(rows).toHaveLength(1);
  });

  it("the unique constraint backs that up", async () => {
    const { artist, buyer, artworkId } = await scene();
    const { itemId } = await purchase(buyer, artist.id, artworkId, "completed");
    await q(
      `insert into artwork_reviews (id, artwork_id, reviewer_id, order_item_id, rating)
       values ($1, $2, $3, $4, 5)`,
      [tid("rvw"), artworkId, buyer.id, itemId]
    );
    await expect(
      q(
        `insert into artwork_reviews (id, artwork_id, reviewer_id, order_item_id, rating)
         values ($1, $2, $3, $4, 3)`,
        [tid("rvw"), artworkId, buyer.id, itemId]
      )
    ).rejects.toThrow(/one_per_purchase/);
  });
});

describe("rating bounds", () => {
  it("refuses a rating outside 1-5 at the action", async () => {
    const { artist, buyer, artworkId } = await scene();
    await purchase(buyer, artist.id, artworkId, "completed");
    actAs(buyer);
    expect((await postReview({ artworkId, rating: 0 })).ok).toBe(false);
    expect((await postReview({ artworkId, rating: 6 })).ok).toBe(false);
    expect((await postReview({ artworkId, rating: 4.5 })).ok).toBe(false);
  });

  it("and at the database", async () => {
    const { artist, buyer, artworkId } = await scene();
    const { itemId } = await purchase(buyer, artist.id, artworkId, "completed");
    await expect(
      q(
        `insert into artwork_reviews (id, artwork_id, reviewer_id, order_item_id, rating)
         values ($1, $2, $3, $4, 6)`,
        [tid("rvw"), artworkId, buyer.id, itemId]
      )
    ).rejects.toThrow(/artwork_reviews_rating/);
  });
});

describe("the artist's single response", () => {
  async function reviewed() {
    const { artist, buyer, artworkId } = await scene();
    await purchase(buyer, artist.id, artworkId, "completed");
    actAs(buyer);
    const posted = await postReview({ artworkId, rating: 5, body: "Great." });
    return { artist, buyer, artworkId, reviewId: posted.ok ? posted.data.id : "" };
  }

  it("lets the artist respond once", async () => {
    const { artist, reviewId, artworkId } = await reviewed();
    actAs(artist);
    expect((await respondToReview({ reviewId, body: "Thank you." })).ok).toBe(true);

    const summary = await getArtworkReviews(artworkId);
    expect(summary.reviews[0].responseBody).toBe("Thank you.");
  });

  it("refuses a second response", async () => {
    const { artist, reviewId } = await reviewed();
    actAs(artist);
    expect((await respondToReview({ reviewId, body: "Thank you." })).ok).toBe(true);
    expect((await respondToReview({ reviewId, body: "Actually…" })).ok).toBe(false);
  });

  it("refuses a response from anyone but the artwork's owner", async () => {
    const { buyer, reviewId } = await reviewed();
    actAs(buyer);
    expect((await respondToReview({ reviewId, body: "Mine now." })).ok).toBe(false);

    const stranger = await makeUser();
    actAs(stranger);
    expect((await respondToReview({ reviewId, body: "Hello." })).ok).toBe(false);
  });
});
