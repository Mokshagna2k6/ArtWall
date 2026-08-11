import Link from "next/link";
import { ArrowDown } from "lucide-react";

import { primaryCta } from "@/config/nav";
import { UnlitWall } from "@/features/hero/unlit-wall";
import { Magnetic } from "@/shared/magnetic";

/**
 * The first five seconds.
 *
 * The whole section is a Server Component; the hero is intentionally calm,
 * editorial, and anchored by a sculptural wall surface. It should feel refined
 * while loading immediately and cleanly.
 */
export function Hero() {
  return (
    <section id="top" className="bg-background relative overflow-hidden">
      <UnlitWall />

      <div className="max-w-wall relative mx-auto px-5 py-24 sm:px-6 lg:px-12 lg:py-32">
        <div className="section-split gap-14">
          <div className="flex flex-col justify-center gap-8">
            <span className="desktop-pill">
              A gallery-calibre home for your practice
            </span>

            <div className="max-w-2xl space-y-6">
              <h1 className="font-heading text-display-s text-foreground tracking-tight sm:text-[4.5rem]">
                Show your work with the care it deserves.
              </h1>
              <p className="text-body-lg text-muted-foreground leading-9">
                ArtWall is a warm, curated platform for Indian artists to
                catalogue, certify, and present their work — not as a listing,
                but as a living, owned story.
              </p>
            </div>

            <div className="flex flex-wrap gap-4">
              <Magnetic>
                <Link
                  href={primaryCta.href}
                  className="bg-ember text-body text-wall-paper inline-flex h-14 items-center rounded-full px-6 font-semibold transition duration-200 ease-out hover:bg-[color:var(--color-ember)]/90"
                >
                  {primaryCta.label}
                </Link>
              </Magnetic>

              <Link
                href="/wall"
                className="border-border bg-background text-body text-foreground hover:border-ember hover:text-foreground inline-flex h-14 items-center rounded-full border px-6 transition-colors"
              >
                View the wall
              </Link>
            </div>

            <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
              <div className="border-border bg-wall-elevated shadow-soft rounded-3xl border p-6">
                <p className="text-label text-muted-foreground tracking-[0.18em] uppercase">
                  Founding artists
                </p>
                <p className="text-h4 font-heading text-foreground mt-3">
                  A numbered place on the first wall, before launch.
                </p>
              </div>
              <div className="border-border bg-wall-elevated shadow-soft rounded-3xl border p-6">
                <p className="text-label text-muted-foreground tracking-[0.18em] uppercase">
                  Gallery first
                </p>
                <p className="text-h4 font-heading text-foreground mt-3">
                  Every work is shown in a calm, editorial layout that lets the
                  artwork breathe.
                </p>
              </div>
            </div>
          </div>

          <div className="space-y-6">
            <div className="hero-surface p-6 sm:p-8">
              <div className="hero-figure via-wall-elevated to-wall-paper relative bg-gradient-to-br from-amber-100">
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_25%_25%,rgba(255,255,255,0.55),transparent_18%),radial-gradient(circle_at_85%_75%,rgba(168,123,79,0.14),transparent_24%)] opacity-90" />
                <div className="absolute inset-x-6 bottom-6 h-16 rounded-[1.4rem] border border-white/80 bg-white/20 backdrop-blur-sm" />
              </div>
              <div className="mt-6 space-y-4">
                <p className="text-label text-muted-foreground tracking-[0.18em] uppercase">
                  Featured work
                </p>
                <h2 className="font-heading text-foreground text-3xl">
                  A quiet composition of clay, light, and lineage.
                </h2>
                <p className="text-body text-muted-foreground">
                  A piece like this needs a space that feels calm, clean, and
                  built around its presence.
                </p>
              </div>
            </div>

            <div className="border-border bg-wall-elevated shadow-soft rounded-[2rem] border p-6">
              <div className="flex items-center gap-4">
                <div className="bg-wall-paper text-muted-foreground rounded-2xl px-3 py-2 text-xs tracking-[0.24em] uppercase">
                  Curated practice
                </div>
                <div className="text-muted-foreground text-sm">
                  Designed to feel editorial, not transactional.
                </div>
              </div>
              <div className="mt-6 grid gap-4 sm:grid-cols-2">
                <div className="bg-background space-y-2 rounded-3xl p-4">
                  <p className="text-label text-muted-foreground tracking-[0.18em] uppercase">
                    Artist
                  </p>
                  <p className="text-foreground font-semibold">Aarav Sharma</p>
                </div>
                <div className="bg-background space-y-2 rounded-3xl p-4">
                  <p className="text-label text-muted-foreground tracking-[0.18em] uppercase">
                    Medium
                  </p>
                  <p className="text-foreground font-semibold">Mixed media</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <a
        href="#rooms"
        aria-label="Explore what's here"
        className="text-muted-foreground hover:text-foreground absolute bottom-10 left-1/2 -translate-x-1/2 transition-colors"
      >
        <ArrowDown className="size-5 motion-safe:animate-bounce" aria-hidden />
      </a>
    </section>
  );
}
