import Link from "next/link";

import { ArtworkRow, ArtworkTile } from "@/features/home/artwork-card";
import { DiscoverFeed } from "@/features/home/discover-feed";
import { MarketplaceHero, type HeroSlide } from "@/features/home/marketplace-hero";
import { ListingActions } from "@/features/home/listing-actions";
import {
  countListedToday,
  loadNewlyListed,
  loadRecentlyFavorited,
  loadTodaysPick,
  loadTrending,
} from "@/features/home/marketplace-data";
import { discoverArtworks, type MarketplaceItem } from "@/features/marketplace/actions";
import { cachedCatalog } from "@/lib/catalog-cache";

/**
 * The marketplace homepage, per CHANGES-PLAN.md §2.
 *
 * Order, top to bottom: Hero → Trending (wide) + Newly listed (rail) →
 * Recently favorited (wide) + Today's Pick (rail) → Discover (tabbed,
 * infinite scroll). Inventory and social proof come before any ask, which is
 * the point of the layout.
 *
 * Everything is a Server Component except the hero's rotation and the
 * Discover feed's tabs/paging. Those two take their first page as props, so
 * the page is complete in the HTML before any JavaScript runs.
 *
 * Reads are cached on the catalogue tag (PERF-2.06), like /discover and
 * /artwork/[id]. The demand-derived sections get a shorter window than the
 * static catalogue: they are a leaderboard, and a stale leaderboard is the
 * one thing this page is for.
 */

const DEMAND_TTL = 300;
const cachedTrending = cachedCatalog(loadTrending, "home-trending", DEMAND_TTL);
const cachedFavorited = cachedCatalog(loadRecentlyFavorited, "home-favorited", DEMAND_TTL);
const cachedTodaysPick = cachedCatalog(loadTodaysPick, "home-todays-pick", DEMAND_TTL);
const cachedNewlyListed = cachedCatalog(loadNewlyListed, "home-newly-listed", DEMAND_TTL);
const cachedListedToday = cachedCatalog(countListedToday, "home-listed-today", DEMAND_TTL);
const cachedFirstPage = cachedCatalog(discoverArtworks, "home-discover", DEMAND_TTL);

const HERO_SLIDES: readonly HeroSlide[] = [
  {
    eyebrow: "Original work, direct from the artist",
    headline: "India's artists, on one wall.",
    body: "Browse original paintings, prints, photography and sculpture from artists across the country. Every work carries its own provenance record.",
    cta: { label: "Discover art", href: "/discover" },
  },
  {
    eyebrow: "Provenance you can check",
    headline: "Every work, certified.",
    body: "A certificate of authenticity, a verifiable hash, and a timeline you can read — issued the moment a work is listed, not years later.",
    cta: { label: "How certification works", href: "/certificate" },
  },
  {
    eyebrow: "The artists",
    headline: "Meet the people behind the work.",
    body: "Studios, practices and the work in progress. Follow an artist and you see what they make next.",
    cta: { label: "Browse artists", href: "/artists" },
  },
  {
    eyebrow: "The Wall",
    headline: "Art lives on the wall.",
    body: "A living collection online, and real work hanging in a real venue. Both are the same wall.",
    cta: { label: "See The Wall", href: "/wall" },
  },
] as const;

export async function MarketplaceHome({ signedIn }: { signedIn: boolean }) {
  // One round of parallel reads; each one degrades to empty on its own rather
  // than taking the page down with it (see marketplace-data.ts).
  const [trending, newlyListed, listedToday, favorited, pick, firstPage] =
    await Promise.all([
      cachedTrending(8),
      cachedNewlyListed(6),
      cachedListedToday(),
      cachedFavorited(8, 14),
      cachedTodaysPick(),
      cachedFirstPage({ sort: "recent", limit: 24 }),
    ]);

  // Today's Pick needs exactly one work. With no signal today it falls back to
  // the strongest trending work, and only disappears when there is no
  // inventory at all — a labelled empty box is worse than one fewer section.
  const todaysPick = pick ?? trending[0] ?? newlyListed[0] ?? null;

  return (
    <div className="bg-background">
      <MarketplaceHero slides={HERO_SLIDES} />

      <Band>
        <Wide
          eyebrow="Trending"
          title="What people are looking at"
          href="/discover?sort=recent"
          items={trending.length > 0 ? trending : newlyListed}
          fallbackNote={
            trending.length === 0
              ? "Ranking starts as soon as works gather interest — the newest listings are below in the meantime."
              : undefined
          }
          signedIn={signedIn}
          priority
        />
        <Rail
          eyebrow="Newly listed"
          title={
            listedToday > 0
              ? `${listedToday} ${listedToday === 1 ? "work" : "works"} listed today`
              : "The latest works"
          }
          items={newlyListed}
          empty="No listings yet."
        />
      </Band>

      <Band>
        <Wide
          eyebrow="Recently favorited"
          title="Most saved this fortnight"
          href="/discover"
          items={favorited}
          empty="Nothing saved recently yet. Works appear here as collectors start following them."
          signedIn={signedIn}
        />
        <div>
          <p className="text-muted-foreground text-eyebrow">Today&rsquo;s Pick</p>
          {todaysPick ? (
            <div className="mt-6">
              <ArtworkTile item={todaysPick} sizes="(min-width:1024px) 33vw, 100vw" />
              <ListingActions item={todaysPick} signedIn={signedIn} />
            </div>
          ) : (
            <p className="text-muted-foreground mt-6 text-sm">
              No pick today.{" "}
              <Link href="/discover" className="underline">
                Browse the catalogue
              </Link>
            </p>
          )}
        </div>
      </Band>

      <DiscoverFeed initial={firstPage.items} initialCursor={firstPage.nextCursor} />
    </div>
  );
}

/** A wide column beside a narrow rail; stacked on anything below desktop. */
function Band({ children }: { children: React.ReactNode }) {
  return (
    <section className="border-border border-t py-16 lg:py-20">
      <div className="max-w-page mx-auto grid gap-12 px-5 sm:px-8 lg:grid-cols-[minmax(0,2.2fr)_minmax(0,1fr)] lg:gap-16 lg:px-16">
        {children}
      </div>
    </section>
  );
}

function Wide({
  eyebrow,
  title,
  href,
  items,
  empty,
  fallbackNote,
  signedIn,
  priority = false,
}: {
  eyebrow: string;
  title: string;
  href: string;
  items: MarketplaceItem[];
  empty?: string;
  fallbackNote?: string;
  signedIn: boolean;
  priority?: boolean;
}) {
  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-muted-foreground text-eyebrow">{eyebrow}</p>
          <h2 className="font-heading text-section mt-3">{title}</h2>
        </div>
        <Link href={href} className="text-sm underline">
          See all
        </Link>
      </div>
      {fallbackNote && (
        <p className="text-muted-foreground mt-3 text-sm">{fallbackNote}</p>
      )}
      {items.length === 0 ? (
        <p className="text-muted-foreground mt-8 text-sm">
          {empty ?? "Nothing to show yet."}
        </p>
      ) : (
        <div className="mt-8 grid gap-6 sm:grid-cols-2 xl:grid-cols-3">
          {items.map((item, i) => (
            <div key={item.id}>
              <ArtworkTile
                item={item}
                sizes="(min-width:1280px) 25vw, (min-width:640px) 33vw, 100vw"
                priority={priority && i === 0}
              />
              <ListingActions item={item} signedIn={signedIn} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Rail({
  eyebrow,
  title,
  items,
  empty,
}: {
  eyebrow: string;
  title: string;
  items: MarketplaceItem[];
  empty: string;
}) {
  return (
    <div>
      <p className="text-muted-foreground text-eyebrow">{eyebrow}</p>
      <h2 className="font-heading text-card mt-3">{title}</h2>
      {items.length === 0 ? (
        <p className="text-muted-foreground mt-6 text-sm">{empty}</p>
      ) : (
        <ul className="border-border mt-6 flex flex-col border-t">
          {items.map((item) => (
            <li key={item.id} className="border-border border-b py-1">
              <ArtworkRow item={item} />
            </li>
          ))}
        </ul>
      )}
      <Link href="/discover" className="mt-6 inline-block text-sm underline">
        See more
      </Link>
    </div>
  );
}
