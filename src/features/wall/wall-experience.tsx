"use client";

/* eslint-disable @next/next/no-img-element -- pre-transformed Cloudinary
   assets; see the note in museum-wall.tsx. */

import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";
import Link from "next/link";
import { ArrowRight, Loader2, Search, X } from "lucide-react";

import { primaryCta } from "@/config/nav";
import { searchWall } from "@/features/wall/actions";
import { MuseumWall } from "@/features/wall/museum-wall";
import { TileDialog } from "@/features/wall/tile-dialog";
import { UploadForm } from "@/features/wall/upload-form";
import { WallActivity } from "@/features/wall/wall-activity";
import { WallStats } from "@/features/wall/wall-stats";
import type { WallEvent } from "@/features/wall/store";
import type { WallTile } from "@/features/wall/types";
import { tileSrc } from "@/lib/cloudinary-url";
import { Reveal, RevealGroup, RevealItem } from "@/shared/reveal";

interface WallExperienceProps {
  tiles: WallTile[];
  events: WallEvent[];
  cohortSize: number;
}

/** Long enough that a name is not searched letter by letter, short enough to
 *  feel live. Below ~200ms a fast typist fires a query per keystroke. */
const DEBOUNCE_MS = 280;

/**
 * The wall, its search, and the door onto it.
 *
 * State lives here rather than inside the wall so publishing a work and seeing
 * it appear are the same event: `UploadForm` hands the finished tile straight
 * up, this sets it as `pending`, and the wall walks the camera to the region
 * it landed in and burns our surface off it — no reload, no waiting for a
 * cache to turn over. Server revalidation happens in parallel and the
 * optimistic tile is de-duplicated against the real one once it arrives.
 */
export function WallExperience({
  tiles,
  events,
  cohortSize,
}: WallExperienceProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<WallTile[] | null>(null);
  const [searching, startSearch] = useTransition();
  const [pending, setPending] = useState<WallTile | null>(null);
  const [openTile, setOpenTile] = useState<WallTile | null>(null);
  const searchId = useId();
  const wallRef = useRef<HTMLDivElement>(null);

  const trimmed = query.trim();
  const searchActive = trimmed.length >= 2;

  /* Derived, not stored. Clearing the box must not need an effect to notice
     and write state — that leaves a frame where an empty search still shows
     the last results, and it is the cascading-render pattern React warns on. */
  const activeResults = searchActive ? results : null;

  useEffect(() => {
    if (!searchActive) return;

    const timer = setTimeout(() => {
      startSearch(async () => {
        const { tiles: found } = await searchWall(trimmed);
        setResults(found);
      });
    }, DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [trimmed, searchActive]);

  const live = useMemo(() => {
    if (!pending) return tiles.length;
    return tiles.some((tile) => tile.artworkUrl === pending.artworkUrl)
      ? tiles.length
      : tiles.length + 1;
  }, [tiles, pending]);

  /** Real figures only. A stat we cannot source is a stat we do not show. */
  const cities = useMemo(() => {
    const set = new Set<string>();
    for (const tile of tiles) if (tile.city) set.add(tile.city.toLowerCase());
    if (pending?.city) set.add(pending.city.toLowerCase());
    return set.size;
  }, [tiles, pending]);

  return (
    <div className="flex flex-col gap-10">
      <div className="flex flex-col gap-4 border-y border-[#e2ded7] py-5 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm leading-6 text-[#5b6472]">
          <span className="font-semibold text-[#101114]">
            A living collection.
          </span>{" "}
          Explore slowly—drag across the wall or scroll to move closer.
        </p>
        <a
          href="#hang-your-work"
          className="inline-flex items-center gap-2 text-sm font-semibold text-[#245fc5] transition hover:text-[#101114]"
        >
          Hang your work <ArrowRight className="size-4" aria-hidden />
        </a>
      </div>
      {/* ── The installation ─────────────────────────────────────────────
          The wall is full-bleed and the copy sits on it, because the wall is
          the product — not an illustration next to a description of one. */}
      <div
        ref={wallRef}
        className="relative overflow-hidden rounded-[1.75rem] border border-[#242427] shadow-[0_24px_70px_rgb(16_17_20/0.18)]"
      >
        {activeResults !== null ? (
          <SearchResults results={activeResults} onOpen={setOpenTile} />
        ) : (
          <MuseumWall tiles={tiles} pending={pending} onOpen={setOpenTile} />
        )}

        {activeResults === null && (
          <>
            {/* Copy sits on the artwork, so it needs its own darkness to sit
                on. Without this the headline lands on whatever tile happens to
                be behind it — which on a wall of Madhubani cream and Phad
                saffron means unreadable, at random. */}
            <div
              aria-hidden
              className="pointer-events-none absolute inset-y-0 left-0 z-20 hidden w-[38%] lg:block"
              style={{
                background:
                  "linear-gradient(to right, rgb(6 7 10 / 0.94) 0%, rgb(6 7 10 / 0.82) 45%, transparent 100%)",
              }}
            />
            <div
              aria-hidden
              className="pointer-events-none absolute inset-x-0 top-0 z-20 hidden h-40 lg:block"
              style={{
                background:
                  "linear-gradient(to bottom, rgb(6 7 10 / 0.75), transparent)",
              }}
            />

            {/* The argument, over the wall it describes. */}
            <div className="pointer-events-none absolute inset-x-0 top-0 z-30 hidden p-6 lg:block lg:p-8">
              <div className="flex items-start justify-between gap-8">
                <Reveal className="max-w-sm">
                  <p className="text-label tracking-[0.18em] text-[#e0a15d] uppercase">
                    The living collection
                  </p>
                  <h2 className="font-heading text-h2 mt-3 leading-[1.1] tracking-tight text-[#fffaf4]">
                    One wall.
                    <br />
                    <span className="text-[#e8bd89]">One place each.</span>
                  </h2>
                  <p className="text-small mt-4 leading-relaxed text-[#d5cec5]">
                    It begins as ours — a wall of Warli, Madhubani, Phad, Gond,
                    and Ajrakh that we drew ourselves. As artists join, each
                    piece of it dissolves into real work. The wall was only ever
                    ours on loan.
                  </p>
                  <Link
                    href={primaryCta.href}
                    className="text-small pointer-events-auto mt-6 inline-flex h-10 items-center rounded-full bg-[#fffaf4] px-5 font-semibold text-[#161618] transition-colors hover:bg-[#e8bd89]"
                  >
                    {primaryCta.label}
                  </Link>
                </Reveal>

                <div className="pointer-events-auto w-64 shrink-0">
                  <WallStats
                    artists={live}
                    cities={cities}
                    cohortSize={cohortSize}
                  />
                </div>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Stats, for the screens the overlay is hidden on. */}
      {activeResults === null && (
        <div className="lg:hidden">
          <WallStats artists={live} cities={cities} cohortSize={cohortSize} />
        </div>
      )}

      {/* ── Find yourself ────────────────────────────────────────────────── */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative sm:max-w-sm sm:flex-1">
          <label htmlFor={searchId} className="sr-only">
            Find an artist on the wall
          </label>
          <Search
            aria-hidden
            className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2"
          />
          <input
            id={searchId}
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Find an artist, a title, a city"
            className="border-border bg-background placeholder:text-muted-foreground text-body focus-visible:border-ember h-11 w-full rounded-md border pr-10 pl-9 transition-colors"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery("")}
              aria-label="Clear search"
              className="text-muted-foreground hover:text-foreground absolute top-1/2 right-2 inline-flex size-7 -translate-y-1/2 items-center justify-center rounded-md transition-colors"
            >
              {searching ? (
                <Loader2 className="size-4 animate-spin" aria-hidden />
              ) : (
                <X className="size-4" aria-hidden />
              )}
            </button>
          )}
        </div>

        <p
          className="text-muted-foreground text-small"
          aria-live="polite"
          role="status"
        >
          {activeResults !== null ? (
            <>
              <span className="text-foreground font-medium tabular-nums">
                {activeResults.length}
              </span>{" "}
              {activeResults.length === 1 ? "artist" : "artists"} found
            </>
          ) : (
            <>
              <span className="text-ember font-medium tabular-nums">
                {live}
              </span>{" "}
              of {cohortSize} founding places filled
            </>
          )}
        </p>
      </div>

      <WallActivity events={events} cohortSize={cohortSize} />

      <section
        id="hang-your-work"
        className="grid gap-8 border-t border-[#e7e7e5] pt-16 lg:grid-cols-[0.7fr_1.3fr] lg:gap-16"
      >
        <div>
          <p className="text-label tracking-[0.18em] text-[#245fc5] uppercase">
            Add your work
          </p>
          <h2 className="font-heading mt-4 text-4xl tracking-tight text-balance">
            Hang your work where people can find it.
          </h2>
          <p className="text-muted-foreground mt-5 leading-7">
            Add one artwork and your story to the living collection. You keep
            every right to your work; ArtWall only gives it a place to be seen.
          </p>
        </div>
        <div>
          <UploadForm
            onPublished={(tile) => {
              setPending(tile);
              setQuery("");
              // Put the wall back on screen — their work has just been hung on it,
              // and they are looking at a form.
              wallRef.current?.scrollIntoView({
                behavior: "smooth",
                block: "center",
              });
            }}
          />
        </div>
      </section>

      <TileDialog tile={openTile} onClose={() => setOpenTile(null)} />
    </div>
  );
}

/**
 * Search results, deliberately flat.
 *
 * Someone looking for their own name wants to find it, not to admire the
 * room. The museum view is the wrong tool for a lookup, so search drops the
 * ceremony entirely and shows a plain, scannable grid.
 */
function SearchResults({
  results,
  onOpen,
}: {
  results: WallTile[];
  onOpen: (tile: WallTile) => void;
}) {
  if (results.length === 0) {
    return (
      <div className="bg-wall-charcoal/40 py-24 text-center">
        <p className="text-muted-foreground text-body">
          Nobody on the wall matches that yet.
        </p>
      </div>
    );
  }

  return (
    <RevealGroup
      as="ul"
      stagger={0.04}
      className="bg-wall-charcoal/40 grid grid-cols-2 gap-2 p-3 sm:grid-cols-4 lg:grid-cols-6"
    >
      {results.map((tile) => (
        <RevealItem as="li" key={tile.artworkUrl}>
          <button
            type="button"
            onClick={() => onOpen(tile)}
            className="group ring-ember/25 hover:ring-ember relative block aspect-square w-full overflow-hidden rounded-md ring-1 transition-all"
          >
            <img
              src={tileSrc(tile.artworkUrl, 360)}
              alt={
                tile.artworkTitle
                  ? `${tile.artworkTitle} by ${tile.name}`
                  : `Artwork by ${tile.name}`
              }
              loading="lazy"
              decoding="async"
              className="size-full object-cover"
            />
            <span className="from-wall-black/95 absolute inset-x-0 bottom-0 bg-linear-to-t to-transparent p-2 text-left">
              <span className="text-caption block truncate font-medium">
                {tile.name}
              </span>
              {tile.city && (
                <span className="text-ink-muted block truncate text-[10px]">
                  {tile.city}
                </span>
              )}
            </span>
          </button>
        </RevealItem>
      ))}
    </RevealGroup>
  );
}
