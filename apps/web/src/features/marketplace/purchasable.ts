import { classifyCartRow, ISSUE_MESSAGES, type CartIssue } from "@/features/orders/cart-rules";

/**
 * Can a visitor actually buy this work right now? (§8.7)
 *
 * The artwork page must show **Buy Now only when the work is genuinely
 * purchasable**, and Inquire alone otherwise. The authority on that is
 * `classifyCartRow` — the same rule `addToCart` and checkout enforce — so this
 * delegates to it rather than restating the conditions. Restating them is how
 * a page ends up offering a Buy Now that checkout then refuses.
 *
 * Two conditions are checked here instead, because they are not the cart's
 * concern:
 *  - the checkout feature flag: with `marketplaceCheckout` off there is no
 *    purchase flow at all, so no price is buyable;
 *  - a null viewer (logged out), which the cart rule cannot classify. A
 *    logged-out visitor sees Buy Now if the work itself is buyable; the button
 *    routes them through sign-in, and the server action re-checks.
 *
 * Pure. Unit-tested in __tests__/purchasable.test.ts.
 */

/** Not a valid `user.id` (those are better-auth ids), so it never matches a seller. */
const ANONYMOUS_VIEWER = "\u0000anonymous";

export interface PurchasableArtwork {
  ownerId: string;
  status: string;
  pricePaise: number | null;
}

export type Purchasability =
  | { buyable: true }
  | { buyable: false; reason: CartIssue | "checkout_off"; message: string };

export function purchasability(
  artwork: PurchasableArtwork,
  viewerId: string | null,
  checkoutEnabled: boolean
): Purchasability {
  if (!checkoutEnabled) {
    return {
      buyable: false,
      reason: "checkout_off",
      message: "Purchasing on ArtWall is not open yet. Enquire to reach the owner.",
    };
  }

  // The artwork row only reaches this page when it is public and the artist's
  // profile is published (see getArtworkDetail's where clause), so those two
  // are passed as satisfied; everything else is the cart rule's real check.
  const issue = classifyCartRow(
    {
      artworkId: "",
      artwork: {
        sellerId: artwork.ownerId,
        status: artwork.status,
        isPublic: true,
        sellerPublished: true,
        pricePaise: artwork.pricePaise,
      },
    },
    // No viewer: use a sentinel that can never equal a stored user id, so the
    // own-work branch is not taken for a logged-out visitor.
    viewerId ?? ANONYMOUS_VIEWER
  );

  if (issue === null) return { buyable: true };
  return { buyable: false, reason: issue, message: ISSUE_MESSAGES[issue] };
}
