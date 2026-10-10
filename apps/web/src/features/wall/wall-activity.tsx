"use client";

import { useEffect, useState } from "react";

import type { WallEvent } from "@/features/wall/store";

interface WallActivityProps {
  events: WallEvent[];
  cohortSize: number;
}

/**
 * Relative time, computed in the browser.
 *
 * Rendering "2m ago" on the server would bake the server's clock into static
 * HTML and leave a cached page insisting an event was two minutes old for the
 * next five minutes. The timestamp is passed as ISO and turned into words
 * here, after mount - which also means it is right for a reader in any
 * timezone.
 */
function useRelativeTime(iso: string): string {
  const [label, setLabel] = useState("");

  useEffect(() => {
    function format() {
      const seconds = Math.max(0, (Date.now() - Date.parse(iso)) / 1000);
      if (seconds < 60) return "just now";
      if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
      if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
      return `${Math.floor(seconds / 86400)}d ago`;
    }

    /* Deferred to the next frame rather than written straight into the effect
       body: the server has no idea what time the reader's clock says, so the
       first client render must match the server's empty label and only then
       fill in. Writing it synchronously would also be a cascading render on
       every row of the feed at once. */
    const first = requestAnimationFrame(() => setLabel(format()));
    // Cheap because the list is short; keeps "just now" from going stale on a
    // page somebody leaves open.
    const timer = setInterval(() => setLabel(format()), 30_000);

    return () => {
      cancelAnimationFrame(first);
      clearInterval(timer);
    };
  }, [iso]);

  return label;
}

function Event({ event }: { event: WallEvent }) {
  const when = useRelativeTime(event.at);

  return (
    <li className="flex min-w-56 items-center gap-3 rounded-xl border border-[#f0f0f0] bg-white px-4 py-3 shadow-[0_4px_16px_rgb(16_17_20/0.03)]">
      {/* An initial, not a photograph, we have no right to show a face here
          without the artist having chosen to publish one. */}
      <span className="font-heading inline-flex size-9 shrink-0 items-center justify-center rounded-full bg-[#f7f7f7] text-sm text-[#0f0f0f]">
        {event.name.charAt(0).toUpperCase()}
      </span>
      <span className="flex min-w-0 flex-col">
        <span className="text-small truncate font-medium">{event.name}</span>
        <span className="text-caption truncate text-[#5a5a5a]">
          {event.hasArtwork ? "Hung a work" : "Claimed a place"}
          {event.city && ` · ${event.city}`}
        </span>
      </span>
      <span className="text-caption ml-auto shrink-0 text-[#8a8a8a] tabular-nums">
        {when}
      </span>
    </li>
  );
}

/**
 * Wall activity.
 *
 * Real joins, newest first. An empty wall says it is empty rather than
 * inventing traffic - and the invitation that replaces the feed is more
 * persuasive than a fake one would have been anyway.
 */
export function WallActivity({ events, cohortSize }: WallActivityProps) {
  return (
    <section className="flex flex-col gap-4 border-y border-[#f0f0f0] py-5 sm:flex-row sm:items-center sm:gap-7">
      <div className="flex shrink-0 items-center gap-2">
        <span className="text-label tracking-[0.14em] text-[#3d3d3d] uppercase">
          Fresh on the wall
        </span>
        <span className="text-caption flex items-center gap-1.5 text-[#0f0f0f]">
          <span className="size-1.5 animate-pulse rounded-full bg-[#0f0f0f]" />
          Live
        </span>
      </div>

      {events.length === 0 ? (
        <p className="text-small text-[#5a5a5a]">
          Nobody has taken a place yet. All {cohortSize} founding places are
          open, the first one is still there.
        </p>
      ) : (
        <ul className="flex gap-3 overflow-x-auto pb-1 sm:gap-4">
          {events.map((event) => (
            <Event key={`${event.founderNumber}-${event.at}`} event={event} />
          ))}
        </ul>
      )}
    </section>
  );
}
