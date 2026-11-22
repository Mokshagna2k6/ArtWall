import Link from "next/link";
import { Heart } from "lucide-react";

import { features } from "@/config/site";
import type { MarketplaceItem } from "@/features/marketplace/actions";
import { AddToCartButtons } from "@/features/orders/components/cart-buttons";

/**
 * Buy / save controls on a listing card.
 *
 * The shape is the Stitch design's: a compact "BUY" on the row and a heart in
 * the card corner. What the Bible decides is *whether* they appear, not how
 * they look — so this file is the one place that answers both questions.
 *
 * Bible §14/§42 (Patent Cluster 2): a work on exhibition is NOT for sale until
 * accumulated demand crosses the threshold. It shows Inquire instead, and the
 * card never advertises a purchase that would be refused at checkout. Note the
 * boolean: §44 forbids exposing the score itself, so the row is told only
 * whether the threshold is crossed, never by how much.
 *
 * Browsing stays free — cards and artwork pages are never gated, the sitemap
 * publishes them. Only the interaction is. With no session the control becomes
 * a link to /sign-in rather than a dead button.
 *
 * This is UX, not security: `addToCart` and every other write does its own
 * session check server-side.
 */

/** On exhibition, or on its way: Bible §14 says not for sale by default. */
const EXHIBITED = new Set(["scheduled", "on_display"]);

export function ListingActions({
  item,
  signedIn,
  thresholdCrossed = false,
}: {
  item: MarketplaceItem;
  signedIn: boolean;
  /** From the demand aggregate. The boolean only — never the score (§44). */
  thresholdCrossed?: boolean;
}) {
  const onExhibition =
    EXHIBITED.has(item.exhibitionStatus) && !thresholdCrossed;
  const buyable =
    features.marketplaceCheckout && item.pricePaise != null && !onExhibition;

  const next = encodeURIComponent(`/artwork/${item.id}`);

  return (
    <div className="mt-3 flex items-center justify-between gap-3 text-xs">
      {buyable ? (
        signedIn ? (
          <AddToCartButtons artworkId={item.id} />
        ) : (
          <Link
            href={`/sign-in?callbackUrl=${next}`}
            className="font-medium tracking-wider uppercase underline-offset-4 hover:underline"
          >
            Buy
          </Link>
        )
      ) : (
        // Not a disabled Buy: an exhibited work is genuinely not purchasable
        // yet, and Inquire is the real action (§14 step 5 — an inquiry is also
        // a weighted demand signal, so this is how the threshold is reached).
        <Link
          href={`/artwork/${item.id}`}
          className="text-muted-foreground hover:text-foreground tracking-wider uppercase transition-colors"
        >
          {onExhibition ? "Inquire" : "View"}
        </Link>
      )}

      <Link
        href={signedIn ? `/artwork/${item.id}` : `/sign-in?callbackUrl=${next}`}
        aria-label={signedIn ? `Save ${item.title}` : "Sign in to save"}
        title={signedIn ? "Save" : "Sign in to save"}
        className="text-muted-foreground hover:text-foreground shrink-0 transition-colors"
      >
        <Heart aria-hidden className="size-4" />
      </Link>
    </div>
  );
}
