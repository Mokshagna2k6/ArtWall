"use client";

import { useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { motion, useReducedMotion } from "framer-motion";
import { ArrowRight, Search } from "lucide-react";

import {
  cities,
  cityKey,
  outlinePath,
  project,
  regions,
  type City,
  type Region,
} from "@/features/india/cities";
import type { CityStat } from "@/features/waitlist/store";
import { transition } from "@/lib/motion";
import { cn } from "@/lib/utils";

interface LivingMapProps {
  /** Lower-cased city keys with at least one artist. */
  litCities?: readonly string[];
  /** Per-city figures, keyed the same way. */
  cityStats?: readonly CityStat[];
}

/**
 * Traditions that travel. Drawn as faint threads between places that share a
 * lineage, so the map reads as a field of practice rather than a scatter plot.
 */
const threads = [
  [
    "Srinagar",
    "Delhi",
    "Jaipur",
    "Udaipur",
    "Ahmedabad",
    "Mumbai",
    "Pune",
    "Bengaluru",
    "Kochi",
  ],
  ["Delhi", "Lucknow", "Varanasi", "Madhubani", "Patna", "Guwahati"],
  ["Kolkata", "Santiniketan", "Bhubaneswar", "Hyderabad", "Chennai"],
] as const;

const EMPTY_STAT: Omit<CityStat, "key"> = {
  artists: 0,
  founding: 0,
  onWall: 0,
  practices: [],
  featured: [],
};

/**
 * India's art cities, as a living map.
 *
 * Deliberately not a national outline — depicting India's borders inaccurately
 * is a real compliance risk for an Indian company, and this map is about where
 * artists are rather than about territory. Points of light say that better.
 *
 * What makes it *living* rather than decorative: each city is sized by how many
 * artists have actually joined from it, and selecting one opens what the roster
 * knows about that place — how many artists, how many are already hanging,
 * which practices they work in, and who they are. A city with nobody in it says
 * so, and invites the first.
 *
 * All figures come from the roster at render time. Nothing here is illustrative.
 */
export function LivingMap({ litCities = [], cityStats = [] }: LivingMapProps) {
  const prefersReducedMotion = useReducedMotion();

  const stats = useMemo(
    () => new Map(cityStats.map((stat) => [stat.key, stat])),
    [cityStats]
  );
  const lit = useMemo(() => new Set(litCities), [litCities]);

  const statFor = (city: City) =>
    stats.get(cityKey(city.name)) ?? { key: cityKey(city.name), ...EMPTY_STAT };

  // The busiest city is the natural default: an empty panel on first paint
  // teaches nothing about what the map is for.
  const busiest = useMemo(() => {
    const ranked = [...cities].sort(
      (a, b) => statFor(b).artists - statFor(a).artists
    );
    return ranked[0]?.name ?? null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cityStats]);

  const [selectedCity, setSelectedCity] = useState<string | null>(null);
  const [hoveredCity, setHoveredCity] = useState<string | null>(null);
  const [region, setRegion] = useState<Region | "All">("All");
  const [query, setQuery] = useState("");

  const activeName = hoveredCity ?? selectedCity ?? busiest;
  const activeCity = cities.find((city) => city.name === activeName);
  const activeStat = activeCity ? statFor(activeCity) : null;

  const totalArtists = cityStats.reduce((sum, stat) => sum + stat.artists, 0);
  const totalPractices = new Set(
    cityStats.flatMap((stat) => stat.practices.map((p) => p.practice))
  ).size;

  /** The largest city count, used to scale every bubble against it. */
  const peak = Math.max(1, ...cityStats.map((stat) => stat.artists));

  /**
   * Bubble radius from artist count.
   *
   * Square-rooted so the *area* tracks the count — a city with four artists
   * looks four times the ink of one with one, which is how people read circles.
   * Scaling the radius directly would make four look sixteen.
   */
  function radiusFor(count: number): number {
    if (count === 0) return 0.95;
    return 1.35 + Math.sqrt(count / peak) * 1.5;
  }

  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    return cities.filter((city) => {
      const inRegion = region === "All" || city.region === region;
      const matches =
        !term ||
        city.name.toLowerCase().includes(term) ||
        city.state.toLowerCase().includes(term) ||
        city.known.toLowerCase().includes(term);
      return inRegion && matches;
    });
  }, [region, query]);

  const visible = useMemo(
    () => new Set(filtered.map((city) => city.name)),
    [filtered]
  );

  return (
    <div className="flex flex-col gap-6">
      <section
        className="border-border overflow-hidden rounded-xl border bg-white"
        aria-labelledby="map-title"
      >
        {/* ── Header: what this is, and the three numbers that matter ── */}
        <div className="border-border flex flex-col gap-6 border-b px-5 py-6 sm:px-7 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-md">
            <p
              id="map-title"
              className="text-signal text-label tracking-[0.16em] uppercase"
            >
              India, in practices
            </p>
            <p className="text-muted-foreground mt-2.5 text-sm leading-6">
              Every light is a city an artist has joined from. Select one to see
              who is there, what they make, and how much of it is already
              hanging.
            </p>
          </div>

          <dl className="grid grid-cols-3 gap-6 sm:gap-10">
            {[
              { label: "Cities lit", value: lit.size, of: cities.length },
              { label: "Artists", value: totalArtists },
              { label: "Practices", value: totalPractices },
            ].map((stat) => (
              <div key={stat.label}>
                <dt className="text-muted-foreground text-caption tracking-[0.12em] uppercase">
                  {stat.label}
                </dt>
                <dd className="font-heading text-h4 mt-1 tabular-nums">
                  {stat.value}
                  {stat.of !== undefined && (
                    <span className="text-muted-foreground text-small font-sans">
                      {" "}
                      / {stat.of}
                    </span>
                  )}
                </dd>
              </div>
            ))}
          </dl>
        </div>

        {/* ── Controls ─────────────────────────────────────────────── */}
        <div className="border-border flex flex-col gap-4 border-b px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-7">
          <div
            role="group"
            aria-label="Filter by region"
            className="flex flex-wrap gap-1.5"
          >
            {(["All", ...regions] as const).map((option) => {
              const on = region === option;
              return (
                <button
                  key={option}
                  type="button"
                  onClick={() => setRegion(option)}
                  aria-pressed={on}
                  className={cn(
                    "text-small rounded-full border px-3 py-1.5 transition-colors",
                    on
                      ? "border-foreground bg-foreground text-white"
                      : "border-border text-muted-foreground hover:border-foreground hover:text-foreground"
                  )}
                >
                  {option}
                </button>
              );
            })}
          </div>

          <div className="relative w-full sm:w-56">
            <Search
              className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2"
              aria-hidden
            />
            <label htmlFor="map-search" className="sr-only">
              Search cities and practices
            </label>
            <input
              id="map-search"
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Pichwai, Kerala, Jaipur…"
              className="border-input focus:border-foreground h-10 w-full border bg-white pl-9 text-sm transition-colors outline-none"
            />
          </div>
        </div>

        {/* ── Map and panel, side by side on a wide screen ─────────── */}
        <div className="grid lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
          <div className="border-border relative px-3 py-5 sm:px-7 lg:border-r">
            <svg
              viewBox="0 0 100 112"
              className="mx-auto block h-auto w-full max-w-xl"
              role="img"
              aria-label="A map of India with its art cities marked, each sized by how many artists have joined from it"
            >
              {/* The landmass. A hairline with the faintest of washes, not a
                  filled shape: it is the ground the lights stand on, and a
                  solid country would out-shout every city on it.

                  Drawn from the same lat/lon projection as the cities, so the
                  two can never drift apart — swapping in official geometry
                  later needs no change here. */}
              <path
                d={outlinePath()}
                fill="var(--color-ink)"
                fillOpacity={0.03}
                stroke="var(--color-ink)"
                strokeWidth={0.28}
                strokeOpacity={0.22}
                strokeLinejoin="round"
                aria-hidden="true"
              />

              <g aria-hidden="true">
                {threads.flatMap((thread) =>
                  thread.slice(0, -1).map((name, index) => {
                    const from = cities.find((city) => city.name === name);
                    const to = cities.find(
                      (city) => city.name === thread[index + 1]
                    );
                    if (!from || !to) return null;
                    const a = project(from);
                    const b = project(to);
                    const dim = !visible.has(name) && !visible.has(to.name);
                    return (
                      <motion.line
                        key={`${name}-${thread[index + 1]}`}
                        x1={a.x}
                        y1={a.y}
                        x2={b.x}
                        y2={b.y}
                        stroke="var(--color-ink)"
                        strokeWidth="0.2"
                        initial={{ pathLength: 0, opacity: 0 }}
                        animate={{ pathLength: 1, opacity: dim ? 0.03 : 0.1 }}
                        transition={{ ...transition.scene, delay: index * 0.04 }}
                      />
                    );
                  })
                )}
              </g>

              {cities.map((city, index) => {
                const { x, y } = project(city);
                const stat = statFor(city);
                const isLit = stat.artists > 0;
                const isSelected = selectedCity === city.name;
                const isActive = activeName === city.name;
                const inView = visible.has(city.name);
                const r = radiusFor(stat.artists);

                return (
                  <motion.g
                    key={city.name}
                    initial={{ opacity: 0, scale: 0.82 }}
                    animate={{ opacity: inView ? 1 : 0.18, scale: 1 }}
                    transition={{
                      ...transition.moderate,
                      delay: index * 0.02,
                    }}
                  >
                    {isLit && inView && (
                      <motion.circle
                        cx={x}
                        cy={y}
                        r={r + 2.4}
                        fill="var(--color-signal)"
                        initial={{ opacity: 0.08 }}
                        animate={
                          prefersReducedMotion
                            ? { opacity: 0.14 }
                            : { opacity: [0.06, 0.22, 0.06] }
                        }
                        transition={{
                          duration: 3.2,
                          repeat: prefersReducedMotion ? 0 : Infinity,
                          delay: index * 0.12,
                          ease: "easeInOut",
                        }}
                      />
                    )}

                    {isSelected && (
                      <motion.circle
                        cx={x}
                        cy={y}
                        r={r + 1.6}
                        fill="none"
                        stroke="var(--color-signal)"
                        strokeWidth="0.35"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 0.9 }}
                        transition={transition.moderate}
                      />
                    )}

                    {/* `r` is a real attribute as well as animated: Framer has
                        nothing to read on first paint otherwise, and the
                        browser rejects r="undefined". */}
                    <motion.circle
                      cx={x}
                      cy={y}
                      r={r}
                      fill={isLit ? "var(--color-signal)" : "var(--color-ink)"}
                      initial={{ r }}
                      animate={{
                        r: isActive ? r * 1.25 : r,
                        opacity: isLit ? 1 : 0.3,
                      }}
                      transition={transition.base}
                    />

                    <circle
                      cx={x}
                      cy={y}
                      r={Math.max(4, r + 2.5)}
                      fill="transparent"
                      tabIndex={inView ? 0 : -1}
                      role="button"
                      aria-pressed={isSelected}
                      aria-label={`${city.name}, ${city.state}. ${city.known}. ${
                        stat.artists === 0
                          ? "No artists yet."
                          : `${stat.artists} artist${stat.artists === 1 ? "" : "s"}, ${stat.onWall} on the wall.`
                      }`}
                      className="cursor-pointer focus:outline-none"
                      onClick={() => setSelectedCity(city.name)}
                      onMouseEnter={() => setHoveredCity(city.name)}
                      onMouseLeave={() => setHoveredCity(null)}
                      onFocus={() => setHoveredCity(city.name)}
                      onBlur={() => setHoveredCity(null)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          setSelectedCity(city.name);
                        }
                      }}
                    />
                  </motion.g>
                );
              })}

              {activeCity && visible.has(activeCity.name) && (
                <motion.text
                  x={Math.min(project(activeCity).x + 4, 72)}
                  y={Math.max(project(activeCity).y - 4, 6)}
                  fill="var(--color-ink)"
                  fontSize="3"
                  fontFamily="var(--font-sans)"
                  initial={{ opacity: 0, y: 2 }}
                  animate={{ opacity: 0.85, y: 0 }}
                  transition={transition.base}
                >
                  {activeCity.name}
                </motion.text>
              )}
            </svg>

            {/* Legend. A map whose circles vary in size has to say why. */}
            <ul className="text-muted-foreground mt-4 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-xs">
              <li className="flex items-center gap-2">
                <span
                  aria-hidden
                  className="bg-signal inline-block size-2 rounded-full"
                />
                Artists here
              </li>
              <li className="flex items-center gap-2">
                <span
                  aria-hidden
                  className="bg-ink/30 inline-block size-1.5 rounded-full"
                />
                Waiting for its first
              </li>
              <li className="flex items-center gap-2">
                <span aria-hidden className="flex items-end gap-1">
                  <span className="bg-signal inline-block size-1.5 rounded-full" />
                  <span className="bg-signal inline-block size-2.5 rounded-full" />
                </span>
                Bigger means more artists
              </li>
            </ul>

            {filtered.length === 0 && (
              <p className="text-muted-foreground mt-4 text-center text-sm">
                Nothing matches.{" "}
                <button
                  type="button"
                  onClick={() => {
                    setQuery("");
                    setRegion("All");
                  }}
                  className="text-foreground underline underline-offset-4"
                >
                  Show every city
                </button>
              </p>
            )}
          </div>

          {/* ── The city panel ────────────────────────────────────── */}
          <div className="px-5 py-6 sm:px-7">
            {activeCity && activeStat ? (
              <CityPanel city={activeCity} stat={activeStat} />
            ) : (
              <p className="text-muted-foreground text-sm leading-6">
                Select a city to see who is making work there.
              </p>
            )}
          </div>
        </div>
      </section>

      {/* ── The full directory ───────────────────────────────────── */}
      <details className="border-border border-t pt-5">
        <summary className="text-muted-foreground hover:text-foreground cursor-pointer text-sm transition-colors">
          Browse all {cities.length} cities and practices
        </summary>
        <ul className="mt-5 grid gap-x-8 gap-y-1 sm:grid-cols-2 lg:grid-cols-3">
          {[...cities]
            .sort((a, b) => statFor(b).artists - statFor(a).artists)
            .map((city) => {
              const stat = statFor(city);
              return (
                <li key={city.name}>
                  <button
                    type="button"
                    onClick={() => setSelectedCity(city.name)}
                    className={cn(
                      "group flex w-full items-baseline justify-between gap-3 py-1.5 text-left text-sm transition-colors",
                      selectedCity === city.name
                        ? "text-signal"
                        : "text-foreground hover:text-signal"
                    )}
                  >
                    <span className="min-w-0">
                      {city.name}
                      <span className="text-muted-foreground">
                        , {city.known}
                      </span>
                    </span>
                    {stat.artists > 0 && (
                      <span className="text-muted-foreground shrink-0 tabular-nums">
                        {stat.artists}
                      </span>
                    )}
                  </button>
                </li>
              );
            })}
        </ul>
      </details>
    </div>
  );
}

/**
 * What the roster knows about one place.
 *
 * Written to be worth reading when the answer is zero. An empty city is not an
 * error state — it is the whole invitation the map exists to make, so it gets
 * the same care as a busy one.
 */
function CityPanel({ city, stat }: { city: City; stat: CityStat }) {
  const busiestPractice = stat.practices[0];

  return (
    <motion.div
      key={city.name}
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={transition.base}
      className="flex flex-col gap-6"
    >
      <div>
        <p className="text-muted-foreground text-caption tracking-[0.12em] uppercase">
          {city.state} · {city.region}
        </p>
        <h3 className="font-heading text-h3 mt-1.5">{city.name}</h3>
        <p className="text-muted-foreground mt-2 text-sm leading-6">
          Known for {city.known.toLowerCase()}.
        </p>
      </div>

      {stat.artists === 0 ? (
        <div className="border-border bg-band border p-5">
          <p className="font-heading text-card">No one here yet.</p>
          <p className="text-muted-foreground mt-2 text-sm leading-6">
            {city.name} is on the map because of what it makes, not because of
            who has joined. The first artist from here lights it.
          </p>
          <Link
            href="/join"
            className="text-foreground group mt-4 inline-flex items-center gap-2 text-sm underline underline-offset-4"
          >
            Be the first from {city.name}
            <ArrowRight
              className="size-3.5 transition-transform group-hover:translate-x-0.5"
              aria-hidden
            />
          </Link>
        </div>
      ) : (
        <>
          <dl className="border-border grid grid-cols-3 border-y">
            {[
              { label: "Artists", value: stat.artists },
              { label: "On the wall", value: stat.onWall },
              { label: "Founding", value: stat.founding },
            ].map((item, index) => (
              <div
                key={item.label}
                className={cn(
                  "py-4",
                  index > 0 && "border-border border-l pl-4"
                )}
              >
                <dt className="text-muted-foreground text-caption tracking-[0.12em] uppercase">
                  {item.label}
                </dt>
                <dd className="font-heading text-h4 mt-1 tabular-nums">
                  {item.value}
                </dd>
              </div>
            ))}
          </dl>

          {stat.practices.length > 0 && (
            <div>
              <p className="text-muted-foreground text-caption tracking-[0.12em] uppercase">
                What they make
              </p>
              <ul className="mt-3 flex flex-col gap-2">
                {stat.practices.map((entry) => (
                  <li key={entry.practice}>
                    <div className="flex items-baseline justify-between gap-3 text-sm">
                      <span>{entry.practice}</span>
                      <span className="text-muted-foreground tabular-nums">
                        {entry.count}
                      </span>
                    </div>
                    {/* Proportion of this city's artists, not of the country —
                        a bar that silently changes denominator is a lie. */}
                    <div className="bg-band mt-1.5 h-1 w-full overflow-hidden">
                      <div
                        className="bg-signal h-full"
                        style={{
                          width: `${Math.round((entry.count / (busiestPractice?.count ?? 1)) * 100)}%`,
                        }}
                      />
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {stat.featured.length > 0 && (
            <div>
              <p className="text-muted-foreground text-caption tracking-[0.12em] uppercase">
                Already hanging
              </p>
              <ul className="mt-3 grid grid-cols-2 gap-3">
                {stat.featured.map((artist) => (
                  <li key={artist.founderNumber}>
                    <Link
                      href="/wall"
                      className="group border-border hover:border-foreground block overflow-hidden border transition-colors"
                    >
                      <span className="bg-band relative block aspect-square overflow-hidden">
                        <Image
                          src={artist.artworkUrl}
                          alt={
                            artist.artworkTitle ??
                            `Work by ${artist.name} from ${city.name}`
                          }
                          fill
                          sizes="(min-width: 1024px) 10rem, 40vw"
                          className="object-cover transition-transform duration-500 group-hover:scale-[1.04]"
                        />
                      </span>
                      <span className="block p-2.5">
                        <span className="block truncate text-xs font-medium">
                          {artist.name}
                        </span>
                        <span className="text-muted-foreground block truncate text-xs">
                          {artist.practice ?? `No. ${artist.founderNumber}`}
                        </span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <Link
            href="/join"
            className="text-foreground group inline-flex items-center gap-2 text-sm underline underline-offset-4"
          >
            Join them from {city.name}
            <ArrowRight
              className="size-3.5 transition-transform group-hover:translate-x-0.5"
              aria-hidden
            />
          </Link>
        </>
      )}
    </motion.div>
  );
}
