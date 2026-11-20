import type { Metadata } from "next";
import Link from "next/link";

import {
  listWallCities,
  searchWalls,
} from "@/features/wallos/wall-manager/actions";
import {
  VENUE_TYPES,
  VENUE_TYPE_LABELS,
  venueTypeLabel,
} from "@/features/wallos/wall-manager/venue-types";

export const metadata: Metadata = {
  title: "Find a wall",
  description:
    "Cafés, restaurants, hotels and galleries with wall space for artists. Filter by city and venue, and see what a slot costs.",
  alternates: { canonical: "/walls" },
};

/**
 * The artist-facing wall search.
 *
 * A plain GET form, not a client component: the filters belong in the URL so a
 * city search is linkable, shareable and survives a reload, and the whole page
 * is then server-rendered with no JavaScript needed to use it.
 *
 * Only `listed` venues appear (see `searchWalls`), so a venue being set up is
 * invisible until its Wall Manager publishes it.
 */
export default async function WallsPage({ searchParams }: PageProps<"/walls">) {
  const params = await searchParams;
  const str = (v: string | string[] | undefined) =>
    typeof v === "string" && v ? v : undefined;

  const city = str(params.city);
  const venueType = str(params.type);
  const maxRupees = str(params.max);

  const [cities, results] = await Promise.all([
    listWallCities(),
    searchWalls({
      city,
      venueType,
      // Rupees in the URL (what the artist typed), paise in the query.
      maxPaise: maxRupees ? Math.round(Number(maxRupees) * 100) : undefined,
    }),
  ]);

  const filtered = Boolean(city || venueType || maxRupees);

  return (
    <main className="mx-auto max-w-5xl px-5 pt-28 pb-16 sm:px-8">
      <p className="text-ink-muted text-label tracking-wider uppercase">
        Physical walls
      </p>
      <h1 className="text-display font-heading mt-3">Find a wall</h1>
      <p className="text-ink-muted mt-4 max-w-prose leading-7">
        Cafés, restaurants, hotels and galleries with wall space. Pick a city,
        see what a slot costs, and book the one you want.
      </p>

      <form
        method="get"
        className="border-hairline-strong mt-10 grid grid-cols-[minmax(0,1fr)] gap-4 rounded-lg border p-4 sm:grid-cols-4 sm:items-end sm:p-5"
      >
        <label className="flex flex-col gap-1.5">
          <span className="text-label text-ink-muted tracking-wider uppercase">City</span>
          <select name="city" defaultValue={city ?? ""} className={selectClass}>
            <option value="">Anywhere</option>
            {cities.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-label text-ink-muted tracking-wider uppercase">
            Kind of place
          </span>
          <select name="type" defaultValue={venueType ?? ""} className={selectClass}>
            <option value="">Any</option>
            {VENUE_TYPES.map((t) => (
              <option key={t} value={t}>
                {VENUE_TYPE_LABELS[t]}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-label text-ink-muted tracking-wider uppercase">
            Up to (₹)
          </span>
          <input
            name="max"
            inputMode="numeric"
            defaultValue={maxRupees ?? ""}
            placeholder="Any budget"
            className={selectClass}
          />
        </label>

        <div className="flex items-center gap-3">
          <button
            type="submit"
            className="bg-ember text-wall-paper hover:bg-ember-glow text-small inline-flex h-10 items-center rounded-md border border-transparent px-4 font-medium"
          >
            Search
          </button>
          {filtered && (
            <Link href="/walls" className="text-ink-muted text-small underline underline-offset-4">
              Clear
            </Link>
          )}
        </div>
      </form>

      <p aria-live="polite" className="text-ink-muted mt-6 text-sm">
        {results.length === 0
          ? "No walls match."
          : `${results.length} ${results.length === 1 ? "venue" : "venues"}`}
      </p>

      {results.length === 0 ? (
        <p className="text-ink-muted mt-2 max-w-prose leading-7">
          {filtered
            ? "Try a different city, or clear the filters to see everything available."
            : "No venues are listed yet. Walls appear here as venues join and price their slots."}
        </p>
      ) : (
        <ul className="mt-6 grid grid-cols-[minmax(0,1fr)] gap-5 sm:grid-cols-2">
          {results.map((r) => (
            <li
              key={r.venueId}
              className="border-hairline-strong flex flex-col rounded-lg border p-5"
            >
              <h2 className="font-heading text-card">{r.venueName}</h2>
              <p className="text-ink-muted mt-1 text-sm">
                {[venueTypeLabel(r.venueType), r.city, r.state]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
              {r.addressLine && (
                <p className="text-ink-muted mt-1 text-sm">{r.addressLine}</p>
              )}
              {r.description && (
                <p className="mt-3 text-sm leading-6">{r.description}</p>
              )}

              <dl className="mt-4 flex flex-wrap gap-x-6 gap-y-1 text-sm">
                <div>
                  <dt className="text-ink-muted inline">Walls: </dt>
                  <dd className="inline tabular-nums">{r.wallCount}</dd>
                </div>
                <div>
                  <dt className="text-ink-muted inline">Free slots: </dt>
                  <dd className="inline tabular-nums">{r.availableSlots}</dd>
                </div>
                {r.fromPaise !== null && (
                  <div>
                    <dt className="text-ink-muted inline">From: </dt>
                    <dd className="inline tabular-nums">
                      ₹{(r.fromPaise / 100).toLocaleString("en-IN")}
                    </dd>
                  </div>
                )}
              </dl>

              <div className="mt-5">
                <Link
                  href="/physical-wall"
                  className="border-hairline-strong hover:border-ink text-small inline-flex h-10 items-center rounded-md border px-4 font-medium"
                >
                  Book a slot
                </Link>
              </div>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}

const selectClass =
  "border-hairline-strong bg-wall-paper text-body h-10 w-full rounded-md border px-3 focus:border-ink focus:outline-none";
