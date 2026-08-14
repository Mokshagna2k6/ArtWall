"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { services } from "@/config/content";
import { GenesisTile } from "@/features/wall/genesis-tile";
import { cn } from "@/lib/utils";

/**
 * The six systems, as a card grid.
 *
 * Three across, dropping to two then one. Each card carries a numbered badge,
 * the system name, its short line, and a disclosure that opens the full
 * description in place.
 *
 * Why disclosure rather than truncating the detail at a character count: the
 * copy already has a written short line and a written long one, so cutting a
 * sentence mid-word to make it fit is throwing away work an editor already
 * did. The card shows the short line, and "Find out more" reveals the rest
 * without a navigation.
 *
 * Accessibility: the toggle is a real button with `aria-expanded` and
 * `aria-controls`, and the detail is a plain region - no ARIA widget pattern
 * to learn. The card's height changes on open, so the grid uses `items-start`
 * to stop a row of neighbours stretching to match.
 */
/** One tradition per card, fixed so the set never reshuffles between renders. */
const TILE_SEEDS = [1204, 3391, 2087, 1750, 4103, 1566] as const;

export function ServiceCards() {
  const [open, setOpen] = useState<number | null>(null);

  return (
    <ul className="grid items-start gap-5 sm:grid-cols-2 lg:grid-cols-3">
      {services.map((service, index) => {
        const expanded = open === index;
        const panelId = `service-detail-${index}`;

        return (
          <li
            key={service.number}
            className={cn(
              "group/card border-border flex h-full flex-col overflow-hidden border bg-white p-6 transition-colors duration-200 sm:p-7",
              expanded ? "border-signal/40" : "hover:border-hairline-strong"
            )}
          >
            {/* Image-topped, the way a gallery or an art-services company
                builds a card: the work first, at full card width, then the
                text beneath it. A small coloured number chip in its place was
                the single biggest thing making these read as generic SaaS. */}
            <span
              aria-hidden
              className="border-border relative -mx-6 -mt-6 mb-6 block aspect-[16/9] overflow-hidden border-b sm:-mx-7 sm:-mt-7"
            >
              <GenesisTile
                seed={TILE_SEEDS[index]}
                className="size-full transition-transform duration-500 group-hover/card:scale-[1.03]"
              />
              <span className="text-eyebrow absolute top-0 left-0 bg-white px-2.5 py-1.5 tabular-nums">
                {service.number}
              </span>
            </span>

            <h3 className="font-heading text-subsection">{service.title}</h3>

            <p className="text-muted-foreground mt-3 leading-7">
              {service.summary}
            </p>

            {expanded && (
              <p
                id={panelId}
                className="text-muted-foreground border-border mt-4 border-t pt-4 leading-7"
              >
                {service.detail}
              </p>
            )}

            {/* mt-auto pins the action to the bottom, so a short card and a
                long one in the same row still line their links up. */}
            <div className="mt-auto pt-6">
              <button
                type="button"
                onClick={() => setOpen(expanded ? null : index)}
                aria-expanded={expanded}
                aria-controls={expanded ? panelId : undefined}
                className="text-signal group inline-flex items-center gap-2 text-sm font-medium"
              >
                {expanded ? "Show less" : "Find out more"}
                <ArrowRight
                  aria-hidden
                  className={cn(
                    "size-3.5 transition-transform duration-200",
                    expanded ? "-rotate-90" : "group-hover:translate-x-0.5"
                  )}
                />
                <span className="sr-only"> about {service.title}</span>
              </button>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

/** The quiet link out to the page that lists all six in full. */
export function ServicesFooterLink() {
  return (
    <Link
      href="/platform#systems"
      className="group text-foreground mt-10 inline-flex items-center gap-2 text-sm underline underline-offset-4"
    >
      See all six in detail
      <ArrowRight
        className="size-3.5 transition-transform group-hover:translate-x-0.5"
        aria-hidden
      />
    </Link>
  );
}
