import Link from "next/link";

import { features } from "@/config/site";
import type { MarketplaceItem } from "@/features/marketplace/actions";
import { AddToCartButtons } from "@/features/orders/components/cart-buttons";

/**
 * Buy / favourite controls on a homepage listing, per CHANGES-PLAN.md §1.
 *
 * Browsing is free: the card itself and the artwork detail page are never
 * gated (the sitemap publishes them and SEO depends on it). Only the
 * interactions are. With no session the controls become a link to
 * `/sign-in?next=<path>` instead of a dead button — a logged-out visitor is
 * told what signing in is for, not handed a control that fails.
 *
 * This is UX, not security. `addToCart` and every other write still does its
 * own session check server-side; the gate here only decides what to render.
 */
export function ListingActions({
  item,
  signedIn,
}: {
  item: MarketplaceItem;
  signedIn: boolean;
}) {
  const buyable =
    features.marketplaceCheckout && item.pricePaise != null;

  if (!signedIn) {
    const next = encodeURIComponent(`/artwork/${item.id}`);
    return (
      <div className="mt-3 flex flex-wrap items-center gap-3 text-xs">
        {buyable && (
          <Link
            href={`/sign-in?next=${next}`}
            className="border-border hover:border-foreground rounded-md border px-3 py-1.5 transition-colors"
          >
            Sign in to buy
          </Link>
        )}
        <Link
          href={`/sign-in?next=${next}`}
          className="text-muted-foreground hover:text-foreground underline transition-colors"
        >
          Sign in to save
        </Link>
      </div>
    );
  }

  if (!buyable) return null;
  return <AddToCartButtons artworkId={item.id} />;
}
