"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

import { CloudinaryImage as Image } from "@/components/media/cloudinary-image";

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
  /** Full-bleed backdrop. Without one the slide falls back to the dark panel. */
  imageUrl?: string | null;
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
    // Full-bleed image panel with the copy overlaid, per the reference.
    // Dark fallback when a slide has no image, so text contrast never depends
    // on whether a photograph loaded.
    <section className="relative isolate h-[clamp(26rem,62vh,38rem)] w-full overflow-hidden bg-neutral-900">
      {slide.imageUrl && (
        <Image
          key={slide.imageUrl}
          src={slide.imageUrl}
          alt=""
          fill
          priority
          sizes="100vw"
          className="object-cover"
        />
      )}
      {/* Left-weighted scrim: keeps the overlaid copy readable over any
          photograph without flattening the whole image. */}
      <div
        aria-hidden
        className="absolute inset-0 bg-gradient-to-r from-black/80 via-black/45 to-black/10"
      />

      <div className="max-w-page relative mx-auto flex h-full flex-col justify-center px-5 sm:px-8 lg:px-16">
        {/* aria-live so a screen reader is told the slide changed, polite so
            it never interrupts whatever is being read. */}
        <div aria-live="polite" aria-atomic="true">
          <p className="text-eyebrow text-white/70">{slide.eyebrow}</p>
          <h1 className="font-heading text-display mt-5 max-w-[18ch] text-balance text-white">
            {slide.headline}
          </h1>
          <p className="text-lead mt-5 max-w-xl text-white/80">{slide.body}</p>
        </div>
        <div className="mt-8 flex flex-wrap items-center gap-4">
          <Link
            href={slide.cta.href}
            className="text-foreground inline-flex h-12 items-center bg-white px-6 text-sm font-medium transition-colors hover:bg-white/90"
          >
            {slide.cta.label}
          </Link>
          <Link
            href="/discover"
            className="inline-flex h-12 items-center border border-white/40 px-6 text-sm text-white transition-colors hover:border-white"
          >
            Browse everything
          </Link>
        </div>

        {slides.length > 1 && (
          <div
            role="tablist"
            aria-label="Hero slides"
            className="absolute right-5 bottom-8 flex items-center gap-3 sm:right-8 lg:right-16"
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
                    ? "h-0.5 w-10 bg-white transition-all"
                    : "h-0.5 w-6 bg-white/40 transition-all hover:bg-white/70"
                }
              />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
