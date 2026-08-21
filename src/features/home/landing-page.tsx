import Link from "next/link";
import { ArrowUpRight } from "lucide-react";

import { painStages, stats, testimonials } from "@/config/content";
import { siteConfig } from "@/config/site";
import { ArtworkBand } from "@/features/home/artwork-band";
import { Assurances } from "@/features/home/assurances";
import { Audiences } from "@/features/home/audiences";
import {
  ServiceCards,
  ServicesFooterLink,
} from "@/features/home/service-cards";
import { StatsBar } from "@/features/home/stats-bar";
import { LivingMap } from "@/features/india/living-map";
import { PainStages } from "@/features/platform/pain-stages";
import { getCityStats, getLitCities } from "@/features/waitlist/roster";
import {
  Band,
  ChapterNumeral,
  Container,
  Eyebrow,
  Section,
} from "@/shared/editorial";

/**
 * The home page.
 *
 * Structure follows the argument rather than a template: what this is, the
 * scale of the problem, the six systems, who it serves, what people say, and
 * the way in. Each chapter is separated by a hairline instead of a coloured
 * band, so the page reads as one continuous white wall.
 *
 * Server Component throughout except the audience tabs and the map, which are
 * the only things here that need state.
 *
 * Async because the Living Map reads which cities already have a founding
 * artist. That query is cached against the roster tag, so it costs one round
 * trip per revalidation rather than one per visitor.
 */
export async function LandingPage() {
  // Both are cached on the roster tag, so a new artist lights their city and
  // updates its figures in the same invalidation.
  const [litCities, cityStats] = await Promise.all([
    getLitCities(),
    getCityStats(),
  ]);

  return (
    <div className="bg-background">
      {/* ── Hero ─────────────────────────────────────────────────────── */}
      {/* Typographic and full width. A gallery announces a show with a wall
          text, not a carousel, the statement is the whole first screen, and
          the supporting line sits opposite it rather than beneath, so the eye
          crosses the page instead of running down a single column. */}
      <section className="pt-32 pb-16 sm:pt-40 sm:pb-20 lg:pt-48 lg:pb-24">
        <div className="max-w-page mx-auto px-5 sm:px-8 lg:px-16">
          <Eyebrow>Every wall, an exhibition</Eyebrow>
          <h1 className="font-heading text-display mt-8 max-w-[16ch] text-balance">
            India&apos;s art operating system.
          </h1>

          <div className="border-border mt-14 grid gap-10 border-t pt-10 lg:grid-cols-[1.1fr_0.9fr] lg:gap-20">
            <p className="text-lead max-w-2xl">
              Six integrated systems: artist registry, exhibition engine,
              provenance and certification, a fair marketplace, a nine-layer
              anti-fraud engine, and patented demand-triggered sale, built for
              seven million Indian artisans.
            </p>

            <div>
              <div className="flex flex-wrap gap-3">
                <Link
                  href="/join"
                  className="bg-foreground inline-flex h-11 items-center px-5 text-sm font-medium text-white transition-colors hover:bg-[#2b3245]"
                >
                  Join the Wall
                </Link>
                <Link
                  href="/platform"
                  className="border-border hover:border-foreground inline-flex h-11 items-center px-5 text-sm font-medium transition-colors"
                >
                  Explore the platform
                </Link>
              </div>
              <p className="text-muted-foreground mt-7 max-w-md text-sm leading-7">
                <span className="text-foreground font-medium">
                  First 10,000 artists = Founding Members.
                </span>{" "}
                We are building ArtWall with our founding community. Shape the
                platform and carry the badge forever.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ── The wall itself ──────────────────────────────────────────── */}
      {/* Full-bleed and immediately after the headline: the first thing you
          should meet on an art platform is the art, not another paragraph. */}
      <ArtworkBand />

      {/* ── Stats bar ───────────────────────────────────────────────── */}
      {/* Five figures on a quiet band, right after the art: the scale
          of the opportunity is the second thing you see. */}
      <StatsBar />

      {/* Placed before the argument, not after it. Someone deciding whether to
          upload a painting needs the rights question answered first. */}
      {/* ── The three promises ───────────────────────────────────────── */}
      <Band id="assurances">
        <Assurances />
      </Band>

      {/* ── What this is ─────────────────────────────────────────────── */}
      <Section id="what-is-artwall">
        <div className="flex items-baseline gap-6">
          <Eyebrow index="01">What is ArtWall</Eyebrow>
          <ChapterNumeral className="ml-auto hidden lg:block">
            01
          </ChapterNumeral>
        </div>
        <div className="mt-10 grid gap-10 lg:grid-cols-[0.85fr_1.15fr] lg:gap-24">
          <h2 className="font-heading text-section text-balance">
            The infrastructure behind a fairer art economy.
          </h2>
          <div className="text-muted-foreground text-lead space-y-5">
            <p>
              India has 42 million artists and artisans. Most never see fair
              value for their work: middlemen can absorb up to 85% of what a
              buyer pays, forgeries move freely, and a first-time collector has
              little reason to trust what they find.
            </p>
            <p>
              ArtWall Labs exists to change that. We are building a
              creator-first platform where original work is discovered,
              protected, and fairly exchanged, and where the record of a piece
              outlives the sale.
            </p>
          </div>
        </div>
      </Section>

      {/* ── Services ─────────────────────────────────────────────────── */}
      <Section id="services">
        <div className="flex items-baseline gap-6">
          <Eyebrow index="02">Services</Eyebrow>
          <ChapterNumeral className="ml-auto hidden lg:block">
            02
          </ChapterNumeral>
        </div>
        <div className="mt-10 max-w-3xl">
          <h2 className="font-heading text-section text-balance">
            Six integrated systems. One platform.
          </h2>
          <p className="text-muted-foreground text-lead mt-5">
            Every stage of the life of an artwork, from creation to legacy. Each
            system is useful alone and stronger because the others are there.
          </p>
        </div>

        {/* Boxes rather than rows. Six systems read as six things when each
            one has its own edges; as a list they read as one long spec. */}
        <div className="mt-12">
          <ServiceCards />
        </div>

        <ServicesFooterLink />
      </Section>

      {/* ── Why ArtWall Labs ─────────────────────────────────────────── */}
      {/* The problem, after the solution. Leading with twenty-four failures
          is a wall of bad news; leading with the six systems earns the right
          to explain what each one is actually for. */}
      <Section id="why">
        <div className="flex items-baseline gap-6">
          <Eyebrow index="03">Why ArtWall Labs</Eyebrow>
          <ChapterNumeral className="ml-auto hidden lg:block">
            03
          </ChapterNumeral>
        </div>
        <div className="mt-10 max-w-3xl">
          <h2 className="font-heading text-section text-balance">
            Twenty-four failures across six stages. All answered.
          </h2>
          <p className="text-muted-foreground text-lead mt-5">
            India has 42 million artists and a ₹30,000 crore market with no
            integrated infrastructure underneath it. These are the failures that
            compound, stage by stage.
          </p>
        </div>
        <div className="mt-12">
          <PainStages stages={painStages} />
        </div>
      </Section>

      {/* ── Who it is for ────────────────────────────────────────────── */}
      <Section id="for">
        <div className="flex items-baseline gap-6">
          <Eyebrow index="04">ArtWall for</Eyebrow>
          <ChapterNumeral className="ml-auto hidden lg:block">
            04
          </ChapterNumeral>
        </div>
        <div className="mt-10 max-w-3xl">
          <h2 className="font-heading text-section text-balance">
            One platform, read three ways.
          </h2>
          <p className="text-muted-foreground text-lead mt-5">
            An artist, a gallery and a collector want different things from the
            same six systems. Here is what each of them gets.
          </p>
        </div>
        <div className="mt-12">
          <Audiences />
        </div>
      </Section>

      {/* ── The living map ───────────────────────────────────────────── */}
      <Section id="living-map">
        <div className="flex items-baseline gap-6">
          <Eyebrow index="05">Living map</Eyebrow>
          <ChapterNumeral className="ml-auto hidden lg:block">
            05
          </ChapterNumeral>
        </div>
        <div className="mt-10 max-w-3xl">
          <h2 className="font-heading text-section text-balance">
            A country that lights up one artist at a time.
          </h2>
          <p className="text-muted-foreground text-lead mt-5">
            Twenty-two cities with traditions worth the world&apos;s attention.
            Each one stays dark until an artist from there takes a place on the
            wall.
          </p>
        </div>
        {/* Full width now that the map carries real figures — squeezed into a
            side column the city panel had no room to say anything. */}
        <div className="mt-12">
          <LivingMap litCities={litCities} cityStats={cityStats} />
        </div>
      </Section>

      {/* ── Testimonials ─────────────────────────────────────────────── */}
      {/* On the quiet band rather than plain white. One tonal shift halfway
          down keeps a monochrome page from reading as one endless sheet. */}
      <Band id="testimonials">
        <Eyebrow index="06">What our community says</Eyebrow>
        <div className="border-border mt-12 grid gap-px border-t md:grid-cols-3">
          {testimonials.map((testimonial) => (
            <figure
              key={testimonial.attribution}
              className="border-border flex flex-col justify-between gap-8 border-b py-10 md:border-r md:px-8 md:first:pl-0 md:last:border-r-0 md:last:pr-0"
            >
              <blockquote className="font-heading text-card leading-[1.55] italic text-balance">
                &ldquo;{testimonial.quote}&rdquo;
              </blockquote>
              <figcaption className="flex items-center gap-3">
                <span
                  aria-hidden
                  className="bg-foreground flex size-9 shrink-0 items-center justify-center rounded-full text-xs font-medium text-white"
                >
                  {testimonial.attribution
                    .split(" ")
                    .map((w) => w[0])
                    .join("")
                    .slice(0, 2)
                    .toUpperCase()}
                </span>
                <div>
                  <span className="block text-sm font-medium">
                    {testimonial.attribution}
                  </span>
                  <span className="text-muted-foreground block text-sm">
                    {testimonial.context}
                  </span>
                </div>
              </figcaption>
            </figure>
          ))}
        </div>
      </Band>

      {/* ── The way in ───────────────────────────────────────────────── */}
      <Section id="join">
        <div className="flex items-baseline gap-6">
          <Eyebrow index="07">Take your place</Eyebrow>
          <ChapterNumeral className="ml-auto hidden lg:block">
            07
          </ChapterNumeral>
        </div>
        <div className="mt-10 grid gap-14 lg:grid-cols-2 lg:gap-24">
          <div>
            <h2 className="font-heading text-section text-balance">
              This wall gets better with more voices on it.
            </h2>
            <p className="text-muted-foreground text-lead mt-5 max-w-xl">
              ArtWall is not being built from a distance. Take a place, tell us
              what needs to work better, and help decide what a trusted art
              economy should feel like.
            </p>
            <p className="text-muted-foreground mt-6 max-w-xl text-sm leading-7">
              {siteConfig.credentials.recognition}.
            </p>
          </div>

          <div className="border-border border p-8 sm:p-10">
            <ul>
              {[
                {
                  href: "/wall",
                  title: "The Wall",
                  detail:
                    "Meet the founding artists and hang your own work beside them.",
                },
                {
                  href: "/community#archetype",
                  title: "The Archetype",
                  detail:
                    "How much do you know about art? Five questions, two minutes.",
                },
                {
                  href: "/survey",
                  title: "The Survey",
                  detail:
                    "Tell us which of the twenty-four failures you have lived through.",
                },
                {
                  href: "/community",
                  title: "The Community",
                  detail:
                    "Indiagrapher: chapters, spotlights, and people who show up in person.",
                },
              ].map((item) => (
                <li key={item.href} className="border-border border-b last:border-b-0">
                  <Link
                    href={item.href}
                    className="group flex items-start justify-between gap-6 py-6 transition-colors"
                  >
                    <div>
                      <h3 className="font-heading text-subsection transition-opacity group-hover:opacity-60">
                        {item.title}
                      </h3>
                      <p className="text-muted-foreground mt-2 max-w-sm leading-7">
                        {item.detail}
                      </p>
                    </div>
                    <ArrowUpRight
                      className="mt-1.5 size-5 shrink-0 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
                      aria-hidden
                    />
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </Section>
    </div>
  );
}
