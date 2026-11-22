import type { Metadata } from "next";
import { CloudinaryImage as Image } from "@/components/media/cloudinary-image";
import Link from "next/link";

import { discoverArtworks } from "@/features/marketplace/actions";
import {
  ARTWORK_CATEGORIES,
  categoryLabel,
} from "@/features/marketplace/categories";
import { formatINR } from "@/features/physical-wall/money";
import { cachedCatalog } from "@/lib/catalog-cache";

// Catalogue cache (PERF-2.06), keyed by the filters + cursor. Shorter window:
// the key space is open-ended (free-text q), so entries should age out.
const loadPage = cachedCatalog(discoverArtworks, "discover", 300);

export const metadata: Metadata = {
  title: "Discover Art",
  description:
    "Explore original artworks from India's finest contemporary artists.",
};

export default async function DiscoverPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    medium?: string;
    category?: string;
    min?: string;
    max?: string;
    sort?: string;
    cursor?: string;
  }>;
}) {
  const params = await searchParams;
  const category = ARTWORK_CATEGORIES.find((c) => c === params.category);
  const { items, nextCursor } = await loadPage({
    q: params.q,
    medium: params.medium,
    category,
    minPrice: rupeesToPaise(params.min),
    maxPrice: rupeesToPaise(params.max),
    sort: (params.sort as "recent" | "price_asc" | "price_desc" | "title") ?? "recent",
    cursor: params.cursor,
  });

  // Every filter, the sort and the page position live in the URL (FE-2.05),
  // so a filtered page is shareable and survives a reload. Submitting the
  // filter form drops `cursor`, so a new filter starts from the first page.
  const hrefWith = (cursor: string | undefined) =>
    `/discover?${new URLSearchParams(
      Object.entries({ ...params, cursor }).filter(
        (e): e is [string, string] => typeof e[1] === "string" && e[1] !== ""
      )
    )}`;
  const nextHref = nextCursor ? hrefWith(nextCursor) : null;
  const firstHref = params.cursor ? hrefWith(undefined) : null;

  return (
    <main className="mx-auto max-w-7xl px-6 py-12">
      <h1 className="text-display font-heading">Discover</h1>
      <p className="text-ink-muted mt-2 max-w-xl">
        Original artworks from India&rsquo;s contemporary artists.
      </p>

      <form method="get" className="mt-8 flex flex-wrap gap-3">
        <input
          name="q"
          type="search"
          placeholder="Search artworks…"
          aria-label="Search artworks"
          defaultValue={params.q}
          className="border-hairline rounded-md border bg-transparent px-4 py-2 text-sm"
        />
        <select
          name="category"
          aria-label="Category"
          defaultValue={category ?? ""}
          className="border-hairline rounded-md border bg-transparent px-4 py-2 text-sm"
        >
          <option value="">All categories</option>
          {ARTWORK_CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {categoryLabel(c)}
            </option>
          ))}
        </select>
        <input
          name="min"
          type="number"
          min={0}
          step="any"
          inputMode="decimal"
          placeholder="Min ₹"
          aria-label="Minimum price in rupees"
          defaultValue={params.min}
          className="border-hairline w-28 rounded-md border bg-transparent px-4 py-2 text-sm"
        />
        <input
          name="max"
          type="number"
          min={0}
          step="any"
          inputMode="decimal"
          placeholder="Max ₹"
          aria-label="Maximum price in rupees"
          defaultValue={params.max}
          className="border-hairline w-28 rounded-md border bg-transparent px-4 py-2 text-sm"
        />
        <select
          name="sort"
          aria-label="Sort by"
          defaultValue={params.sort ?? "recent"}
          className="border-hairline rounded-md border bg-transparent px-4 py-2 text-sm"
        >
          <option value="recent">Newest</option>
          <option value="price_asc">Price: Low → High</option>
          <option value="price_desc">Price: High → Low</option>
          <option value="title">A → Z</option>
        </select>
        <button
          type="submit"
          className="bg-ink text-paper rounded-md px-4 py-2 text-sm"
        >
          Search
        </button>
      </form>

      {items.length === 0 ? (
        <p className="text-ink-muted mt-16 text-center">
          No artworks found. Try a different search.
        </p>
      ) : (
        <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {items.map((item) => (
            <Link
              key={item.id}
              href={`/artwork/${item.id}`}
              className="group block overflow-hidden rounded-lg"
            >
              <div className="bg-band relative aspect-[4/3]">
                {item.imageUrl ? (
                  <Image
                    src={item.imageUrl}
                    alt={item.title}
                    fill
                    className="object-cover transition-transform group-hover:scale-105"
                    sizes="(min-width:1280px) 25vw, (min-width:1024px) 33vw, (min-width:640px) 50vw, 100vw"
                  />
                ) : (
                  <div className="text-ink-muted flex h-full items-center justify-center text-sm">
                    No image
                  </div>
                )}
              </div>
              <div className="mt-3">
                <h2 className="text-sm font-medium group-hover:underline">
                  {item.title}
                </h2>
                <p className="text-ink-muted text-xs">{item.artistName}</p>
                <div className="mt-1 flex items-center gap-2 text-xs">
                  {item.medium && (
                    <span className="text-ink-muted">{item.medium}</span>
                  )}
                  {item.pricePaise != null && (
                    <span className="font-medium">
                      {formatINR(item.pricePaise)}
                    </span>
                  )}
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}

      {/* Keyset pagination (PERF-1.07): forward-only "next" plus a way back
          to the start, and an explicit end state (FE-2.06). */}
      {(nextHref || firstHref || items.length > 0) && (
        <nav
          aria-label="Pagination"
          className="mt-12 flex flex-wrap items-center justify-center gap-4 text-sm"
        >
          {firstHref && (
            <Link
              href={firstHref}
              className="border-hairline inline-block rounded-md border px-4 py-2"
            >
              ← First page
            </Link>
          )}
          {nextHref ? (
            <Link
              href={nextHref}
              className="border-hairline inline-block rounded-md border px-4 py-2"
            >
              More artworks →
            </Link>
          ) : (
            items.length > 0 && (
              <p className="text-ink-muted" data-testid="discover-end">
                That&rsquo;s everything — no more results.
              </p>
            )
          )}
        </nav>
      )}
    </main>
  );
}

/** Rupees from a query string -> paise; blank or garbage means no bound. */
function rupeesToPaise(value: string | undefined): number | undefined {
  if (value == null || value.trim() === "") return undefined;
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) : undefined;
}
