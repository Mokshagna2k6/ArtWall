"use server";

import { z } from "zod";

import { requireBuyer } from "@/features/orders/authorize";
import { addArtworksToCart, resolveCollectionForCart, type AddResult } from "@/features/orders/cart";
import { enforcePolicy } from "@/features/orders/rate-limit";
import { attempt, parseInput, PreconditionError, type Result } from "@/features/physical-wall/actions/shared";
import { pool } from "@/lib/db/index";

/**
 * Cart actions. Every one re-derives the buyer from the session and checks the
 * work against the database; nothing about a price, a seller or a curator
 * comes from the browser.
 */

const id = z.string({ error: "Which work?" }).trim().min(1, "Which work?").max(64);
const artworkInput = z.object({ artworkId: id });
const collectionInput = z.object({ collectionId: z.string({ error: "Which collection?" }).trim().min(1).max(64) });

export async function addToCart(raw: unknown): Promise<Result<AddResult>> {
  return attempt("addToCart", async () => {
    const { artworkId } = parseInput(artworkInput, raw);
    const buyer = await requireBuyer();
    await enforcePolicy("cart", buyer.id);
    const result = await addArtworksToCart(buyer.id, [artworkId]);
    const skipped = result.skipped[0];
    if (skipped) throw new PreconditionError(`${skipped.title}: ${skipped.reason}`);
    return result;
  });
}

/** Add every currently-buyable work in a collection (buyer, artist or curator collection) to the cart. */
export async function addCollectionToCart(raw: unknown): Promise<Result<AddResult>> {
  return attempt("addCollectionToCart", async () => {
    const { collectionId } = parseInput(collectionInput, raw);
    const buyer = await requireBuyer();
    await enforcePolicy("cart", buyer.id);
    const resolved = await resolveCollectionForCart(collectionId, buyer.id);
    if (!resolved) throw new PreconditionError("We couldn't find that collection.");
    const result = await addArtworksToCart(buyer.id, resolved.artworkIds, resolved.attribution);
    if (result.added === 0 && result.alreadyInCart === 0) {
      throw new PreconditionError("None of the works in this collection are available to buy right now.");
    }
    return result;
  });
}

export async function removeFromCart(raw: unknown): Promise<Result<null>> {
  return attempt("removeFromCart", async () => {
    const { artworkId } = parseInput(artworkInput, raw);
    const buyer = await requireBuyer();
    await pool.query(`delete from cart_items where user_id = $1 and artwork_id = $2`, [buyer.id, artworkId]);
    return null;
  });
}

/**
 * Drop every line that can no longer be bought (sold, reserved by someone
 * else, unpublished, ...). The cart flags these; this is the explicit "remove
 * them" the buyer clicks before checking out.
 */
export async function removeUnavailableFromCart(raw: unknown): Promise<Result<{ removed: number }>> {
  return attempt("removeUnavailableFromCart", async () => {
    parseInput(z.object({}).strict().optional(), raw);
    const buyer = await requireBuyer();
    const { rowCount } = await pool.query(
      `delete from cart_items c where c.user_id = $1 and not exists (
         select 1 from artworks a left join artist_profiles p on p."userId" = a."userId"
         where a.id = c.artwork_id and a.status = 'available' and a."isPublic" and coalesce(p.published, false)
           and a.price_paise > 0 and a."userId" <> $1)`,
      [buyer.id]
    );
    return { removed: rowCount ?? 0 };
  });
}
