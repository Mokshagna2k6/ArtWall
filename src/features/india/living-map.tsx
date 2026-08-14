"use client";

import { motion, useReducedMotion } from "framer-motion";
import { useState } from "react";

import { cities, project } from "@/features/india/cities";
import { transition } from "@/lib/motion";
import { cn } from "@/lib/utils";

interface LivingMapProps {
  /** Cities with at least one founding artist, by name. */
  litCities?: readonly string[];
}

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
  ["Delhi", "Lucknow", "Varanasi", "Madhubani", "Guwahati"],
  ["Kolkata", "Santiniketan", "Bhubaneswar", "Hyderabad", "Chennai"],
] as const;

/**
 * A lightweight, hand-led view of India's art cities. It intentionally avoids
 * a national outline: the map is about a field of practices and people, not a
 * claim over territory. The only moving elements are the city lights and the
 * selected marker; no map tiles, canvas or external requests are required.
 */
export function LivingMap({ litCities = [] }: LivingMapProps) {
  const [selectedCity, setSelectedCity] = useState<string | null>(
    () => litCities[0] ?? null
  );
  const [hoveredCity, setHoveredCity] = useState<string | null>(null);
  const prefersReducedMotion = useReducedMotion();
  const lit = new Set(litCities);
  const activeName = hoveredCity ?? selectedCity;
  const activeCity = cities.find((city) => city.name === activeName);

  function chooseCity(name: string) {
    setSelectedCity(name);
  }

  return (
    <div className="flex flex-col gap-6">
      <section
        className="border-border bg-wall-charcoal/18 overflow-hidden rounded-xl border"
        aria-labelledby="map-title"
      >
        <div className="border-border flex flex-col gap-5 border-b px-5 py-5 sm:flex-row sm:items-end sm:justify-between sm:px-7">
          <div>
            <p
              id="map-title"
              className="text-ember text-label tracking-[0.16em] uppercase"
            >
              India, in practices
            </p>
            <p className="text-muted-foreground text-small mt-2 max-w-md">
              Follow the traditions that travel between places. Select a city to
              pause with its visual language.
            </p>
          </div>
          <dl className="flex gap-6 text-right">
            <div>
              <dt className="text-muted-foreground text-caption tracking-[0.12em] uppercase">
                Cities
              </dt>
              <dd className="font-heading text-h4 mt-1">{cities.length}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground text-caption tracking-[0.12em] uppercase">
                On the wall
              </dt>
              <dd className="font-heading text-h4 mt-1">{lit.size}</dd>
            </div>
          </dl>
        </div>

        <div className="relative px-3 pt-3 sm:px-7 sm:pt-6">
          <svg
            viewBox="0 0 100 112"
            className="mx-auto block h-auto w-full max-w-2xl"
            role="img"
            aria-label="A constellation of art cities across India"
          >
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
                      animate={{ pathLength: 1, opacity: 0.1 }}
                      transition={{ ...transition.scene, delay: index * 0.04 }}
                    />
                  );
                })
              )}
            </g>

            {cities.map((city, index) => {
              const { x, y } = project(city);
              const isLit = lit.has(city.name);
              const isSelected = selectedCity === city.name;
              const isActive = activeName === city.name;

              return (
                <motion.g
                  key={city.name}
                  initial={{ opacity: 0, scale: 0.82 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ ...transition.moderate, delay: index * 0.025 }}
                >
                  {isLit && (
                    <motion.circle
                      cx={x}
                      cy={y}
                      r={3.6}
                      fill="var(--color-signal)"
                      initial={{ opacity: 0.08 }}
                      animate={
                        prefersReducedMotion
                          ? { opacity: 0.16 }
                          : { opacity: [0.08, 0.28, 0.08] }
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
                      r={1.8}
                      fill="none"
                      stroke="var(--color-signal)"
                      strokeWidth="0.35"
                      initial={{ r: 1.8, opacity: 0 }}
                      animate={{ r: 3, opacity: 0.9 }}
                      transition={transition.moderate}
                    />
                  )}
                  {/* `r` is set as a real attribute as well as animated: on
                      the first paint Framer has nothing to read otherwise, and
                      the browser rejects r="undefined". A lit city is drawn in
                      the signal colour, a map whose on and off states are the
                      same hue is not saying anything. */}
                  <motion.circle
                    cx={x}
                    cy={y}
                    r={1.05}
                    fill={isLit ? "var(--color-signal)" : "var(--color-ink)"}
                    initial={{ r: 1.05 }}
                    animate={{
                      r: isActive ? 1.5 : 1.05,
                      opacity: isLit ? 1 : 0.34,
                    }}
                    transition={transition.base}
                  />
                  <circle
                    cx={x}
                    cy={y}
                    r={4}
                    fill="transparent"
                    tabIndex={0}
                    role="button"
                    aria-pressed={isSelected}
                    aria-label={`${city.name}, ${city.state}, ${city.known}${isLit ? ", has artists on The Wall" : ", waiting for its first artist"}`}
                    className="cursor-pointer focus:outline-none"
                    onClick={() => chooseCity(city.name)}
                    onMouseEnter={() => setHoveredCity(city.name)}
                    onMouseLeave={() => setHoveredCity(null)}
                    onFocus={() => setHoveredCity(city.name)}
                    onBlur={() => setHoveredCity(null)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        chooseCity(city.name);
                      }
                    }}
                  />
                </motion.g>
              );
            })}

            {activeCity && (
              <motion.text
                x={Math.min(project(activeCity).x + 3.5, 70)}
                y={Math.max(project(activeCity).y - 3.5, 6)}
                fill="var(--color-ink)"
                fontSize="3"
                fontFamily="var(--font-sans)"
                initial={{ opacity: 0, y: 2 }}
                animate={{ opacity: 0.8, y: 0 }}
                transition={transition.base}
              >
                {activeCity.name}
              </motion.text>
            )}
          </svg>
        </div>

        <div className="border-border min-h-24 border-t px-5 py-5 sm:px-7">
          {activeCity ? (
            <motion.div
              key={activeCity.name}
              initial={{ opacity: 0, y: 5 }}
              animate={{ opacity: 1, y: 0 }}
              transition={transition.base}
              className="flex flex-col gap-2 sm:flex-row sm:items-baseline sm:justify-between"
            >
              <div>
                <p className="font-heading text-h4">
                  {activeCity.name}
                  <span className="text-muted-foreground text-small ml-2 font-sans">
                    {activeCity.state}
                  </span>
                </p>
                <p className="text-muted-foreground text-small mt-1">
                  {activeCity.known}
                </p>
              </div>
              <p
                className={cn(
                  "text-small",
                  lit.has(activeCity.name)
                    ? "text-ember"
                    : "text-muted-foreground"
                )}
              >
                {lit.has(activeCity.name)
                  ? "A light is already on here"
                  : "Waiting for its first light"}
              </p>
            </motion.div>
          ) : (
            <p className="text-muted-foreground text-small">
              Select a city to see the tradition it carries. The first artist
              from a city lights it on The Wall.
            </p>
          )}
        </div>
      </section>

      <details className="border-border border-t pt-5">
        <summary className="text-muted-foreground hover:text-foreground text-small cursor-pointer transition-colors">
          Browse all {cities.length} cities and practices
        </summary>
        <ul className="mt-5 grid gap-x-8 gap-y-3 sm:grid-cols-2 lg:grid-cols-3">
          {cities.map((city) => (
            <li key={city.name}>
              <button
                type="button"
                onClick={() => chooseCity(city.name)}
                className={cn(
                  "text-small text-left transition-colors",
                  selectedCity === city.name
                    ? "text-ember"
                    : "text-foreground hover:text-ember"
                )}
              >
                {city.name}
                <span className="text-muted-foreground">, {city.known}</span>
              </button>
            </li>
          ))}
        </ul>
      </details>
    </div>
  );
}
