"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";

import { ArtworkTile } from "@/features/home/artwork-card";
import { discoverArtworks, type MarketplaceItem } from "@/features/marketplace/actions";
import { ARTWORK_CATEGORIES, categoryLabel } from "@/features/marketplace/categories";

/**
 * The homepage Discover section, per CHANGES-PLAN.md §2.4: category tabs over
 * an infinitely scrolling grid.
 *
 * Data comes from `discoverArtworks` — the same server action /discover uses,
 * imported from `features/marketplace/actions.ts` (a "use server" module), NOT
 * from a page file. Importing from a page would pull `server-only` into this
 * client bundle: it passes `tsc --noEmit` and fails the real build.
 *
 * Paging is the action's existing keyset cursor, so a page here costs the same
 * as a page on /discover and works published mid-scroll cannot duplicate or
 * skip rows.
 *
 * Accessibility / no-JS: the first page is server-rendered and handed in as
 * `initial`, the tabs are real links to /discover?category=... (so they work
 * with JavaScript off and are crawlable), and "Load more" is a real button
 * that is always present and always usable — the IntersectionObserver only
 * clicks it early. Nothing here is reachable only by scrolling.
 */

const TABS = [
  { key: "", label: "All" },
  ...ARTWORK_CATEGORIES.map((c) => ({ key: c as string, label: categoryLabel(c) })),
] as const;

export function DiscoverFeed({
  initial,
  initialCursor,
}: {
  initial: MarketplaceItem[];
  initialCursor: string | null;
}) {
  const [category, setCategory] = useState("");
  const [items, setItems] = useState(initial);
  const [cursor, setCursor] = useState(initialCursor);
  const [error, setError] = useState(false);
  const [pending, start] = useTransition();
  const sentinel = useRef<HTMLDivElement>(null);

  /** Page forward, or restart the list when `reset` names a new category. */
  const load = useCallback(
    (reset?: string) => {
      const forCategory = reset ?? category;
      if (reset == null && cursor == null) return;
      start(async () => {
        setError(false);
        const page = await discoverArtworks({
          category: forCategory || undefined,
          sort: "recent",
          limit: 24,
          cursor: reset == null ? cursor : undefined,
        });
        // discoverArtworks swallows its own failures into an empty page
        // (readSafely). An empty first page for a category is a real "nothing
        // here"; an empty follow-up page just means the end of the list.
        if (reset != null) {
          setItems(page.items);
          setError(page.items.length === 0 && forCategory === "" && initial.length > 0);
        } else {
          setItems((current) => [...current, ...page.items]);
        }
        setCursor(page.nextCursor);
      });
    },
    [category, cursor, initial.length]
  );

  function pickCategory(key: string) {
    if (key === category) return;
    setCategory(key);
    setCursor(null);
    load(key);
  }

  // Auto-advance when the end of the list comes into view. Purely an
  // accelerator for the button below it, which stays in the document.
  useEffect(() => {
    const node = sentinel.current;
    if (!node || cursor == null || pending) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) load();
      },
      { rootMargin: "400px" }
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [cursor, pending, load]);

  return (
    <section id="discover" className="max-w-page mx-auto px-5 pb-24 sm:px-8 lg:px-16">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-muted-foreground text-eyebrow">Discover</p>
          <h2 className="font-heading text-section mt-3">Browse the collection</h2>
        </div>
        <Link href="/discover" className="text-sm underline">
          All filters
        </Link>
      </div>

      {/* Links, not buttons: each tab is a real, shareable, crawlable URL on
          /discover, and onClick only intercepts it to filter in place. */}
      <nav aria-label="Categories" className="mt-8 flex flex-wrap gap-2">
        {TABS.map((tab) => {
          const active = tab.key === category;
          return (
            <Link
              key={tab.key || "all"}
              href={tab.key ? `/discover?category=${tab.key}` : "/discover"}
              aria-current={active ? "true" : undefined}
              onClick={(event) => {
                // Let modified clicks (new tab, middle click) do the normal thing.
                if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return;
                event.preventDefault();
                pickCategory(tab.key);
              }}
              className={
                active
                  ? "bg-foreground rounded-full px-4 py-1.5 text-sm text-white"
                  : "border-border hover:border-foreground rounded-full border px-4 py-1.5 text-sm transition-colors"
              }
            >
              {tab.label}
            </Link>
          );
        })}
      </nav>

      {items.length === 0 && !pending ? (
        <p className="text-muted-foreground mt-12 text-center text-sm">
          {error
            ? "The catalogue could not be loaded just now."
            : "No works in this category yet."}{" "}
          <Link href="/discover" className="underline">
            Browse everything
          </Link>
        </p>
      ) : (
        <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {items.map((item) => (
            <ArtworkTile key={item.id} item={item} />
          ))}
        </div>
      )}

      <div ref={sentinel} aria-hidden className="h-px" />

      <div className="mt-12 flex justify-center">
        {cursor != null ? (
          <button
            type="button"
            onClick={() => load()}
            disabled={pending}
            className="border-border hover:border-foreground rounded-md border px-6 py-2.5 text-sm transition-colors disabled:opacity-60"
          >
            {pending ? "Loading…" : "Load more"}
          </button>
        ) : (
          items.length > 0 && (
            <p className="text-muted-foreground text-sm" data-testid="home-discover-end">
              That&rsquo;s everything in this category.{" "}
              <Link href="/discover" className="underline">
                Search the full catalogue
              </Link>
            </p>
          )
        )}
      </div>
    </section>
  );
}
