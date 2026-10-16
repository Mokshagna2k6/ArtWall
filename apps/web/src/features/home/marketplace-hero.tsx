"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

/**
 * The marketplace hero, per CHANGES-PLAN.md §2.1: rotating editorial slides
 * with one CTA each, on the existing display type scale (`font-heading`,
 * `text-display`).
 *
 * The first slide is server-rendered as the LCP element and the rotation only
 * starts after hydration, so the largest text on the page never fades in and
 * we never measure our own paint as slower than it is (same reasoning as the
 * Services page's unanimated headline).
 *
 * Rotation stops permanently once a visitor picks a slide: an auto-advance
 * that fights the person using it is worse than none. It also respects
 * `prefers-reduced-motion`, where it does not start at all.
 */

export interface HeroSlide {
  eyebrow: string;
  headline: string;
  body: string;
  cta: { label: string; href: string };
}

const ROTATE_MS = 7000;

export function MarketplaceHero({ slides }: { slides: readonly HeroSlide[] }) {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    if (paused || slides.length < 2) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const id = setInterval(
      () => setIndex((i) => (i + 1) % slides.length),
      ROTATE_MS
    );
    return () => clearInterval(id);
  }, [paused, slides.length]);

  const slide = slides[index] ?? slides[0];
  if (!slide) return null;

  return (
    <section className="pt-32 pb-16 sm:pt-40 sm:pb-20 lg:pt-44 lg:pb-24">
      <div className="max-w-page mx-auto px-5 sm:px-8 lg:px-16">
        {/* aria-live so a screen reader is told the slide changed, polite so
            it never interrupts whatever is being read. */}
        <div aria-live="polite" aria-atomic="true">
          <p className="text-muted-foreground text-eyebrow">{slide.eyebrow}</p>
          <h1 className="font-heading text-display mt-6 max-w-[20ch] text-balance">
            {slide.headline}
          </h1>
          <p className="text-muted-foreground text-lead mt-6 max-w-2xl">
            {slide.body}
          </p>
        </div>
        <div className="mt-10 flex flex-wrap items-center gap-4">
          <Link
            href={slide.cta.href}
            className="bg-foreground inline-flex h-12 items-center px-6 text-sm font-medium text-white transition-colors duration-200 hover:bg-[#2b3245]"
          >
            {slide.cta.label}
          </Link>
          <Link
            href="/discover"
            className="border-border hover:border-foreground inline-flex h-12 items-center border px-6 text-sm transition-colors"
          >
            Browse everything
          </Link>
        </div>

        {slides.length > 1 && (
          <div
            role="tablist"
            aria-label="Hero slides"
            className="mt-12 flex items-center gap-3"
          >
            {slides.map((s, i) => (
              <button
                key={s.headline}
                type="button"
                role="tab"
                aria-selected={i === index}
                aria-label={s.eyebrow}
                onClick={() => {
                  setIndex(i);
                  setPaused(true);
                }}
                className={
                  i === index
                    ? "bg-foreground h-px w-10 transition-all"
                    : "bg-border hover:bg-muted-foreground h-px w-6 transition-all"
                }
              />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
