"use server";

import { revalidatePath } from "next/cache";
import { and, desc, eq, sql } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/lib/db/index";
import { artworkReviews, artworks, artistProfiles, user } from "@/lib/db/schema";
import { getSessionUser } from "@/lib/session";
import { enforcePolicy } from "@/features/orders/rate-limit";
import {
  attempt,
  newId,
  parseInput,
  PreconditionError,
  readSafely,
  type Result,
} from "@/features/physical-wall/actions/shared";

/**
 * Reviews (Bible Locked Rule 39: verified reviews require verified purchases).
 *
 * The gate is `findVerifiedPurchase` below, and it is a SERVER-side join, not
 * a UI affordance: the reviewer must own an order_item for this artwork whose
 * seller_order reached a state where the money and the goods have both moved.
 * The UI hiding the form is a convenience; this is the rule.
 *
 * Standard action contract (parseInput -> attempt/readSafely -> Result<T>).
 */

const id = z.string().trim().min(1).max(64);

const reviewSchema = z.object({
  artworkId: id,
  rating: z
    .number({ error: "Choose a rating." })
    .int("Choose a whole-star rating.")
    .min(1, "Ratings run from 1 to 5.")
    .max(5, "Ratings run from 1 to 5."),
  body: z.string().trim().max(4000, "Keep a review under 4000 characters.").optional(),
});

const responseSchema = z.object({
  reviewId: id,
  body: z
    .string({ error: "Write a response first." })
    .trim()
    .min(1, "Write a response first.")
    .max(4000, "Keep a response under 4000 characters."),
});

/**
 * Terminal, money-and-goods-settled seller-order states.
 *
 * 'delivered' and 'completed' only. NOT 'paid' or 'shipped': a review written
 * before the work has arrived is not a review of the purchase, and refunds
 * still move freely in those states. This is the narrow reading of rule 39,
 * which is the right one for a rule about trust.
 */
const SETTLED_STATES = ["delivered", "completed"] as const;

async function requireActor(): Promise<string> {
  const actor = await getSessionUser();
  if (!actor) throw new PreconditionError("Sign in first.");
  return actor.id;
}

/**
 * The purchase that earns the right to review, or null.
 *
 * Raw SQL rather than drizzle because this walks orders -> seller_orders ->
 * order_items and the condition that matters (the BUYER is the reviewer, the
 * seller order is settled, the item is still active) reads as one sentence
 * here. `not exists` on artwork_reviews skips a purchase already reviewed, so
 * a second purchase of the same work earns a second review and a reload earns
 * none.
 */
async function findVerifiedPurchase(
  reviewerId: string,
  artworkId: string
): Promise<string | null> {
  const rows = await db.execute<{ id: string }>(sql`
    select oi.id
      from order_items oi
      join seller_orders so on so.id = oi.seller_order_id
      join orders o on o.id = oi.order_id
     where o.buyer_id = ${reviewerId}
       and oi.artwork_id = ${artworkId}
       and oi.active = true
       and so.status in (${sql.join(
         SETTLED_STATES.map((s) => sql`${s}`),
         sql`, `
       )})
       and not exists (select 1 from artwork_reviews r where r.order_item_id = oi.id)
     order by so.completed_at nulls last, so.delivered_at nulls last
     limit 1
  `);
  const list = Array.isArray(rows) ? rows : (rows as { rows?: { id: string }[] }).rows ?? [];
  return list[0]?.id ?? null;
}

/** Whether this viewer may write a review right now. Drives the UI only. */
export async function canReview(artworkId: string): Promise<boolean> {
  return readSafely("canReview", false, async () => {
    const parsed = parseInput(id, artworkId);
    const viewer = await getSessionUser();
    if (!viewer) return false;
    return (await findVerifiedPurchase(viewer.id, parsed)) !== null;
  });
}

/**
 * Write a review. Rule 39 is enforced here, server-side.
 *
 * The purchase lookup happens AFTER input validation and the rate limit, and
 * its result becomes `order_item_id` — a NOT NULL foreign key (migration
 * 0085). So even a caller that reached the insert directly could not write a
 * review without naming a real purchase.
 */
export async function postReview(input: {
  artworkId: string;
  rating: number;
  body?: string;
}): Promise<Result<{ id: string }>> {
  return attempt("postReview", async () => {
    const parsed = parseInput(reviewSchema, input);
    const reviewerId = await requireActor();
    // Bible rule 38: community actions are abuse-controlled. Before the read,
    // so an over-limit caller cannot probe which works they could review.
    await enforcePolicy("comment", reviewerId);

    const orderItemId = await findVerifiedPurchase(reviewerId, parsed.artworkId);
    if (!orderItemId) {
      throw new PreconditionError(
        "Only a completed purchase of this work can be reviewed."
      );
    }

    const reviewId = newId("rvw");
    await db.insert(artworkReviews).values({
      id: reviewId,
      artworkId: parsed.artworkId,
      reviewerId,
      orderItemId,
      rating: parsed.rating,
      body: parsed.body ?? null,
    });

    revalidatePath(`/artwork/${parsed.artworkId}`);
    return { id: reviewId };
  });
}

/**
 * The artist's single reply to a review (§16).
 *
 * One per review: the update refuses when `response_body` is already set,
 * rather than overwriting, so a reply cannot be quietly rewritten after it has
 * been read. Only the artwork's owner may respond.
 */
export async function respondToReview(input: {
  reviewId: string;
  body: string;
}): Promise<Result<{ id: string }>> {
  return attempt("respondToReview", async () => {
    const parsed = parseInput(responseSchema, input);
    const actorId = await requireActor();
    await enforcePolicy("comment", actorId);

    const [review] = await db
      .select({
        id: artworkReviews.id,
        artworkId: artworkReviews.artworkId,
        responseBody: artworkReviews.responseBody,
        ownerId: artworks.userId,
      })
      .from(artworkReviews)
      .innerJoin(artworks, eq(artworks.id, artworkReviews.artworkId))
      .where(eq(artworkReviews.id, parsed.reviewId))
      .limit(1);

    if (!review) throw new PreconditionError("That review no longer exists.");
    if (review.ownerId !== actorId) {
      throw new PreconditionError("Only the artist can respond to this review.");
    }
    if (review.responseBody) {
      throw new PreconditionError("You have already responded to this review.");
    }

    await db
      .update(artworkReviews)
      .set({ responseBody: parsed.body, responseAt: new Date(), updatedAt: new Date() })
      .where(eq(artworkReviews.id, parsed.reviewId));

    revalidatePath(`/artwork/${review.artworkId}`);
    return { id: parsed.reviewId };
  });
}

export interface ReviewView {
  id: string;
  rating: number;
  body: string | null;
  createdAt: Date;
  reviewerName: string;
  reviewerHandle: string | null;
  responseBody: string | null;
  responseAt: Date | null;
}

export interface ReviewSummary {
  count: number;
  average: number | null;
  reviews: ReviewView[];
}

const NO_REVIEWS: ReviewSummary = { count: 0, average: null, reviews: [] };

/**
 * Public reviews for an artwork, newest first, with the average.
 *
 * Every row here is by definition a verified purchase — the table cannot hold
 * anything else — so the reviewer's name is shown. That is the point of a
 * verified review; it is not the same as the offer path, where the Bible
 * explicitly forbids naming the buyer.
 */
export async function getArtworkReviews(artworkId: string): Promise<ReviewSummary> {
  return readSafely("getArtworkReviews", NO_REVIEWS, async () => {
    const parsed = parseInput(id, artworkId);

    const rows = await db
      .select({
        id: artworkReviews.id,
        rating: artworkReviews.rating,
        body: artworkReviews.body,
        createdAt: artworkReviews.createdAt,
        reviewerName: user.name,
        reviewerHandle: artistProfiles.handle,
        responseBody: artworkReviews.responseBody,
        responseAt: artworkReviews.responseAt,
      })
      .from(artworkReviews)
      .leftJoin(user, eq(user.id, artworkReviews.reviewerId))
      .leftJoin(artistProfiles, eq(artistProfiles.userId, artworkReviews.reviewerId))
      .where(eq(artworkReviews.artworkId, parsed))
      .orderBy(desc(artworkReviews.createdAt))
      .limit(100);

    if (rows.length === 0) return NO_REVIEWS;

    const total = rows.reduce((sum, row) => sum + row.rating, 0);
    return {
      count: rows.length,
      average: Math.round((total / rows.length) * 10) / 10,
      reviews: rows.map((row) => ({
        ...row,
        reviewerName: row.reviewerName ?? "A verified buyer",
      })),
    };
  });
}

/** The viewer's own reviews, for a dashboard. Private to them. */
export async function listMyReviews(): Promise<ReviewView[]> {
  return readSafely("listMyReviews", [], async () => {
    const viewer = await getSessionUser();
    if (!viewer) return [];

    const rows = await db
      .select({
        id: artworkReviews.id,
        rating: artworkReviews.rating,
        body: artworkReviews.body,
        createdAt: artworkReviews.createdAt,
        responseBody: artworkReviews.responseBody,
        responseAt: artworkReviews.responseAt,
        artworkTitle: artworks.title,
      })
      .from(artworkReviews)
      .innerJoin(artworks, eq(artworks.id, artworkReviews.artworkId))
      .where(and(eq(artworkReviews.reviewerId, viewer.id)))
      .orderBy(desc(artworkReviews.createdAt))
      .limit(100);

    return rows.map((row) => ({
      id: row.id,
      rating: row.rating,
      body: row.body,
      createdAt: row.createdAt,
      reviewerName: row.artworkTitle,
      reviewerHandle: null,
      responseBody: row.responseBody,
      responseAt: row.responseAt,
    }));
  });
}
