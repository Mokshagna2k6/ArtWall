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
 * Conditions checked here instead, because they are not the cart's concern:
 *  - the checkout feature flag: with `marketplaceCheckout` off there is no
 *    purchase flow at all, so no price is buyable;
 *  - a null viewer (logged out), which the cart rule cannot classify. A
 *    logged-out visitor sees Buy Now if the work itself is buyable; the button
 *    routes them through sign-in, and the server action re-checks;
 *  - **the exhibition rule** below, which the cart does not model at all.
 *
 * ## The exhibition rule (Bible §14/§42, CHANGES-PLAN §22.2)
 *
 * An artwork **on exhibition is NOT for sale by default**. It shows Save +
 * Inquire only. Buy Now appears for an exhibited work only once the demand
 * threshold has been crossed and the sale was triggered — that is Patent
 * Cluster 2, the demand-triggered sale. A work that is NOT on exhibition is
 * governed by the ordinary eligibility matrix (§2) and is purchasable as a
 * direct marketplace listing when the cart rule says so.
 *
 * `artworks.exhibition_status` ('not_exhibited' | 'scheduled' | 'on_display' |
 * 'returned', migration 0047) is read as its own state domain — per Bible §18
 * and §22.11 this deliberately does NOT fold into `artworks.status`.
 *
 * The caller passes `thresholdCrossed` from the demand aggregate. **Note it
 * passes only the boolean, never the score** — Bible §44 forbids a score,
 * threshold or confidence figure reaching a public surface, and this signature
 * makes that leak impossible rather than merely unlikely.
 *
 * Pure. Unit-tested in __tests__/purchasable.test.ts.
 */

/** Not a valid `user.id` (those are better-auth ids), so it never matches a seller. */
const ANONYMOUS_VIEWER = "\u0000anonymous";

export interface PurchasableArtwork {
  ownerId: string;
  status: string;
  pricePaise: number | null;
  /** Its own state domain (0047), never folded into `status`. */
  exhibitionStatus: string;
}

/** On exhibition, or on its way onto one: not for sale unless demand triggered it. */
const EXHIBITED = new Set(["scheduled", "on_display"]);

export type PurchasabilityReason = CartIssue | "checkout_off" | "on_exhibition";

export type Purchasability =
  | { buyable: true }
  | { buyable: false; reason: PurchasabilityReason; message: string };

export function purchasability(
  artwork: PurchasableArtwork,
  viewerId: string | null,
  checkoutEnabled: boolean,
  /** From the demand aggregate. The boolean only — never the score (§44). */
  thresholdCrossed = false
): Purchasability {
  if (!checkoutEnabled) {
    return {
      buyable: false,
      reason: "checkout_off",
      message: "Purchasing on ArtWall is not open yet. Enquire to reach the owner.",
    };
  }

  // Bible §14/§42: exhibited work is not for sale until the demand-triggered
  // sale fires. Checked BEFORE the cart rule, because an exhibited work can be
  // perfectly "available and priced" and still must not show Buy Now.
  if (EXHIBITED.has(artwork.exhibitionStatus) && !thresholdCrossed) {
    return {
      buyable: false,
      reason: "on_exhibition",
      message:
        "This work is on exhibition and not listed for sale. Inquire to register your interest with the owner.",
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
