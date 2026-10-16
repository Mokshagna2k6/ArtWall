import Link from "next/link";

import { CloudinaryImage as Image } from "@/components/media/cloudinary-image";
import type { MarketplaceItem } from "@/features/marketplace/actions";
import { formatINR } from "@/features/physical-wall/money";

/**
 * The marketplace listing card, in the two shapes the homepage needs: a tile
 * for the wide grids and a compact row for the side rails.
 *
 * Server Components — nothing here is interactive. The buy/favourite controls
 * that do need a session live in `listing-actions.tsx` and are only rendered
 * on the large cards, so a 6-item rail does not ship six copies of them.
 */

export function ArtworkTile({
  item,
  sizes = "(min-width:1024px) 25vw, (min-width:640px) 33vw, 50vw",
  priority = false,
}: {
  item: MarketplaceItem;
  sizes?: string;
  priority?: boolean;
}) {
  return (
    <Link
      href={`/artwork/${item.id}`}
      className="group block overflow-hidden rounded-lg"
    >
      <div className="bg-band relative aspect-[4/3]">
        {item.imageUrl ? (
          <Image
            src={item.imageUrl}
            alt={item.title}
            fill
            sizes={sizes}
            priority={priority}
            className="object-cover transition-transform duration-500 group-hover:scale-105"
          />
        ) : (
          <NoImage />
        )}
      </div>
      <div className="mt-3">
        <h3 className="text-sm font-medium group-hover:underline">{item.title}</h3>
        <p className="text-muted-foreground text-xs">{item.artistName}</p>
        <div className="mt-1 flex items-center gap-2 text-xs">
          {item.medium && <span className="text-muted-foreground">{item.medium}</span>}
          {item.pricePaise != null && (
            <span className="font-medium">{formatINR(item.pricePaise)}</span>
          )}
        </div>
      </div>
    </Link>
  );
}

/** Compact row for the side rails: thumbnail, title, artist, price. */
export function ArtworkRow({ item }: { item: MarketplaceItem }) {
  return (
    <Link
      href={`/artwork/${item.id}`}
      className="group hover:bg-secondary/60 flex items-center gap-4 rounded-md p-2 transition-colors"
    >
      <div className="bg-band relative size-16 shrink-0 overflow-hidden rounded">
        {item.imageUrl ? (
          <Image
            src={item.imageUrl}
            alt={item.title}
            fill
            sizes="64px"
            className="object-cover"
          />
        ) : (
          <NoImage />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium group-hover:underline">{item.title}</p>
        <p className="text-muted-foreground truncate text-xs">{item.artistName}</p>
      </div>
      {item.pricePaise != null && (
        <span className="shrink-0 text-xs font-medium">{formatINR(item.pricePaise)}</span>
      )}
    </Link>
  );
}

function NoImage() {
  return (
    <div className="text-muted-foreground flex h-full items-center justify-center text-xs">
      No image
    </div>
  );
}
