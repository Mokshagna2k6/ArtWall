"use client";

import { useId, useState } from "react";
import Link from "next/link";

import { audiences } from "@/config/content";
import { cn } from "@/lib/utils";

/**
 * Artists, galleries, collectors - the same platform read three ways.
 *
 * A tablist rather than three stacked columns: the three audiences want
 * different things and reading all three at once is how a page ends up saying
 * nothing to anyone.
 *
 * Accessibility: a real ARIA tablist with roving arrow-key navigation, so it
 * behaves the way a screen-reader user expects rather than looking like tabs
 * and acting like buttons. Panels are rendered one at a time and are labelled
 * by their tab.
 */
export function Audiences() {
  const [active, setActive] = useState(0);
  const baseId = useId();

  function onKeyDown(event: React.KeyboardEvent<HTMLButtonElement>) {
    const last = audiences.length - 1;
    let next: number | null = null;

    if (event.key === "ArrowRight") next = active === last ? 0 : active + 1;
    if (event.key === "ArrowLeft") next = active === 0 ? last : active - 1;
    if (event.key === "Home") next = 0;
    if (event.key === "End") next = last;

    if (next !== null) {
      event.preventDefault();
      setActive(next);
      document.getElementById(`${baseId}-tab-${next}`)?.focus();
    }
  }

  const current = audiences[active];

  return (
    <div>
      <div
        role="tablist"
        aria-label="ArtWall for"
        className="border-border flex gap-8 border-b"
      >
        {audiences.map((audience, index) => (
          <button
            key={audience.key}
            id={`${baseId}-tab-${index}`}
            role="tab"
            type="button"
            aria-selected={index === active}
            aria-controls={`${baseId}-panel-${index}`}
            tabIndex={index === active ? 0 : -1}
            onClick={() => setActive(index)}
            onKeyDown={onKeyDown}
            className={cn(
              "-mb-px border-b py-4 text-sm transition-colors",
              index === active
                ? "border-foreground text-foreground"
                : "text-muted-foreground hover:text-foreground border-transparent"
            )}
          >
            {audience.label}
          </button>
        ))}
      </div>

      <div
        id={`${baseId}-panel-${active}`}
        role="tabpanel"
        aria-labelledby={`${baseId}-tab-${active}`}
        tabIndex={0}
        className="grid gap-10 pt-12 lg:grid-cols-[0.85fr_1.15fr] lg:gap-24"
      >
        <div className="lg:sticky lg:top-28 lg:self-start">
          <p className="text-muted-foreground text-eyebrow">
            <span className="text-foreground mr-3 tabular-nums">
              {String(active + 1).padStart(2, "0")}
            </span>
            {current.label}
          </p>
          <h3 className="font-heading text-subsection mt-5 text-balance">
            {current.headline}
          </h3>
          <p className="text-muted-foreground mt-5 text-sm leading-7">
            {current.points.length} things that change for{" "}
            {current.label.toLowerCase()} on day one.
          </p>
          <Link
            href={current.cta.href}
            className="bg-foreground mt-8 inline-flex h-11 items-center px-5 text-sm font-medium text-white transition-colors hover:bg-[#2b3245]"
          >
            {current.cta.label}
          </Link>
        </div>

        <ul className="border-border border-t">
          {current.points.map((point) => (
            <li
              key={point}
              className="border-border text-muted-foreground border-b py-4 leading-7"
            >
              {point}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
