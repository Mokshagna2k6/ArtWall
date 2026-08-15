"use client";

import { useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { ScanLine, Search } from "lucide-react";

import { inputClass } from "@/features/physical-wall/components/form-bits";
import type { LiveArtwork } from "@/features/physical-wall/types";

/**
 * Browsing what is on the wall (F27, F28-lite).
 *
 * Search filters what is already on the page rather than querying the server.
 * That is the right call at this size: a wall holds a few dozen works, they are
 * all rendered anyway, and a round trip per keystroke would be slower and
 * needier than filtering an array. The spec's Meilisearch index is for a
 * catalogue that spans every exhibition ever held; this is one wall, today.
 *
 * The carousel is a scroll-snapping row, not a JavaScript slider: it is
 * keyboard-scrollable, works with a trackpad and a thumb, needs no library, and
 * degrades to a plain scrolling row if anything fails.
 */
export function WallBrowser({
  artworks,
  scansByArtwork,
}: {
  artworks: LiveArtwork[];
  scansByArtwork: Record<string, number>;
}) {
  const [query, setQuery] = useState("");
  const [medium, setMedium] = useState("");

  const mediums = useMemo(
    () =>
      Array.from(
        new Set(artworks.map((work) => work.medium).filter(Boolean) as string[])
      ).sort(),
    [artworks]
  );

  const results = useMemo(() => {
    const term = query.trim().toLowerCase();
    return artworks.filter((work) => {
      const haystack = [
        work.title,
        work.artistName,
        work.medium,
        work.artistCity,
        work.description,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return (
        (!term || haystack.includes(term)) && (!medium || work.medium === medium)
      );
    });
  }, [artworks, query, medium]);

  if (artworks.length === 0) {
    return (
      <p className="border-hairline text-ink-muted rounded-md border border-dashed p-10 text-center text-sm leading-6">
        Nothing is on the wall yet. The first works go up as soon as artists
        finish installing.
      </p>
    );
  }

  const filtering = query.trim() !== "" || medium !== "";

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-wrap gap-3">
        <div className="relative min-w-56 flex-1">
          <Search
            className="text-ink-muted pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2"
            aria-hidden
          />
          <label htmlFor="wall-search" className="sr-only">
            Search what&rsquo;s on the wall
          </label>
          <input
            id="wall-search"
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search artists, titles, mediums, cities…"
            className={`${inputClass} pl-9`}
          />
        </div>

        {mediums.length > 1 && (
          <>
            <label htmlFor="wall-medium" className="sr-only">
              Filter by medium
            </label>
            <select
              id="wall-medium"
              value={medium}
              onChange={(event) => setMedium(event.target.value)}
              className={`${inputClass} max-w-48`}
            >
              <option value="">All mediums</option>
              {mediums.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </>
        )}
      </div>

      <p className="text-ink-muted text-sm" aria-live="polite">
        {filtering
          ? `${results.length} of ${artworks.length} ${results.length === 1 ? "work" : "works"}`
          : `${artworks.length} ${artworks.length === 1 ? "work" : "works"} hanging now`}
      </p>

      {results.length === 0 ? (
        <div className="border-hairline rounded-md border border-dashed p-10 text-center">
          <p className="font-heading text-card">Nothing matches</p>
          <p className="text-ink-muted mx-auto mt-2 max-w-sm text-sm leading-6">
            Try a different medium, or clear the search to see the whole wall.
          </p>
          <button
            type="button"
            onClick={() => {
              setQuery("");
              setMedium("");
            }}
            className="border-hairline-strong hover:border-ink text-small mt-5 inline-flex h-10 items-center rounded-md border px-4"
          >
            Show everything
          </button>
        </div>
      ) : filtering ? (
        // Filtered: a grid, because the result set is the whole point and a
        // horizontal rail would hide half of it off the right edge.
        <ul className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {results.map((work) => (
            <li key={work.artworkId}>
              <WorkCard work={work} scans={scansByArtwork[work.artworkId] ?? 0} />
            </li>
          ))}
        </ul>
      ) : (
        // Unfiltered: a scroll-snapping rail. The wall is a row of things on a
        // wall, and browsing it sideways is closer to walking past it.
        <ul className="-mx-5 flex snap-x snap-mandatory gap-5 overflow-x-auto px-5 pb-4 sm:mx-0 sm:px-0">
          {results.map((work) => (
            <li
              key={work.artworkId}
              className="w-64 shrink-0 snap-start sm:w-72"
            >
              <WorkCard work={work} scans={scansByArtwork[work.artworkId] ?? 0} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function WorkCard({ work, scans }: { work: LiveArtwork; scans: number }) {
  return (
    <Link
      href={`/physical-wall/a/${work.artworkId}`}
      className="group border-hairline hover:border-ink block h-full overflow-hidden rounded-md border transition-colors"
    >
      <div className="bg-band relative aspect-4/3">
        {work.imageUrl && (
          <Image
            src={work.imageUrl}
            alt={work.title}
            fill
            sizes="(min-width: 640px) 18rem, 16rem"
            className="object-cover"
          />
        )}
        <span className="bg-wall-paper/90 text-ink text-label absolute top-3 left-3 rounded-full px-2.5 py-1 tracking-wider uppercase">
          Slot {work.slotLabel}
        </span>
      </div>
      <div className="p-4">
        <p className="font-heading text-card">{work.title}</p>
        <p className="text-ink-muted mt-1 text-sm">
          {work.artistName}
          {work.medium ? ` · ${work.medium}` : ""}
        </p>
        {scans > 0 && (
          <p className="text-ink-muted mt-3 flex items-center gap-1.5 text-xs">
            <ScanLine className="size-3.5" aria-hidden />
            {scans.toLocaleString("en-IN")} scan{scans === 1 ? "" : "s"}
          </p>
        )}
      </div>
    </Link>
  );
}
